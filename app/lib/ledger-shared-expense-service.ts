import type { Prisma } from "@/app/generated/prisma/client";
import { PersonError, assertSettlementFits, type PersonSettlementCommand } from "@/app/lib/finance-people";
import { balancesByPerson } from "@/app/lib/finance-person-service";
import { ensureFlowAccount } from "@/app/lib/ledger-cash-flow-service";
import { reverseJournalEntryInTransaction } from "@/app/lib/ledger-service";
import { ensureFxClearingAccount } from "@/app/lib/ledger-transfer-service";
import { LedgerInvariantError, parseCivilDate, validateBalancedPostings, type PostingDraft } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";
import { SharedExpenseError, splitSharedExpense, type SharedExpenseCommand, type SplitInput } from "@/app/lib/shared-expense";

/** One RECEIVABLE/PERSON account per person and currency, created the first time it's needed. */
async function ensurePersonAccount(
  transaction: Prisma.TransactionClient,
  person: { id: string; name: string },
  currency: string
) {
  const existing = await transaction.ledgerAccount.findUnique({
    where: { personId_currency: { personId: person.id, currency } },
  });
  if (existing) return existing;
  return transaction.ledgerAccount.create({
    data: {
      name: `${person.name} ${currency}`,
      currency,
      kind: "RECEIVABLE",
      subtype: "PERSON",
      trackingMode: "TRANSACTIONAL",
      personId: person.id,
    },
  });
}

/** Your active asset account, or a card when `allowCard` (a card purchase is paying too). */
async function loadOwnAccount(transaction: Prisma.TransactionClient, accountId: string, allowCard: boolean) {
  const account = await transaction.ledgerAccount.findUnique({ where: { id: accountId } });
  const isCard = account?.kind === "LIABILITY" && account.subtype === "CARD";
  if (!account || !account.isActive || account.isSystem || account.personId || !(account.kind === "ASSET" || (allowCard && isCard))) {
    throw new LedgerInvariantError("LEDGER_INVALID_ACCOUNT_KIND", allowCard ? "Elegí una cuenta o tarjeta propia activa" : "Elegí una cuenta propia activa");
  }
  return account;
}

/**
 * Records a shared expense: only your part is an expense. What you paid for
 * others is owed to you on their person account; when someone else paid,
 * your part is owed to them. Idempotent on `idempotencyKey`.
 */
export async function recordSharedExpense(command: SharedExpenseCommand) {
  return prisma.$transaction((transaction) => recordSharedExpenseInTransaction(transaction, command));
}

async function recordSharedExpenseInTransaction(
  transaction: Prisma.TransactionClient,
  command: SharedExpenseCommand,
  extraMetadata: Record<string, string> = {}
) {
  const occurredOn = parseCivilDate(command.occurredOn);
  const shares = splitSharedExpense(command.amount, command.split);
  const existing = await transaction.journalEntry.findFirst({
    where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
  });
  if (existing) return existing;

  const payerPersonId = "personId" in command.paidBy ? command.paidBy.personId : null;
  const personIds = [...new Set([...shares.people.map((share) => share.personId), ...(payerPersonId ? [payerPersonId] : [])])];
  const people = await transaction.person.findMany({ where: { id: { in: personIds }, archivedAt: null } });
  if (people.length !== personIds.length) {
    throw new PersonError("PERSON_NOT_FOUND", 422, "Alguna de las personas no existe o está archivada");
  }
  const personById = new Map(people.map((person) => [person.id, person]));

  if (command.categoryId) {
    const category = await transaction.category.findUnique({ where: { id: command.categoryId }, select: { id: true } });
    if (!category) throw new LedgerInvariantError("LEDGER_ENTRY_NOT_FOUND", `Category not found: ${command.categoryId}`);
  }

  const postings: PostingDraft[] = [];
  let currency: string;
  if ("accountId" in command.paidBy) {
    // Paid by you: the debt stays in the currency of the account that moved.
    const account = await loadOwnAccount(transaction, command.paidBy.accountId, true);
    currency = account.currency.trim();
    postings.push({ ledgerAccountId: account.id, currency, side: "CREDIT", amount: command.amount });
    for (const share of shares.people) {
      if (Number(share.amount) === 0) continue;
      const personAccount = await ensurePersonAccount(transaction, personById.get(share.personId)!, currency);
      postings.push({ ledgerAccountId: personAccount.id, currency, side: "DEBIT", amount: share.amount });
    }
  } else {
    // Paid by someone else: only your part is recorded, owed to them in the currency they paid.
    currency = command.paidBy.currency;
    const enabled = await transaction.enabledCurrency.findUnique({ where: { code: currency } });
    if (!enabled) throw new SharedExpenseError("CURRENCY_NOT_ENABLED", `${currency} no está habilitada en Ajustes`);
    if (Number(shares.me) === 0) {
      throw new SharedExpenseError("SPLIT_NOTHING_TO_RECORD", "Si pagó otro, tu parte tiene que ser mayor a 0");
    }
    const payerAccount = await ensurePersonAccount(transaction, personById.get(payerPersonId!)!, currency);
    postings.push({ ledgerAccountId: payerAccount.id, currency, side: "CREDIT", amount: shares.me });
  }

  if (Number(shares.me) > 0) {
    const expenseAccount = await ensureFlowAccount(transaction, "EXPENSE", currency);
    postings.push({
      ledgerAccountId: expenseAccount.id,
      currency,
      side: "DEBIT",
      amount: shares.me,
      categoryId: command.categoryId,
    });
  }

  const balanced = validateBalancedPostings(postings);
  return transaction.journalEntry.create({
    data: {
      operationType: "SHARED_EXPENSE",
      source: "MANUAL",
      occurredOn,
      description: command.description,
      idempotencyKey: command.idempotencyKey,
      metadata: {
        total: command.amount,
        currency,
        paidBy: command.paidBy,
        split: { mode: command.split.mode, me: shares.me, people: shares.people },
        ...(command.original ? { original: command.original } : {}),
        ...extraMetadata,
      },
      postings: {
        create: balanced.map((posting) => ({
          ledgerAccountId: posting.ledgerAccountId,
          side: posting.side,
          amount: posting.amount,
          categoryId: posting.categoryId,
        })),
      },
    },
  });
}

/**
 * Settles a person's balance from one of your accounts. Same currency moves
 * account ↔ person directly; another currency goes through FX clearing with
 * both amounts, like an FX operation. Neither income nor expense.
 */
export async function recordPersonSettlement(command: PersonSettlementCommand) {
  const occurredOn = parseCivilDate(command.occurredOn);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
    });
    if (existing) return existing;

    const person = await transaction.person.findUnique({ where: { id: command.personId } });
    if (!person || person.archivedAt) throw new PersonError("PERSON_NOT_FOUND", 422, "La persona no existe o está archivada");
    const account = await loadOwnAccount(transaction, command.accountId, false);
    const accountCurrency = account.currency.trim();
    if (command.debt?.currency === accountCurrency) {
      throw new PersonError("INVALID_PAYLOAD", 400, "debt sólo va cuando la deuda está en otra moneda que la cuenta");
    }
    const debt = command.debt ?? { currency: accountCurrency, amount: command.amount };

    const balance = (await balancesByPerson([person.id], transaction))
      .get(person.id)
      ?.find((item) => item.currency === debt.currency)?.balance ?? "0.00";
    assertSettlementFits(person.name, command.direction, debt.currency, balance, debt.amount);

    const personAccount = await ensurePersonAccount(transaction, person, debt.currency);
    const received = command.direction === "RECEIVED";
    const postings: PostingDraft[] = [
      { ledgerAccountId: account.id, currency: accountCurrency, side: received ? "DEBIT" : "CREDIT", amount: command.amount },
      { ledgerAccountId: personAccount.id, currency: debt.currency, side: received ? "CREDIT" : "DEBIT", amount: debt.amount },
    ];
    if (debt.currency !== accountCurrency) {
      const accountClearing = await ensureFxClearingAccount(transaction, accountCurrency);
      const debtClearing = await ensureFxClearingAccount(transaction, debt.currency);
      postings.push(
        { ledgerAccountId: accountClearing.id, currency: accountCurrency, side: received ? "CREDIT" : "DEBIT", amount: command.amount },
        { ledgerAccountId: debtClearing.id, currency: debt.currency, side: received ? "DEBIT" : "CREDIT", amount: debt.amount }
      );
    }

    const balanced = validateBalancedPostings(postings);
    return transaction.journalEntry.create({
      data: {
        operationType: "PERSON_SETTLEMENT",
        source: "MANUAL",
        occurredOn,
        description: command.description ?? (received ? `${person.name} te pagó` : `Le pagaste a ${person.name}`),
        idempotencyKey: command.idempotencyKey,
        metadata: {
          personId: person.id,
          direction: command.direction,
          accountCurrency,
          accountAmount: command.amount,
          debtCurrency: debt.currency,
          debtAmount: debt.amount,
        },
        postings: {
          create: balanced.map((posting) => ({
            ledgerAccountId: posting.ledgerAccountId,
            side: posting.side,
            amount: posting.amount,
          })),
        },
      },
    });
  });
}

/**
 * "Dividir": turns an expense you already captured (cash or card) into a
 * shared expense. The original is reversed, not mutated, and the shared entry
 * keeps its account, amount, date, description and category. Idempotent per entry.
 */
export async function splitExistingEntry(entryId: string, split: SplitInput) {
  return prisma.$transaction(async (transaction) => {
    const idempotencyKey = `split:${entryId}`;
    const existing = await transaction.journalEntry.findFirst({ where: { source: "MANUAL", idempotencyKey } });
    if (existing) return existing;

    const original = await transaction.journalEntry.findUnique({
      where: { id: entryId },
      include: { postings: { include: { ledgerAccount: true } } },
    });
    if (
      !original ||
      original.source !== "MANUAL" ||
      !["EXPENSE", "CARD_PURCHASE"].includes(original.operationType) ||
      original.status !== "POSTED" ||
      Boolean((original.metadata as { cardStatementDifference?: boolean } | null)?.cardStatementDifference)
    ) {
      throw new SharedExpenseError("ENTRY_NOT_SPLITTABLE", "Sólo se puede dividir un gasto confirmado");
    }
    const payer = original.postings.find((posting) => !posting.ledgerAccount.isSystem && posting.side === "CREDIT");
    const expense = original.postings.find((posting) => posting.ledgerAccount.kind === "EXPENSE");
    if (!payer || !expense || original.postings.length !== 2) {
      throw new SharedExpenseError("ENTRY_NOT_SPLITTABLE", "Este movimiento no se puede dividir");
    }

    await reverseJournalEntryInTransaction(
      transaction,
      { journalEntryId: original.id, description: `Dividido: ${original.description}` },
      original.occurredOn
    );
    return recordSharedExpenseInTransaction(
      transaction,
      {
        amount: payer.amount.toFixed(2),
        occurredOn: original.occurredOn.toISOString().slice(0, 10),
        description: original.description,
        categoryId: expense.categoryId ?? undefined,
        idempotencyKey,
        paidBy: { accountId: payer.ledgerAccountId },
        split,
      },
      { splitOf: original.id }
    );
  });
}
