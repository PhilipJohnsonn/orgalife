import { Prisma } from "@/app/generated/prisma/client";
import type {
  CreateObligationCommand,
  SettleObligationCommand,
} from "@/app/lib/finance-v1-contracts";
import { parseCivilDate, validateBalancedPostings } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export class FinanceObligationError extends Error {
  readonly code: string;
  readonly status: 404 | 409 | 422;

  constructor(code: string, status: 404 | 409 | 422, message: string) {
    super(message);
    this.name = "FinanceObligationError";
    this.code = code;
    this.status = status;
  }
}

const obligationInclude = {
  settlements: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ObligationInclude;

type ObligationWithSettlements = Prisma.ObligationGetPayload<{
  include: typeof obligationInclude;
}>;

function serializeObligation(obligation: ObligationWithSettlements) {
  const settled = obligation.settlements.reduce(
    (total, settlement) => total.plus(settlement.amount),
    new Prisma.Decimal(0)
  );
  const pending = obligation.originalAmount.minus(settled);
  return {
    id: obligation.id,
    direction: obligation.direction,
    originType: obligation.originType,
    counterparty: obligation.counterparty,
    description: obligation.description,
    currency: obligation.currency.trim(),
    originalAmount: obligation.originalAmount.toFixed(2),
    settledAmount: settled.toFixed(2),
    pendingAmount: pending.toFixed(2),
    dueOn: obligation.dueOn?.toISOString().slice(0, 10) ?? null,
    status: pending.isZero() ? "SETTLED" : settled.isZero() ? "OPEN" : "PARTIAL",
    settlements: obligation.settlements.map((settlement) => ({
      id: settlement.id,
      amount: settlement.amount.toFixed(2),
      journalEntryId: settlement.journalEntryId,
      createdAt: settlement.createdAt.toISOString(),
    })),
  };
}

async function ensureTechnicalAccount(
  transaction: Prisma.TransactionClient,
  kind: "RECEIVABLE" | "PAYABLE" | "EQUITY",
  currency: string
) {
  const subtype = kind === "EQUITY" ? "OPENING" : "OTHER";
  const existing = await transaction.ledgerAccount.findFirst({
    where: { kind, subtype, currency, isSystem: true },
  });
  if (existing) return existing;
  return transaction.ledgerAccount.create({
    data: {
      name: `${kind === "EQUITY" ? "Opening equity" : kind === "RECEIVABLE" ? "Receivables" : "Payables"} ${currency}`,
      currency,
      kind,
      subtype,
      trackingMode: "TRANSACTIONAL",
      isSystem: true,
    },
  });
}

async function loadAssetAccount(
  transaction: Prisma.TransactionClient,
  accountId: string,
  currency: string
) {
  const account = await transaction.ledgerAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive || account.isSystem || account.kind !== "ASSET") {
    throw new FinanceObligationError(
      "ASSET_ACCOUNT_NOT_FOUND",
      422,
      "Choose an active asset account"
    );
  }
  if (account.currency.trim() !== currency) {
    throw new FinanceObligationError(
      "OBLIGATION_CURRENCY_MISMATCH",
      422,
      "The account and obligation must use the same currency"
    );
  }
  return account;
}

async function assertSubledgerInvariant(
  transaction: Prisma.TransactionClient,
  direction: "RECEIVABLE" | "PAYABLE",
  currency: string,
  technicalAccountId: string
) {
  const [postings, obligations] = await Promise.all([
    transaction.posting.findMany({
      where: {
        ledgerAccountId: technicalAccountId,
        journalEntry: { status: "POSTED" },
      },
      select: { side: true, amount: true },
    }),
    transaction.obligation.findMany({
      where: { direction, currency },
      include: { settlements: true },
    }),
  ]);
  const ledgerBalance = postings.reduce(
    (total, posting) => {
      const increases =
        (direction === "RECEIVABLE" && posting.side === "DEBIT") ||
        (direction === "PAYABLE" && posting.side === "CREDIT");
      return increases ? total.plus(posting.amount) : total.minus(posting.amount);
    },
    new Prisma.Decimal(0)
  );
  const subledgerBalance = obligations.reduce((total, obligation) => {
    const settled = obligation.settlements.reduce(
      (sum, settlement) => sum.plus(settlement.amount),
      new Prisma.Decimal(0)
    );
    return total.plus(obligation.originalAmount.minus(settled));
  }, new Prisma.Decimal(0));
  if (!ledgerBalance.equals(subledgerBalance)) {
    throw new FinanceObligationError(
      "OBLIGATION_SUBLEDGER_MISMATCH",
      409,
      "Obligations do not match the ledger balance"
    );
  }
}

export async function createObligation(command: CreateObligationCommand) {
  return prisma.$transaction(async (transaction) => {
    const duplicate = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
      include: { originatedObligation: { include: obligationInclude } },
    });
    if (duplicate?.originatedObligation) {
      return serializeObligation(duplicate.originatedObligation);
    }
    const technical = await ensureTechnicalAccount(
      transaction,
      command.direction,
      command.currency
    );
    const asset = command.assetAccountId
      ? await loadAssetAccount(transaction, command.assetAccountId, command.currency)
      : null;
    if (command.originType === "ACCOUNT_MOVEMENT" && !asset) {
      throw new FinanceObligationError(
        "ASSET_ACCOUNT_REQUIRED",
        422,
        "An account movement requires an asset account"
      );
    }
    const equity = command.originType === "OPENING_BALANCE"
      ? await ensureTechnicalAccount(transaction, "EQUITY", command.currency)
      : null;
    const counterAccount = command.originType === "ACCOUNT_MOVEMENT" ? asset! : equity!;
    const debitAccountId = command.direction === "RECEIVABLE"
      ? technical.id
      : counterAccount.id;
    const creditAccountId = command.direction === "RECEIVABLE"
      ? counterAccount.id
      : technical.id;
    const postings = validateBalancedPostings([
      { ledgerAccountId: debitAccountId, currency: command.currency, side: "DEBIT", amount: command.amount },
      { ledgerAccountId: creditAccountId, currency: command.currency, side: "CREDIT", amount: command.amount },
    ]);
    const entry = await transaction.journalEntry.create({
      data: {
        operationType: command.originType === "OPENING_BALANCE" ? "OPENING_BALANCE" : "LOAN",
        source: "MANUAL",
        occurredOn: parseCivilDate(command.occurredOn),
        description: command.description,
        idempotencyKey: command.idempotencyKey,
        postings: { create: postings.map((posting) => ({
          ledgerAccountId: posting.ledgerAccountId,
          side: posting.side,
          amount: posting.amount,
        })) },
      },
    });
    const obligation = await transaction.obligation.create({
      data: {
        direction: command.direction,
        originType: command.originType,
        counterparty: command.counterparty,
        description: command.description,
        currency: command.currency,
        originalAmount: command.amount,
        dueOn: command.dueOn ? parseCivilDate(command.dueOn) : null,
        originEntryId: entry.id,
      },
      include: obligationInclude,
    });
    await assertSubledgerInvariant(transaction, command.direction, command.currency, technical.id);
    return serializeObligation(obligation);
  });
}

export async function settleObligation(command: SettleObligationCommand) {
  return prisma.$transaction(async (transaction) => {
    const duplicate = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
      include: { obligationSettlement: { include: { obligation: { include: obligationInclude } } } },
    });
    if (duplicate?.obligationSettlement) {
      return serializeObligation(duplicate.obligationSettlement.obligation);
    }
    await transaction.$queryRaw`
      SELECT "id" FROM "Obligation" WHERE "id" = ${command.obligationId} FOR UPDATE
    `;
    const obligation = await transaction.obligation.findUnique({
      where: { id: command.obligationId },
      include: obligationInclude,
    });
    if (!obligation) {
      throw new FinanceObligationError("OBLIGATION_NOT_FOUND", 404, "Obligation not found");
    }
    const settled = obligation.settlements.reduce(
      (total, settlement) => total.plus(settlement.amount),
      new Prisma.Decimal(0)
    );
    const pending = obligation.originalAmount.minus(settled);
    const amount = new Prisma.Decimal(command.amount);
    if (amount.greaterThan(pending)) {
      throw new FinanceObligationError(
        "SETTLEMENT_EXCEEDS_PENDING",
        422,
        "The settlement exceeds the pending amount"
      );
    }
    const currency = obligation.currency.trim();
    const asset = await loadAssetAccount(transaction, command.assetAccountId, currency);
    const technical = await ensureTechnicalAccount(transaction, obligation.direction, currency);
    const receivable = obligation.direction === "RECEIVABLE";
    const postings = validateBalancedPostings([
      { ledgerAccountId: receivable ? asset.id : technical.id, currency, side: "DEBIT", amount: command.amount },
      { ledgerAccountId: receivable ? technical.id : asset.id, currency, side: "CREDIT", amount: command.amount },
    ]);
    const entry = await transaction.journalEntry.create({
      data: {
        operationType: "SETTLEMENT",
        source: "MANUAL",
        occurredOn: parseCivilDate(command.occurredOn),
        description: `Settlement: ${obligation.description}`,
        idempotencyKey: command.idempotencyKey,
        postings: { create: postings.map((posting) => ({
          ledgerAccountId: posting.ledgerAccountId,
          side: posting.side,
          amount: posting.amount,
        })) },
      },
    });
    await transaction.obligationSettlement.create({
      data: {
        obligationId: obligation.id,
        journalEntryId: entry.id,
        amount: command.amount,
      },
    });
    await assertSubledgerInvariant(transaction, obligation.direction, currency, technical.id);
    const updated = await transaction.obligation.findUniqueOrThrow({
      where: { id: obligation.id },
      include: obligationInclude,
    });
    return serializeObligation(updated);
  });
}

export async function listObligations() {
  const obligations = await prisma.obligation.findMany({
    include: obligationInclude,
    orderBy: [{ dueOn: "asc" }, { createdAt: "desc" }],
  });
  return obligations.map(serializeObligation);
}
