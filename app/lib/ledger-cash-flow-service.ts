import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  LedgerInvariantError,
  parseCivilDate,
  validateBalancedPostings,
} from "@/app/lib/ledger";
import type { IncomeExpenseCommand } from "@/app/lib/finance-v1-contracts";

async function ensureFlowAccount(
  transaction: Prisma.TransactionClient,
  type: "INCOME" | "EXPENSE",
  currency: string
) {
  const existing = await transaction.ledgerAccount.findFirst({
    where: { kind: type, subtype: "OTHER", currency, isSystem: true },
  });
  if (existing) return existing;

  return transaction.ledgerAccount.create({
    data: {
      name: `${type === "INCOME" ? "Income" : "Expense"} ${currency}`,
      currency,
      kind: type,
      subtype: "OTHER",
      trackingMode: "TRANSACTIONAL",
      isSystem: true,
    },
  });
}

const entryInclude = {
  postings: {
    include: { ledgerAccount: true, category: true },
  },
} satisfies Prisma.JournalEntryInclude;

export async function recordIncomeExpense(input: IncomeExpenseCommand) {
  const occurredOn = parseCivilDate(input.occurredOn);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: input.idempotencyKey },
      include: entryInclude,
    });
    if (existing) return existing;

    const account = await transaction.ledgerAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account) {
      throw new LedgerInvariantError(
        "LEDGER_ACCOUNT_NOT_FOUND",
        `Ledger account not found: ${input.accountId}`
      );
    }
    if (!account.isActive) {
      throw new LedgerInvariantError(
        "LEDGER_ACCOUNT_INACTIVE",
        `Ledger account is inactive: ${input.accountId}`
      );
    }
    if (account.isSystem || account.kind !== "ASSET") {
      throw new LedgerInvariantError(
        "LEDGER_INVALID_ACCOUNT_KIND",
        "Income and expense require an active asset account"
      );
    }

    if (input.categoryId) {
      const category = await transaction.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new LedgerInvariantError(
          "LEDGER_ENTRY_NOT_FOUND",
          `Category not found: ${input.categoryId}`
        );
      }
    }

    const currency = account.currency.trim();
    const flowAccount = await ensureFlowAccount(transaction, input.type, currency);
    const isIncome = input.type === "INCOME";
    const postings = validateBalancedPostings([
      {
        ledgerAccountId: account.id,
        currency,
        side: isIncome ? "DEBIT" : "CREDIT",
        amount: input.amount,
      },
      {
        ledgerAccountId: flowAccount.id,
        currency,
        side: isIncome ? "CREDIT" : "DEBIT",
        amount: input.amount,
        categoryId: input.categoryId,
      },
    ]);

    return transaction.journalEntry.create({
      data: {
        operationType: input.type,
        source: "MANUAL",
        occurredOn,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        postings: {
          create: postings.map((posting) => ({
            ledgerAccountId: posting.ledgerAccountId,
            side: posting.side,
            amount: posting.amount,
            categoryId: posting.categoryId,
          })),
        },
      },
      include: entryInclude,
    });
  });
}

export async function listIncomeExpenses() {
  const entries = await prisma.journalEntry.findMany({
    where: { operationType: { in: ["INCOME", "EXPENSE"] } },
    include: entryInclude,
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
  });

  return entries.map((entry) => {
    const userPosting = entry.postings.find((posting) => !posting.ledgerAccount.isSystem);
    const flowPosting = entry.postings.find((posting) => posting.ledgerAccount.isSystem);
    return {
      id: entry.id,
      type: entry.operationType,
      status: entry.status,
      occurredOn: entry.occurredOn.toISOString().slice(0, 10),
      description: entry.description,
      amount: (userPosting?.amount ?? flowPosting?.amount)?.toFixed(2) ?? "0.00",
      currency: userPosting?.ledgerAccount.currency.trim() ?? "",
      account: userPosting
        ? { id: userPosting.ledgerAccount.id, name: userPosting.ledgerAccount.name }
        : null,
      category: flowPosting?.category
        ? { id: flowPosting.category.id, name: flowPosting.category.name }
        : null,
    };
  });
}
