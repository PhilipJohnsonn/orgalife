import { Prisma, type LedgerAccount } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  LedgerInvariantError,
  parseCivilDate,
  validateBalancedPostings,
} from "@/app/lib/ledger";
import type {
  FxCommand,
  TransferCommand,
} from "@/app/lib/finance-v1-contracts";

const movementEntryInclude = {
  postings: { include: { ledgerAccount: { include: { accountGroup: true } } } },
  exchangeRateReferences: { include: { snapshot: true } },
} satisfies Prisma.JournalEntryInclude;

type MovementEntry = Prisma.JournalEntryGetPayload<{
  include: typeof movementEntryInclude;
}>;

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2002"
  );
}

async function withIdempotencyRecovery(
  idempotencyKey: string,
  action: () => Promise<MovementEntry>
) {
  try {
    return await action();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.journalEntry.findFirst({
        where: { source: "MANUAL", idempotencyKey },
        include: movementEntryInclude,
      });
      if (existing) return existing;
    }
    throw error;
  }
}

function assertUserAsset(account: LedgerAccount | undefined, id: string) {
  if (!account) {
    throw new LedgerInvariantError(
      "LEDGER_ACCOUNT_NOT_FOUND",
      `Ledger account not found: ${id}`
    );
  }
  if (!account.isActive) {
    throw new LedgerInvariantError(
      "LEDGER_ACCOUNT_INACTIVE",
      `Ledger account is inactive: ${id}`
    );
  }
  if (account.isSystem || account.kind !== "ASSET") {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_ACCOUNT_KIND",
      "Transfers and FX require active asset accounts"
    );
  }
  return account;
}

async function getAccountPair(
  transaction: Prisma.TransactionClient,
  sourceAccountId: string,
  destinationAccountId: string
) {
  const accounts = await transaction.ledgerAccount.findMany({
    where: { id: { in: [sourceAccountId, destinationAccountId] } },
  });
  return {
    source: assertUserAsset(
      accounts.find((account) => account.id === sourceAccountId),
      sourceAccountId
    ),
    destination: assertUserAsset(
      accounts.find((account) => account.id === destinationAccountId),
      destinationAccountId
    ),
  };
}

async function ensureFxClearingAccount(
  transaction: Prisma.TransactionClient,
  currency: string
) {
  const existing = await transaction.ledgerAccount.findFirst({
    where: { currency, kind: "CLEARING", subtype: "FX", isSystem: true },
  });
  if (existing) return existing;

  return transaction.ledgerAccount.create({
    data: {
      name: `FX clearing ${currency}`,
      currency,
      kind: "CLEARING",
      subtype: "FX",
      trackingMode: "TRANSACTIONAL",
      isSystem: true,
    },
  });
}

export async function recordTransfer(input: TransferCommand) {
  const occurredOn = parseCivilDate(input.occurredOn);

  return withIdempotencyRecovery(input.idempotencyKey, () =>
    prisma.$transaction(async (transaction) => {
      const existing = await transaction.journalEntry.findFirst({
        where: { source: "MANUAL", idempotencyKey: input.idempotencyKey },
        include: movementEntryInclude,
      });
      if (existing) return existing;

      const { source, destination } = await getAccountPair(
        transaction,
        input.sourceAccountId,
        input.destinationAccountId
      );
      const currency = source.currency.trim();
      if (currency !== destination.currency.trim()) {
        throw new LedgerInvariantError(
          "LEDGER_CURRENCY_MISMATCH",
          "A transfer requires accounts in the same currency"
        );
      }

      const postings = validateBalancedPostings([
        {
          ledgerAccountId: destination.id,
          currency,
          side: "DEBIT",
          amount: input.amount,
        },
        {
          ledgerAccountId: source.id,
          currency,
          side: "CREDIT",
          amount: input.amount,
        },
      ]);

      return transaction.journalEntry.create({
        data: {
          operationType: "TRANSFER",
          source: "MANUAL",
          occurredOn,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          postings: {
            create: postings.map((posting) => ({
              ledgerAccountId: posting.ledgerAccountId,
              side: posting.side,
              amount: posting.amount,
            })),
          },
        },
        include: movementEntryInclude,
      });
    })
  );
}

export async function recordFx(input: FxCommand) {
  const occurredOn = parseCivilDate(input.occurredOn);

  return withIdempotencyRecovery(input.idempotencyKey, () =>
    prisma.$transaction(async (transaction) => {
      const existing = await transaction.journalEntry.findFirst({
        where: { source: "MANUAL", idempotencyKey: input.idempotencyKey },
        include: movementEntryInclude,
      });
      if (existing) return existing;

      const { source, destination } = await getAccountPair(
        transaction,
        input.sourceAccountId,
        input.destinationAccountId
      );
      const sourceCurrency = source.currency.trim();
      const destinationCurrency = destination.currency.trim();
      if (sourceCurrency === destinationCurrency) {
        throw new LedgerInvariantError(
          "LEDGER_CURRENCY_MISMATCH",
          "FX requires accounts in different currencies"
        );
      }

      const referenceSnapshotIds = input.referenceSnapshotIds ?? [];
      const snapshots = referenceSnapshotIds.length
        ? await transaction.exchangeRateSnapshot.findMany({
            where: { id: { in: referenceSnapshotIds } },
          })
        : [];
      if (snapshots.length !== referenceSnapshotIds.length) {
        throw new LedgerInvariantError(
          "LEDGER_ENTRY_NOT_FOUND",
          "One or more reference exchange-rate snapshots do not exist"
        );
      }
      const allowedQuotes = new Set(
        [sourceCurrency, destinationCurrency].filter(
          (currency) => currency !== "USD"
        )
      );
      if (
        snapshots.some(
          (snapshot) =>
            snapshot.baseCurrency.trim() !== "USD" ||
            !allowedQuotes.has(snapshot.quoteCurrency.trim())
        )
      ) {
        throw new LedgerInvariantError(
          "LEDGER_CURRENCY_MISMATCH",
          "Reference snapshots must use the currencies involved in the FX operation"
        );
      }

      const sourceClearing = await ensureFxClearingAccount(
        transaction,
        sourceCurrency
      );
      const destinationClearing = await ensureFxClearingAccount(
        transaction,
        destinationCurrency
      );
      const postings = validateBalancedPostings([
        {
          ledgerAccountId: sourceClearing.id,
          currency: sourceCurrency,
          side: "DEBIT",
          amount: input.sourceAmount,
        },
        {
          ledgerAccountId: source.id,
          currency: sourceCurrency,
          side: "CREDIT",
          amount: input.sourceAmount,
        },
        {
          ledgerAccountId: destination.id,
          currency: destinationCurrency,
          side: "DEBIT",
          amount: input.destinationAmount,
        },
        {
          ledgerAccountId: destinationClearing.id,
          currency: destinationCurrency,
          side: "CREDIT",
          amount: input.destinationAmount,
        },
      ]);
      const effectiveRate = new Prisma.Decimal(input.destinationAmount)
        .div(input.sourceAmount)
        .toDecimalPlaces(8)
        .toFixed(8);

      return transaction.journalEntry.create({
        data: {
          operationType: "FX",
          source: "MANUAL",
          occurredOn,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          metadata: {
            sourceCurrency,
            sourceAmount: input.sourceAmount,
            destinationCurrency,
            destinationAmount: input.destinationAmount,
            effectiveRate,
          },
          postings: {
            create: postings.map((posting) => ({
              ledgerAccountId: posting.ledgerAccountId,
              side: posting.side,
              amount: posting.amount,
            })),
          },
          exchangeRateReferences: referenceSnapshotIds.length
            ? {
                create: referenceSnapshotIds.map((snapshotId) => ({
                  snapshot: { connect: { id: snapshotId } },
                })),
              }
            : undefined,
        },
        include: movementEntryInclude,
      });
    })
  );
}

export async function listFinanceMovements() {
  const entries = await prisma.journalEntry.findMany({
    where: { operationType: { in: ["INCOME", "EXPENSE", "TRANSFER", "FX"] } },
    include: movementEntryInclude,
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
  });

  return entries.map((entry) => {
    const userPostings = entry.postings.filter(
      (posting) => !posting.ledgerAccount.isSystem
    );
    const sourcePosting = userPostings.find((posting) => posting.side === "CREDIT");
    const destinationPosting = userPostings.find(
      (posting) => posting.side === "DEBIT"
    );
    const accountDto = (
      posting: (typeof userPostings)[number] | undefined
    ) => posting
      ? {
          id: posting.ledgerAccount.id,
          name: posting.ledgerAccount.name,
          currency: posting.ledgerAccount.currency.trim(),
          amount: posting.amount.toFixed(2),
          region: posting.ledgerAccount.accountGroup?.region ?? "GLOBAL",
        }
      : null;
    const metadata =
      entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
        ? entry.metadata
        : null;

    return {
      id: entry.id,
      type: entry.operationType,
      status: entry.status,
      occurredOn: entry.occurredOn.toISOString().slice(0, 10),
      description: entry.description,
      source: accountDto(sourcePosting),
      destination: accountDto(destinationPosting),
      effectiveRate:
        entry.operationType === "FX" && metadata && typeof metadata.effectiveRate === "string"
          ? metadata.effectiveRate
          : null,
      referenceSnapshots: entry.exchangeRateReferences.map(({ snapshot }) => ({
        id: snapshot.id,
        quoteCurrency: snapshot.quoteCurrency.trim(),
        rate: snapshot.rate.toFixed(8),
        appliedOn: snapshot.appliedOn.toISOString().slice(0, 10),
        isManualOverride: snapshot.isManualOverride,
      })),
    };
  });
}
