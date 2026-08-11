import { Prisma } from "@/app/generated/prisma/client";
import type { ProvisionalCardPurchaseCommand } from "@/app/lib/finance-v1-contracts";
import { parseCivilDate, validateBalancedPostings } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export type CardProvisionalErrorCode =
  | "CARD_GROUP_NOT_FOUND"
  | "CARD_ACCOUNT_NOT_FOUND"
  | "PROVISIONAL_NOT_FOUND"
  | "PROVISIONAL_NOT_OPEN"
  | "RECONCILIATION_LINE_NOT_FOUND";

export class CardProvisionalError extends Error {
  readonly code: CardProvisionalErrorCode;
  readonly status: 404 | 409 | 422;

  constructor(
    code: CardProvisionalErrorCode,
    status: 404 | 409 | 422,
    message: string
  ) {
    super(message);
    this.name = "CardProvisionalError";
    this.code = code;
    this.status = status;
  }
}

async function ensureExpenseAccount(
  transaction: Prisma.TransactionClient,
  currency: string
) {
  const existing = await transaction.ledgerAccount.findFirst({
    where: { kind: "EXPENSE", subtype: "OTHER", currency, isSystem: true },
  });
  if (existing) return existing;
  return transaction.ledgerAccount.create({
    data: {
      name: `Expense ${currency}`,
      currency,
      kind: "EXPENSE",
      subtype: "OTHER",
      trackingMode: "TRANSACTIONAL",
      isSystem: true,
    },
  });
}

export async function recordProvisionalCardPurchase(
  command: ProvisionalCardPurchaseCommand
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
    });
    if (existing) return existing;
    const cardGroup = await transaction.accountGroup.findFirst({
      where: { id: command.cardGroupId, type: "CARD", isActive: true },
    });
    if (!cardGroup) {
      throw new CardProvisionalError(
        "CARD_GROUP_NOT_FOUND",
        404,
        "Active card group not found"
      );
    }
    const liability = await transaction.ledgerAccount.findFirst({
      where: {
        accountGroupId: cardGroup.id,
        currency: command.currency,
        kind: "LIABILITY",
        subtype: "CARD",
        isActive: true,
      },
    });
    if (!liability) {
      throw new CardProvisionalError(
        "CARD_ACCOUNT_NOT_FOUND",
        422,
        "Create the card account in this currency first"
      );
    }
    if (command.categoryId) {
      const category = await transaction.category.findUnique({
        where: { id: command.categoryId },
      });
      if (!category) {
        throw new CardProvisionalError(
          "RECONCILIATION_LINE_NOT_FOUND",
          404,
          "Category not found"
        );
      }
    }
    const expense = await ensureExpenseAccount(transaction, command.currency);
    const postings = validateBalancedPostings([
      {
        ledgerAccountId: expense.id,
        currency: command.currency,
        side: "DEBIT",
        amount: command.amount,
        categoryId: command.categoryId,
      },
      {
        ledgerAccountId: liability.id,
        currency: command.currency,
        side: "CREDIT",
        amount: command.amount,
      },
    ]);
    return transaction.journalEntry.create({
      data: {
        operationType: "CARD_PURCHASE",
        source: "MANUAL",
        status: "PROVISIONAL",
        occurredOn: parseCivilDate(command.occurredOn),
        description: command.description,
        idempotencyKey: command.idempotencyKey,
        metadata: { cardGroupId: cardGroup.id },
        postings: {
          create: postings.map((posting) => ({
            ledgerAccountId: posting.ledgerAccountId,
            side: posting.side,
            amount: posting.amount,
            categoryId: posting.categoryId,
          })),
        },
      },
    });
  });
}

export async function listProvisionalCardPurchases() {
  const entries = await prisma.journalEntry.findMany({
    where: {
      operationType: "CARD_PURCHASE",
      source: "MANUAL",
      status: { in: ["PROVISIONAL", "SUPERSEDED", "DISMISSED"] },
    },
    include: {
      postings: { include: { ledgerAccount: { include: { accountGroup: true } } } },
      provisionalReconciliations: {
        where: { releasedAt: null },
        include: { statementLine: true },
      },
    },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
  });
  return entries.map((entry) => {
    const cardPosting = entry.postings.find(
      (posting) => posting.ledgerAccount.kind === "LIABILITY"
    );
    return {
      id: entry.id,
      status: entry.status,
      occurredOn: entry.occurredOn.toISOString().slice(0, 10),
      description: entry.description,
      amount: cardPosting?.amount.toFixed(2) ?? "0.00",
      currency: cardPosting?.ledgerAccount.currency.trim() ?? "",
      cardGroup: cardPosting?.ledgerAccount.accountGroup
        ? {
            id: cardPosting.ledgerAccount.accountGroup.id,
            name: cardPosting.ledgerAccount.accountGroup.name,
          }
        : null,
      matchedLineIds: entry.provisionalReconciliations.map(
        (reconciliation) => reconciliation.statementLineId
      ),
    };
  });
}

export async function dismissProvisionalCardPurchase(input: {
  entryId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new CardProvisionalError(
      "PROVISIONAL_NOT_OPEN",
      422,
      "A dismissal reason is required"
    );
  }
  return prisma.$transaction(async (transaction) => {
    const entry = await transaction.journalEntry.findUnique({
      where: { id: input.entryId },
    });
    if (!entry || entry.operationType !== "CARD_PURCHASE" || entry.source !== "MANUAL") {
      throw new CardProvisionalError(
        "PROVISIONAL_NOT_FOUND",
        404,
        "Provisional card purchase not found"
      );
    }
    if (entry.status !== "PROVISIONAL") {
      throw new CardProvisionalError(
        "PROVISIONAL_NOT_OPEN",
        409,
        "Only an open provisional purchase can be dismissed"
      );
    }
    return transaction.journalEntry.update({
      where: { id: entry.id },
      data: {
        status: "DISMISSED",
        metadata: { dismissedReason: reason },
      },
    });
  });
}

export async function supersedeProvisionalCardPurchase(input: {
  entryId: string;
  statementLineIds: string[];
}) {
  const lineIds = [...new Set(input.statementLineIds.map((value) => value.trim()))]
    .filter(Boolean);
  if (lineIds.length === 0) {
    throw new CardProvisionalError(
      "RECONCILIATION_LINE_NOT_FOUND",
      422,
      "At least one statement line is required"
    );
  }
  return prisma.$transaction(async (transaction) => {
    const entry = await transaction.journalEntry.findUnique({
      where: { id: input.entryId },
      include: { postings: { include: { ledgerAccount: true } } },
    });
    if (!entry || entry.operationType !== "CARD_PURCHASE" || entry.source !== "MANUAL") {
      throw new CardProvisionalError(
        "PROVISIONAL_NOT_FOUND",
        404,
        "Provisional card purchase not found"
      );
    }
    if (entry.status !== "PROVISIONAL") {
      throw new CardProvisionalError(
        "PROVISIONAL_NOT_OPEN",
        409,
        "Only an open provisional purchase can be reconciled"
      );
    }
    const cardGroupId = entry.postings.find(
      (posting) => posting.ledgerAccount.kind === "LIABILITY"
    )?.ledgerAccount.accountGroupId;
    if (!cardGroupId) {
      throw new CardProvisionalError(
        "CARD_GROUP_NOT_FOUND",
        404,
        "The provisional purchase is not linked to a card group"
      );
    }
    const lines = await transaction.ledgerCardStatementLine.findMany({
      where: {
        id: { in: lineIds },
        statement: { cardGroupId, status: "CONFIRMED" },
      },
    });
    if (lines.length !== lineIds.length) {
      throw new CardProvisionalError(
        "RECONCILIATION_LINE_NOT_FOUND",
        404,
        "One or more confirmed statement lines were not found for this card"
      );
    }
    await transaction.cardReconciliation.createMany({
      data: lineIds.map((statementLineId) => ({
        provisionalEntryId: entry.id,
        statementLineId,
      })),
    });
    return transaction.journalEntry.update({
      where: { id: entry.id },
      data: {
        status: "SUPERSEDED",
        metadata: { manuallySupersededByLineIds: lineIds },
      },
    });
  });
}
