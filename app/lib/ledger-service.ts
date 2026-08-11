import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  LedgerInvariantError,
  oppositePostingSide,
  parseCivilDate,
  validateBalancedPostings,
  type NormalizedPosting,
  type PostingSideValue,
} from "@/app/lib/ledger";

type JournalOperationTypeValue =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "FX"
  | "CARD_PURCHASE"
  | "CARD_PAYMENT"
  | "LOAN"
  | "SETTLEMENT"
  | "OPENING_BALANCE"
  | "ADJUSTMENT";

type JournalEntrySourceValue =
  | "MANUAL"
  | "CARD_STATEMENT"
  | "SYSTEM"
  | "REVOLUT_API";

type StoredPostingDraft = {
  ledgerAccountId: string;
  side: PostingSideValue;
  amount: string;
  categoryId?: string | null;
  statementLineId?: string | null;
};

export type CreatePostedJournalEntryInput = {
  operationType: JournalOperationTypeValue;
  source: JournalEntrySourceValue;
  occurredOn: string;
  description: string;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
  postings: StoredPostingDraft[];
};

export type ReverseJournalEntryInput = {
  journalEntryId: string;
  occurredOn: string;
  description?: string;
};

const journalWithPostings = {
  postings: {
    include: { ledgerAccount: true },
  },
} satisfies Prisma.JournalEntryInclude;

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
  );
}

function normalizedDescription(description: string) {
  const value = description.trim();
  if (!value) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_DESCRIPTION",
      "Description is required"
    );
  }
  return value;
}

function postingCreateData(posting: NormalizedPosting) {
  return {
    ledgerAccountId: posting.ledgerAccountId,
    side: posting.side,
    amount: posting.amount,
    categoryId: posting.categoryId,
    statementLineId: posting.statementLineId,
  };
}

export async function createPostedJournalEntry(
  input: CreatePostedJournalEntryInput
) {
  const occurredOn = parseCivilDate(input.occurredOn);
  const description = normalizedDescription(input.description);

  try {
    return await prisma.$transaction(async (transaction) => {
      if (input.idempotencyKey) {
        const existing = await transaction.journalEntry.findFirst({
          where: {
            source: input.source,
            idempotencyKey: input.idempotencyKey,
          },
          include: journalWithPostings,
        });
        if (existing) return existing;
      }

      const accountIds = [
        ...new Set(input.postings.map((posting) => posting.ledgerAccountId)),
      ];
      const accounts = await transaction.ledgerAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, currency: true, isActive: true },
      });
      const accountsById = new Map(
        accounts.map((account) => [account.id, account])
      );

      const postings = input.postings.map((posting) => {
        const account = accountsById.get(posting.ledgerAccountId);
        if (!account) {
          throw new LedgerInvariantError(
            "LEDGER_ACCOUNT_NOT_FOUND",
            `Ledger account not found: ${posting.ledgerAccountId}`
          );
        }
        if (!account.isActive) {
          throw new LedgerInvariantError(
            "LEDGER_ACCOUNT_INACTIVE",
            `Ledger account is inactive: ${posting.ledgerAccountId}`
          );
        }

        return {
          ...posting,
          currency: account.currency.trim(),
        };
      });
      const normalized = validateBalancedPostings(postings);

      return transaction.journalEntry.create({
        data: {
          operationType: input.operationType,
          source: input.source,
          occurredOn,
          description,
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata,
          postings: {
            create: normalized.map(postingCreateData),
          },
        },
        include: journalWithPostings,
      });
    });
  } catch (error) {
    if (input.idempotencyKey && isUniqueConstraintError(error)) {
      const existing = await prisma.journalEntry.findFirst({
        where: {
          source: input.source,
          idempotencyKey: input.idempotencyKey,
        },
        include: journalWithPostings,
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function reversePostedJournalEntry(
  input: ReverseJournalEntryInput
) {
  const occurredOn = parseCivilDate(input.occurredOn);

  try {
    return await prisma.$transaction(async (transaction) => {
      const original = await transaction.journalEntry.findUnique({
        where: { id: input.journalEntryId },
        include: {
          ...journalWithPostings,
          reversedBy: { include: journalWithPostings },
        },
      });
      if (!original) {
        throw new LedgerInvariantError(
          "LEDGER_ENTRY_NOT_FOUND",
          `Journal entry not found: ${input.journalEntryId}`
        );
      }
      if (original.reversedBy) return original.reversedBy;
      if (original.status !== "POSTED") {
        throw new LedgerInvariantError(
          "LEDGER_ENTRY_NOT_POSTED",
          "Only posted journal entries can be reversed"
        );
      }

      const reversalPostings = validateBalancedPostings(
        original.postings.map((posting) => ({
          ledgerAccountId: posting.ledgerAccountId,
          currency: posting.ledgerAccount.currency.trim(),
          side: oppositePostingSide(posting.side),
          amount: posting.amount.toFixed(2),
          categoryId: posting.categoryId,
          statementLineId: posting.statementLineId,
        }))
      );

      const reversal = await transaction.journalEntry.create({
        data: {
          operationType: "REVERSAL",
          source: "SYSTEM",
          occurredOn,
          description: normalizedDescription(
            input.description ?? `Reversal: ${original.description}`
          ),
          idempotencyKey: `reversal:${original.id}`,
          reversalOfId: original.id,
          postings: {
            create: reversalPostings.map(postingCreateData),
          },
        },
        include: journalWithPostings,
      });

      await transaction.journalEntry.update({
        where: { id: original.id },
        data: { status: "REVERSED" },
      });

      return reversal;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.journalEntry.findUnique({
        where: { reversalOfId: input.journalEntryId },
        include: journalWithPostings,
      });
      if (existing) return existing;
    }
    throw error;
  }
}
