import { Prisma } from "@/app/generated/prisma/client";
import { parseCivilDate, validateBalancedPostings } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export type CardStatementConfirmationErrorCode =
  | "STATEMENT_NOT_FOUND"
  | "STATEMENT_NOT_DRAFT"
  | "STATEMENT_NOT_CONFIRMED"
  | "STATEMENT_NOT_BALANCED"
  | "STATEMENT_NEEDS_REVIEW"
  | "CARD_LIABILITY_ACCOUNT_MISSING"
  | "PREVIOUS_BALANCE_MISMATCH"
  | "PAYMENT_RECONCILIATION_REQUIRED"
  | "STATEMENT_HAS_DEPENDENT_TAX_RESOLUTION";

export class CardStatementConfirmationError extends Error {
  readonly code: CardStatementConfirmationErrorCode;
  readonly status: 404 | 409 | 422;
  readonly details?: unknown;

  constructor(
    code: CardStatementConfirmationErrorCode,
    status: 404 | 409 | 422,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "CardStatementConfirmationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const statementForConfirmationInclude = {
  totals: true,
  lines: {
    orderBy: { position: "asc" as const },
    include: {
      postings: {
        include: {
          journalEntry: { include: { postings: { include: { ledgerAccount: true } } } },
        },
      },
      cardReconciliations: true,
    },
  },
  taxExclusions: true,
  paymentAllocations: true,
} satisfies Prisma.LedgerCardStatementInclude;

type StatementForConfirmation = Prisma.LedgerCardStatementGetPayload<{
  include: typeof statementForConfirmationInclude;
}>;

function normalizeDescription(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function oppositeSide(side: "DEBIT" | "CREDIT") {
  return side === "DEBIT" ? "CREDIT" : "DEBIT";
}

async function lockAndLoadStatement(
  transaction: Prisma.TransactionClient,
  statementId: string
) {
  await transaction.$queryRaw`
    SELECT "id" FROM "LedgerCardStatement"
    WHERE "id" = ${statementId}
    FOR UPDATE
  `;
  const statement = await transaction.ledgerCardStatement.findUnique({
    where: { id: statementId },
    include: statementForConfirmationInclude,
  });
  if (!statement) {
    throw new CardStatementConfirmationError(
      "STATEMENT_NOT_FOUND",
      404,
      "Card statement not found"
    );
  }
  return statement;
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

async function liabilityBalanceAt(
  transaction: Prisma.TransactionClient,
  ledgerAccountId: string,
  cutoff: Date
) {
  const postings = await transaction.posting.findMany({
    where: {
      ledgerAccountId,
      journalEntry: { status: "POSTED", occurredOn: { lte: cutoff } },
    },
    select: { side: true, amount: true },
  });
  return postings.reduce(
    (balance, posting) =>
      posting.side === "CREDIT"
        ? balance.plus(posting.amount)
        : balance.minus(posting.amount),
    new Prisma.Decimal(0)
  );
}

async function findPaymentCandidates(
  transaction: Prisma.TransactionClient,
  line: StatementForConfirmation["lines"][number],
  liabilityAccountId: string
) {
  const amount = new Prisma.Decimal(line.billedAmount).abs();
  const entries = await transaction.journalEntry.findMany({
    where: {
      operationType: "CARD_PAYMENT",
      status: "POSTED",
      postings: {
        some: {
          ledgerAccountId: liabilityAccountId,
          side: "DEBIT",
          amount,
        },
      },
      reconciledStatementLines: {
        none: { statement: { status: "CONFIRMED" } },
      },
    },
    select: { id: true },
  });
  return entries.map((entry) => entry.id);
}

async function buildConfirmationContext(
  transaction: Prisma.TransactionClient,
  statement: StatementForConfirmation
) {
  const accountRows = await transaction.ledgerAccount.findMany({
    where: {
      accountGroupId: statement.cardGroupId,
      kind: "LIABILITY",
      subtype: "CARD",
      isActive: true,
    },
  });
  const accounts = new Map(
    accountRows.map((account) => [account.currency.trim(), account])
  );
  const requiredCurrencies = statement.totals
    .filter(
      (total) =>
        !total.reportedTotal.isZero() ||
        !total.previousBalance.isZero() ||
        !total.newCharges.isZero()
    )
    .map((total) => total.currency.trim());
  const missingCurrencies = requiredCurrencies.filter(
    (currency) => !accounts.has(currency)
  );
  if (missingCurrencies.length > 0) {
    throw new CardStatementConfirmationError(
      "CARD_LIABILITY_ACCOUNT_MISSING",
      422,
      "Create a card liability account for every billed currency before confirming",
      { currencies: missingCurrencies }
    );
  }

  const unbalancedCurrencies = statement.totals
    .filter((total) => total.residual.abs().greaterThan("0.01"))
    .map((total) => total.currency.trim());
  if (unbalancedCurrencies.length > 0) {
    throw new CardStatementConfirmationError(
      "STATEMENT_NOT_BALANCED",
      422,
      "Statement totals do not reconcile",
      { currencies: unbalancedCurrencies }
    );
  }

  const reviewLines = statement.lines.filter(
    (line) =>
      line.paymentTreatment === "NEEDS_REVIEW" ||
      line.classification === "UNKNOWN"
  );
  if (reviewLines.length > 0) {
    throw new CardStatementConfirmationError(
      "STATEMENT_NEEDS_REVIEW",
      422,
      "Resolve every line marked for review before confirming",
      { lineIds: reviewLines.map((line) => line.id) }
    );
  }

  const previousStatement = await transaction.ledgerCardStatement.findFirst({
    where: {
      cardGroupId: statement.cardGroupId,
      status: "CONFIRMED",
      closingOn: { lt: statement.closingOn },
    },
    orderBy: { closingOn: "desc" },
  });
  const cutoff = previousStatement?.closingOn ?? statement.closingOn;
  const balanceMismatches: {
    currency: string;
    reported: string;
    expected: string;
  }[] = [];

  for (const total of statement.totals) {
    const currency = total.currency.trim();
    const account = accounts.get(currency);
    if (!account) continue;
    const liability = await liabilityBalanceAt(transaction, account.id, cutoff);
    const pending = await transaction.taxExclusion.aggregate({
      where: {
        cardGroupId: statement.cardGroupId,
        currency,
        status: "PENDING_CONFIRMATION",
        sourceStatement: { status: "CONFIRMED", closingOn: { lte: cutoff } },
      },
      _sum: { amount: true },
    });
    const expected = liability.plus(pending._sum.amount ?? 0);
    if (expected.minus(total.previousBalance).abs().greaterThan("0.01")) {
      balanceMismatches.push({
        currency,
        reported: total.previousBalance.toFixed(2),
        expected: expected.toFixed(2),
      });
    }
  }
  if (balanceMismatches.length > 0) {
    throw new CardStatementConfirmationError(
      "PREVIOUS_BALANCE_MISMATCH",
      422,
      "The previous balance does not match the confirmed ledger and pending tax exclusions",
      { balances: balanceMismatches }
    );
  }

  const paymentMatches = new Map<string, string>();
  const paymentIssues: { lineId: string; candidates: number }[] = [];
  for (const line of statement.lines.filter(
    (candidate) => candidate.classification === "PAYMENT_OR_CREDIT"
  )) {
    if (line.proposedTaxExclusionId) continue;
    if (!line.description.toUpperCase().startsWith("SU PAGO")) {
      paymentIssues.push({ lineId: line.id, candidates: 0 });
      continue;
    }
    const account = accounts.get(line.billedCurrency.trim());
    if (!account) continue;
    const candidates = await findPaymentCandidates(
      transaction,
      line,
      account.id
    );
    if (candidates.length === 1) {
      paymentMatches.set(line.id, candidates[0]);
    } else {
      paymentIssues.push({ lineId: line.id, candidates: candidates.length });
    }
  }
  if (paymentIssues.length > 0) {
    throw new CardStatementConfirmationError(
      "PAYMENT_RECONCILIATION_REQUIRED",
      422,
      "Every reported card payment must match one existing ledger payment",
      { lines: paymentIssues }
    );
  }

  const earliestPurchase = statement.lines
    .flatMap((line) => (line.purchaseOn ? [line.purchaseOn] : []))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const provisionalEntries = await transaction.journalEntry.findMany({
    where: {
      operationType: "CARD_PURCHASE",
      source: "MANUAL",
      status: "PROVISIONAL",
      occurredOn: {
        gte: earliestPurchase ?? statement.closingOn,
        lte: statement.closingOn,
      },
      postings: {
        some: {
          ledgerAccount: { accountGroupId: statement.cardGroupId, kind: "LIABILITY" },
        },
      },
    },
    include: { postings: { include: { ledgerAccount: true } } },
  });
  const provisionalCandidates = new Map<string, string[]>();
  for (const line of statement.lines.filter(
    (candidate) => candidate.paymentTreatment === "PAYABLE"
  )) {
    const candidates = provisionalEntries.filter((entry) => {
      const cardPosting = entry.postings.find(
        (posting) =>
          posting.ledgerAccount.accountGroupId === statement.cardGroupId &&
          posting.ledgerAccount.kind === "LIABILITY"
      );
      return (
        cardPosting?.ledgerAccount.currency.trim() === line.billedCurrency.trim() &&
        cardPosting.amount.equals(line.billedAmount.abs()) &&
        normalizeDescription(entry.description) === normalizeDescription(line.description)
      );
    });
    provisionalCandidates.set(line.id, candidates.map((candidate) => candidate.id));
  }
  const candidateUseCounts = new Map<string, number>();
  for (const candidates of provisionalCandidates.values()) {
    for (const candidateId of candidates) {
      candidateUseCounts.set(candidateId, (candidateUseCounts.get(candidateId) ?? 0) + 1);
    }
  }
  const provisionalMatches = new Map<string, string>();
  for (const [lineId, candidates] of provisionalCandidates) {
    if (candidates.length === 1 && candidateUseCounts.get(candidates[0]) === 1) {
      provisionalMatches.set(lineId, candidates[0]);
    }
  }

  return { accounts, paymentMatches, provisionalMatches };
}

export async function confirmCardStatement(statementId: string) {
  return prisma.$transaction(async (transaction) => {
    const statement = await lockAndLoadStatement(transaction, statementId);
    if (statement.status !== "DRAFT") {
      throw new CardStatementConfirmationError(
        "STATEMENT_NOT_DRAFT",
        409,
        "Only a draft statement can be confirmed"
      );
    }
    const context = await buildConfirmationContext(transaction, statement);

    for (const line of statement.lines) {
      const matchedPaymentId = context.paymentMatches.get(line.id);
      if (matchedPaymentId) {
        await transaction.ledgerCardStatementLine.update({
          where: { id: line.id },
          data: { reconciledJournalEntryId: matchedPaymentId },
        });
      }
      if (line.proposedTaxExclusionId) {
        await transaction.taxExclusion.update({
          where: { id: line.proposedTaxExclusionId },
          data: {
            status: "CONFIRMED_NOT_CHARGED",
            resolution: "CREDIT_LINE",
            resolutionLineId: line.id,
          },
        });
      }
      if (line.paymentTreatment !== "PAYABLE") continue;

      const currency = line.billedCurrency.trim();
      const liabilityAccount = context.accounts.get(currency)!;
      const expenseAccount = await ensureExpenseAccount(transaction, currency);
      const postings = validateBalancedPostings([
        {
          ledgerAccountId: expenseAccount.id,
          currency,
          side: "DEBIT",
          amount: line.billedAmount.abs().toFixed(2),
          categoryId: line.categoryId,
          statementLineId: line.id,
        },
        {
          ledgerAccountId: liabilityAccount.id,
          currency,
          side: "CREDIT",
          amount: line.billedAmount.abs().toFixed(2),
          statementLineId: line.id,
        },
      ]);
      const entry = await transaction.journalEntry.create({
        data: {
          operationType: "CARD_PURCHASE",
          source: "CARD_STATEMENT",
          occurredOn: line.billedOn,
          description: line.description,
          idempotencyKey: `statement:${statement.confirmationKey.trim()}:${line.fingerprint.trim()}`,
          metadata: { statementId: statement.id, statementLineId: line.id },
          postings: {
            create: postings.map((posting) => ({
              ledgerAccountId: posting.ledgerAccountId,
              side: posting.side,
              amount: posting.amount,
              categoryId: posting.categoryId,
              statementLineId: posting.statementLineId,
            })),
          },
        },
      });

      const provisionalEntryId = context.provisionalMatches.get(line.id);
      if (provisionalEntryId) {
        await transaction.cardReconciliation.create({
          data: { provisionalEntryId, statementLineId: line.id },
        });
        await transaction.journalEntry.update({
          where: { id: provisionalEntryId },
          data: { status: "SUPERSEDED", metadata: { supersededByEntryId: entry.id } },
        });
      }
    }

    const confirmedAt = new Date();
    await transaction.ledgerCardStatement.update({
      where: { id: statement.id },
      data: { status: "CONFIRMED", confirmedAt },
    });
    return { id: statement.id, status: "CONFIRMED" as const, confirmedAt };
  });
}

export async function reverseCardStatement(input: {
  statementId: string;
  occurredOn: string;
}) {
  const reversalOn = parseCivilDate(input.occurredOn);
  return prisma.$transaction(async (transaction) => {
    const statement = await lockAndLoadStatement(transaction, input.statementId);
    if (statement.status !== "CONFIRMED") {
      throw new CardStatementConfirmationError(
        "STATEMENT_NOT_CONFIRMED",
        409,
        "Only a confirmed statement can be reversed"
      );
    }
    const dependentExclusions = statement.taxExclusions.filter(
      (exclusion) =>
        exclusion.status === "CONFIRMED_NOT_CHARGED" ||
        exclusion.status === "CHARGED"
    );
    if (dependentExclusions.length > 0) {
      throw new CardStatementConfirmationError(
        "STATEMENT_HAS_DEPENDENT_TAX_RESOLUTION",
        409,
        "Reverse later statements that resolved this statement's tax exclusions first",
        { taxExclusionIds: dependentExclusions.map((exclusion) => exclusion.id) }
      );
    }

    const entryMap = new Map<string, StatementForConfirmation["lines"][number]["postings"][number]["journalEntry"]>();
    for (const line of statement.lines) {
      for (const posting of line.postings) {
        if (
          posting.journalEntry.source === "CARD_STATEMENT" &&
          posting.journalEntry.status === "POSTED"
        ) {
          entryMap.set(posting.journalEntry.id, posting.journalEntry);
        }
      }
    }
    for (const entry of entryMap.values()) {
      const reversalPostings = validateBalancedPostings(
        entry.postings.map((posting) => ({
          ledgerAccountId: posting.ledgerAccountId,
          currency: posting.ledgerAccount.currency.trim(),
          side: oppositeSide(posting.side),
          amount: posting.amount.toFixed(2),
          categoryId: posting.categoryId,
          statementLineId: posting.statementLineId,
        }))
      );
      await transaction.journalEntry.create({
        data: {
          operationType: "REVERSAL",
          source: "SYSTEM",
          occurredOn: reversalOn,
          description: `Reversal: ${entry.description}`,
          idempotencyKey: `statement-reversal:${statement.id}:${entry.id}`,
          reversalOfId: entry.id,
          metadata: { statementId: statement.id },
          postings: {
            create: reversalPostings.map((posting) => ({
              ledgerAccountId: posting.ledgerAccountId,
              side: posting.side,
              amount: posting.amount,
              categoryId: posting.categoryId,
              statementLineId: posting.statementLineId,
            })),
          },
        },
      });
      await transaction.journalEntry.update({
        where: { id: entry.id },
        data: { status: "REVERSED" },
      });
    }

    const reconciliations = await transaction.cardReconciliation.findMany({
      where: { statementLine: { statementId: statement.id }, releasedAt: null },
    });
    for (const reconciliation of reconciliations) {
      await transaction.journalEntry.update({
        where: { id: reconciliation.provisionalEntryId },
        data: { status: "PROVISIONAL", metadata: { restoredByStatementReversal: statement.id } },
      });
    }
    const reversedAt = new Date();
    await transaction.cardReconciliation.updateMany({
      where: { statementLine: { statementId: statement.id }, releasedAt: null },
      data: { releasedAt: reversedAt },
    });
    await transaction.cardPaymentAllocation.updateMany({
      where: { statementId: statement.id, releasedAt: null },
      data: { releasedAt: reversedAt },
    });
    await transaction.taxExclusion.updateMany({
      where: { sourceStatementId: statement.id, status: { in: ["PENDING_CONFIRMATION", "NEEDS_REVIEW"] } },
      data: { status: "CANCELLED", resolution: "CANCELLED" },
    });
    await transaction.taxExclusion.updateMany({
      where: { resolutionLine: { statementId: statement.id } },
      data: {
        status: "PENDING_CONFIRMATION",
        resolution: null,
        resolutionLineId: null,
      },
    });
    await transaction.recurringCommitmentObservation.deleteMany({
      where: { statementLine: { statementId: statement.id } },
    });
    await transaction.ledgerCardStatement.update({
      where: { id: statement.id },
      data: { status: "REVERSED", reversedAt },
    });
    return { id: statement.id, status: "REVERSED" as const, reversedAt };
  });
}
