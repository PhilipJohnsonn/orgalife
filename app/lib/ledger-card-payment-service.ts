import { Prisma } from "@/app/generated/prisma/client";
import type { CardPaymentCommand } from "@/app/lib/finance-v1-contracts";
import { parseCivilDate, validateBalancedPostings } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export type CardPaymentErrorCode =
  | "STATEMENT_NOT_FOUND"
  | "STATEMENT_NOT_CONFIRMED"
  | "PAYMENT_ACCOUNT_NOT_FOUND"
  | "PAYMENT_CURRENCY_NOT_BILLED"
  | "PAYMENT_EXCEEDS_PENDING"
  | "PAYMENT_ENTRY_NOT_FOUND"
  | "PAYMENT_EXCEEDS_UNASSIGNED"
  | "UNASSIGNED_PAYMENT_AVAILABLE";

export class CardPaymentError extends Error {
  readonly code: CardPaymentErrorCode;
  readonly status: 404 | 409 | 422;
  readonly details?: unknown;

  constructor(
    code: CardPaymentErrorCode,
    status: 404 | 409 | 422,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "CardPaymentError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function loadConfirmedStatement(
  transaction: Prisma.TransactionClient,
  statementId: string
) {
  const statement = await transaction.ledgerCardStatement.findUnique({
    where: { id: statementId },
    include: {
      totals: true,
      paymentAllocations: { where: { releasedAt: null } },
    },
  });
  if (!statement) {
    throw new CardPaymentError(
      "STATEMENT_NOT_FOUND",
      404,
      "Card statement not found"
    );
  }
  if (statement.status !== "CONFIRMED") {
    throw new CardPaymentError(
      "STATEMENT_NOT_CONFIRMED",
      409,
      "Payments can only be allocated to a confirmed statement"
    );
  }
  return statement;
}

function pendingByCurrency(
  statement: Awaited<ReturnType<typeof loadConfirmedStatement>>
) {
  return new Map(
    statement.totals.map((total) => {
      const currency = total.currency.trim();
      const allocated = statement.paymentAllocations
        .filter((allocation) => allocation.currency.trim() === currency)
        .reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0)
        );
      return [currency, Prisma.Decimal.max(total.payableTotal.minus(allocated), 0)];
    })
  );
}

async function listUnassignedPaymentsInTransaction(
  transaction: Prisma.TransactionClient,
  cardGroupId: string
) {
  const entries = await transaction.journalEntry.findMany({
    where: {
      operationType: "CARD_PAYMENT",
      status: "POSTED",
      postings: {
        some: { ledgerAccount: { accountGroupId: cardGroupId, kind: "LIABILITY" } },
      },
    },
    include: {
      postings: { include: { ledgerAccount: true } },
      cardPaymentAllocations: { where: { releasedAt: null } },
    },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
  });

  return entries.flatMap((entry) => {
    const cardPosting = entry.postings.find(
      (posting) =>
        posting.ledgerAccount.accountGroupId === cardGroupId &&
        posting.ledgerAccount.kind === "LIABILITY" &&
        posting.side === "DEBIT"
    );
    if (!cardPosting) return [];
    const currency = cardPosting.ledgerAccount.currency.trim();
    const allocated = entry.cardPaymentAllocations
      .filter((allocation) => allocation.currency.trim() === currency)
      .reduce(
        (sum, allocation) => sum.plus(allocation.amount),
        new Prisma.Decimal(0)
      );
    const available = cardPosting.amount.minus(allocated);
    if (!available.greaterThan(0)) return [];
    const sourcePosting = entry.postings.find(
      (posting) => posting.ledgerAccount.kind === "ASSET" && posting.side === "CREDIT"
    );
    return [{
      journalEntryId: entry.id,
      occurredOn: entry.occurredOn.toISOString().slice(0, 10),
      currency,
      available: available.toFixed(2),
      sourceAccount: sourcePosting
        ? { id: sourcePosting.ledgerAccount.id, name: sourcePosting.ledgerAccount.name }
        : null,
    }];
  });
}

export async function getCardPaymentState(statementId: string) {
  return prisma.$transaction(async (transaction) => {
    const statement = await loadConfirmedStatement(transaction, statementId);
    const pending = pendingByCurrency(statement);
    return {
      statementId: statement.id,
      status: statement.status,
      currencies: statement.totals.map((total) => {
        const currency = total.currency.trim();
        return {
          currency,
          payable: total.payableTotal.toFixed(2),
          pending: pending.get(currency)?.toFixed(2) ?? "0.00",
        };
      }),
      unassignedPayments: await listUnassignedPaymentsInTransaction(
        transaction,
        statement.cardGroupId
      ),
    };
  });
}

export async function recordCardPayment(command: CardPaymentCommand) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.journalEntry.findFirst({
      where: { source: "MANUAL", idempotencyKey: command.idempotencyKey },
      include: { cardPaymentAllocations: { where: { releasedAt: null } } },
    });
    if (existing) {
      return {
        journalEntryId: existing.id,
        allocationId: existing.cardPaymentAllocations.find(
          (allocation) => allocation.statementId === command.statementId
        )?.id ?? null,
      };
    }

    const statement = await loadConfirmedStatement(transaction, command.statementId);
    const sourceAccount = await transaction.ledgerAccount.findFirst({
      where: {
        id: command.sourceAccountId,
        kind: "ASSET",
        isActive: true,
        isSystem: false,
      },
    });
    if (!sourceAccount) {
      throw new CardPaymentError(
        "PAYMENT_ACCOUNT_NOT_FOUND",
        404,
        "Active source account not found"
      );
    }
    const currency = sourceAccount.currency.trim();
    const total = statement.totals.find(
      (candidate) => candidate.currency.trim() === currency
    );
    if (!total) {
      throw new CardPaymentError(
        "PAYMENT_CURRENCY_NOT_BILLED",
        422,
        "The source account currency is not billed by this statement"
      );
    }
    const pending = pendingByCurrency(statement).get(currency)!;
    const amount = new Prisma.Decimal(command.amount);
    if (amount.greaterThan(pending)) {
      throw new CardPaymentError(
        "PAYMENT_EXCEEDS_PENDING",
        422,
        "Payment exceeds the statement pending amount",
        { pending: pending.toFixed(2) }
      );
    }
    const unassigned = await listUnassignedPaymentsInTransaction(
      transaction,
      statement.cardGroupId
    );
    const reusable = unassigned.find(
      (payment) =>
        payment.currency === currency &&
        new Prisma.Decimal(payment.available).greaterThanOrEqualTo(amount)
    );
    if (reusable) {
      throw new CardPaymentError(
        "UNASSIGNED_PAYMENT_AVAILABLE",
        409,
        "Assign the existing unassigned payment before creating a new bank movement",
        reusable
      );
    }
    const liabilityAccount = await transaction.ledgerAccount.findFirst({
      where: {
        accountGroupId: statement.cardGroupId,
        currency,
        kind: "LIABILITY",
        subtype: "CARD",
        isActive: true,
      },
    });
    if (!liabilityAccount) {
      throw new CardPaymentError(
        "PAYMENT_ACCOUNT_NOT_FOUND",
        404,
        "Card liability account not found"
      );
    }
    const postings = validateBalancedPostings([
      {
        ledgerAccountId: liabilityAccount.id,
        currency,
        side: "DEBIT",
        amount: amount.toFixed(2),
      },
      {
        ledgerAccountId: sourceAccount.id,
        currency,
        side: "CREDIT",
        amount: amount.toFixed(2),
      },
    ]);
    const entry = await transaction.journalEntry.create({
      data: {
        operationType: "CARD_PAYMENT",
        source: "MANUAL",
        occurredOn: parseCivilDate(command.occurredOn),
        description: `Payment: ${statement.id}`,
        idempotencyKey: command.idempotencyKey,
        metadata: { cardGroupId: statement.cardGroupId, statementId: statement.id },
        postings: {
          create: postings.map((posting) => ({
            ledgerAccountId: posting.ledgerAccountId,
            side: posting.side,
            amount: posting.amount,
          })),
        },
      },
    });
    const allocation = await transaction.cardPaymentAllocation.create({
      data: {
        statementId: statement.id,
        journalEntryId: entry.id,
        currency,
        amount,
      },
    });
    return { journalEntryId: entry.id, allocationId: allocation.id };
  });
}

export async function allocateExistingCardPayment(input: {
  statementId: string;
  journalEntryId: string;
  amount: string;
}) {
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(input.amount)) {
    throw new CardPaymentError(
      "PAYMENT_EXCEEDS_UNASSIGNED",
      422,
      "Allocation amount must be a positive decimal string"
    );
  }
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.greaterThan(0)) {
    throw new CardPaymentError(
      "PAYMENT_EXCEEDS_UNASSIGNED",
      422,
      "Allocation amount must be greater than zero"
    );
  }
  return prisma.$transaction(async (transaction) => {
    const statement = await loadConfirmedStatement(transaction, input.statementId);
    const availablePayments = await listUnassignedPaymentsInTransaction(
      transaction,
      statement.cardGroupId
    );
    const payment = availablePayments.find(
      (candidate) => candidate.journalEntryId === input.journalEntryId
    );
    if (!payment) {
      throw new CardPaymentError(
        "PAYMENT_ENTRY_NOT_FOUND",
        404,
        "Unassigned card payment not found"
      );
    }
    const pending = pendingByCurrency(statement).get(payment.currency);
    if (!pending || amount.greaterThan(pending)) {
      throw new CardPaymentError(
        "PAYMENT_EXCEEDS_PENDING",
        422,
        "Allocation exceeds the statement pending amount",
        { pending: pending?.toFixed(2) ?? "0.00" }
      );
    }
    if (amount.greaterThan(payment.available)) {
      throw new CardPaymentError(
        "PAYMENT_EXCEEDS_UNASSIGNED",
        422,
        "Allocation exceeds the unassigned payment amount",
        { available: payment.available }
      );
    }
    return transaction.cardPaymentAllocation.create({
      data: {
        statementId: statement.id,
        journalEntryId: payment.journalEntryId,
        currency: payment.currency,
        amount,
      },
    });
  });
}
