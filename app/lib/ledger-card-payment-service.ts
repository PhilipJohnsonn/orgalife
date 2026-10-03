import type { Prisma } from "@/app/generated/prisma/client";
import {
  CARD_DIFFERENCE_CATEGORY_NAME,
  CardPaymentError,
  cardDebtAtClosing,
  statementDifference,
  type CardLiabilityPosting,
  type CardPaymentCommand,
} from "@/app/lib/finance-card-payment";
import { ensureFlowAccount } from "@/app/lib/ledger-cash-flow-service";
import { parseCivilDate, validateBalancedPostings, type PostingDraft } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

async function loadCard(transaction: Prisma.TransactionClient, cardGroupId: string) {
  const card = await transaction.accountGroup.findFirst({
    where: { id: cardGroupId, type: "CARD", isActive: true },
    include: {
      accounts: { where: { kind: "LIABILITY", subtype: "CARD", isActive: true }, orderBy: { currency: "asc" } },
    },
  });
  if (!card) throw new CardPaymentError("CARD_NOT_FOUND", 404, "La tarjeta no existe");
  return card;
}

/** Card liability postings still in effect; reversed entries and their reversals cancel out. */
async function liabilityPostings(
  transaction: Prisma.TransactionClient,
  ledgerAccountId: string
): Promise<CardLiabilityPosting[]> {
  const postings = await transaction.posting.findMany({
    where: {
      ledgerAccountId,
      journalEntry: { status: "POSTED", operationType: { not: "REVERSAL" } },
    },
    include: { journalEntry: { select: { occurredOn: true, operationType: true, metadata: true } } },
  });
  return postings.map((posting) => {
    const metadata = posting.journalEntry.metadata as { cardStatementDifference?: boolean } | null;
    return {
      side: posting.side,
      amount: posting.amount.toFixed(2),
      occurredOn: posting.journalEntry.occurredOn.toISOString().slice(0, 10),
      settlement:
        posting.journalEntry.operationType === "CARD_PAYMENT" || Boolean(metadata?.cardStatementDifference),
    };
  });
}

/** Debt per currency for the statement closed on `closingOn`, to preview a full payment. */
export async function getCardDebts(cardGroupId: string, closingOn: string) {
  parseCivilDate(closingOn);
  return prisma.$transaction(async (transaction) => {
    const card = await loadCard(transaction, cardGroupId);
    const currencies = [];
    for (const account of card.accounts) {
      currencies.push({
        currency: account.currency.trim(),
        debtAtClosing: cardDebtAtClosing(await liabilityPostings(transaction, account.id), closingOn),
      });
    }
    return { cardGroupId: card.id, name: card.name, closingOn, currencies };
  });
}

async function ensureDifferenceCategory(transaction: Prisma.TransactionClient) {
  const existing = await transaction.category.findFirst({
    where: { name: { equals: CARD_DIFFERENCE_CATEGORY_NAME, mode: "insensitive" } },
  });
  return existing ?? transaction.category.create({ data: { name: CARD_DIFFERENCE_CATEGORY_NAME, color: "#F59E0B" } });
}

function createEntry(
  transaction: Prisma.TransactionClient,
  data: {
    operationType: "CARD_PAYMENT" | "CARD_PURCHASE";
    occurredOn: Date;
    description: string;
    idempotencyKey: string;
    metadata: Prisma.InputJsonObject;
    postings: PostingDraft[];
  }
) {
  const balanced = validateBalancedPostings(data.postings);
  return transaction.journalEntry.create({
    data: {
      operationType: data.operationType,
      source: "MANUAL",
      occurredOn: data.occurredOn,
      description: data.description,
      idempotencyKey: data.idempotencyKey,
      metadata: data.metadata,
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
 * "Pagar tarjeta": one CARD_PAYMENT per billed currency (an asset of the same
 * currency to the card). With `closingOn` the payment covers that whole
 * statement, so what was paid minus the debt recorded up to the closing is
 * booked as a card charge in "Tarjeta: cambio y cargos" (negative when the
 * bank charged less). Idempotent on `idempotencyKey`.
 */
export async function recordCardPayment(command: CardPaymentCommand) {
  const occurredOn = parseCivilDate(command.occurredOn);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: `${command.idempotencyKey}:${command.payments[0].currency}` },
    });
    if (existing) return { replayed: true, payments: [] };

    const card = await loadCard(transaction, command.cardGroupId);
    const results = [];
    for (const payment of command.payments) {
      const liability = card.accounts.find((account) => account.currency.trim() === payment.currency);
      if (!liability) {
        throw new CardPaymentError("CARD_CURRENCY_NOT_FOUND", 422, `${card.name} no tiene cuenta en ${payment.currency}`);
      }
      const source = await transaction.ledgerAccount.findUnique({ where: { id: payment.sourceAccountId } });
      if (!source || !source.isActive || source.isSystem || source.personId || source.kind !== "ASSET") {
        throw new CardPaymentError("SOURCE_ACCOUNT_INVALID", 422, "Elegí una cuenta propia activa para pagar");
      }
      if (source.currency.trim() !== payment.currency) {
        throw new CardPaymentError(
          "SOURCE_CURRENCY_MISMATCH",
          422,
          `El pago en ${payment.currency} tiene que salir de una cuenta en ${payment.currency}`
        );
      }

      const debtAtClosing = command.closingOn
        ? cardDebtAtClosing(await liabilityPostings(transaction, liability.id), command.closingOn)
        : null;
      const metadata = { cardGroupId: card.id, ...(command.closingOn ? { closingOn: command.closingOn } : {}) };

      const paymentEntry = await createEntry(transaction, {
        operationType: "CARD_PAYMENT",
        occurredOn,
        description: `Pago ${card.name}`,
        idempotencyKey: `${command.idempotencyKey}:${payment.currency}`,
        metadata,
        postings: [
          { ledgerAccountId: liability.id, currency: payment.currency, side: "DEBIT", amount: payment.amount },
          { ledgerAccountId: source.id, currency: payment.currency, side: "CREDIT", amount: payment.amount },
        ],
      });

      const difference = debtAtClosing === null ? null : statementDifference(payment.amount, debtAtClosing);
      if (difference !== null && Number(difference) !== 0) {
        const expense = await ensureFlowAccount(transaction, "EXPENSE", payment.currency);
        const category = await ensureDifferenceCategory(transaction);
        const charged = Number(difference) > 0;
        const amount = difference.replace("-", "");
        await createEntry(transaction, {
          operationType: "CARD_PURCHASE",
          occurredOn,
          description: `Diferencia resumen ${card.name}`,
          idempotencyKey: `${command.idempotencyKey}:${payment.currency}:difference`,
          metadata: { ...metadata, cardStatementDifference: true, paymentEntryId: paymentEntry.id },
          postings: [
            { ledgerAccountId: expense.id, currency: payment.currency, side: charged ? "DEBIT" : "CREDIT", amount, categoryId: category.id },
            { ledgerAccountId: liability.id, currency: payment.currency, side: charged ? "CREDIT" : "DEBIT", amount },
          ],
        });
      }

      results.push({
        currency: payment.currency,
        entryId: paymentEntry.id,
        amount: payment.amount,
        debtAtClosing,
        difference,
      });
    }
    return { replayed: false, payments: results };
  });
}
