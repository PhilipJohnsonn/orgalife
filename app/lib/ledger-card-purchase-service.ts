import { Prisma } from "@/app/generated/prisma/client";
import type { CardPurchaseCommand } from "@/app/lib/finance-v1-contracts";
import { parseCivilDate, validateBalancedPostings } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export type CardPurchaseErrorCode =
  | "CARD_GROUP_NOT_FOUND"
  | "CARD_ACCOUNT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND";

export class CardPurchaseError extends Error {
  readonly code: CardPurchaseErrorCode;
  readonly status: 404 | 422;

  constructor(
    code: CardPurchaseErrorCode,
    status: 404 | 422,
    message: string
  ) {
    super(message);
    this.name = "CardPurchaseError";
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

/** A card purchase recorded at the moment, in the billed currency. */
export async function recordCardPurchase(command: CardPurchaseCommand) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
    });
    if (existing) return existing;
    const cardGroup = await transaction.accountGroup.findFirst({
      where: { id: command.cardGroupId, type: "CARD", isActive: true },
    });
    if (!cardGroup) {
      throw new CardPurchaseError(
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
      throw new CardPurchaseError(
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
        throw new CardPurchaseError(
          "CATEGORY_NOT_FOUND",
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
