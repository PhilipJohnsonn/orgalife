import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/app/generated/prisma/client";
import { chooseCategoryRule } from "@/app/lib/finance-category-service";
import { parseIcbcVisaLayout } from "@/app/lib/icbc-visa-parser";
import { parseCivilDate } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export type CardStatementDraftErrorCode =
  | "CARD_GROUP_NOT_FOUND"
  | "CARD_GROUP_REQUIRED"
  | "STATEMENT_ALREADY_CONFIRMED";

export class CardStatementDraftError extends Error {
  readonly code: CardStatementDraftErrorCode;
  readonly status: 400 | 404 | 409;
  readonly existingStatementId?: string;

  constructor(
    code: CardStatementDraftErrorCode,
    status: 400 | 404 | 409,
    message: string,
    existingStatementId?: string
  ) {
    super(message);
    this.name = "CardStatementDraftError";
    this.code = code;
    this.status = status;
    this.existingStatementId = existingStatementId;
  }
}

const statementInclude = {
  cardGroup: { select: { id: true, name: true, region: true } },
  totals: { orderBy: { currency: "asc" as const } },
  lines: {
    orderBy: { position: "asc" as const },
    include: { category: true },
  },
  taxExclusions: true,
  paymentAllocations: { where: { releasedAt: null } },
} satisfies Prisma.LedgerCardStatementInclude;

type StatementWithDetails = Prisma.LedgerCardStatementGetPayload<{
  include: typeof statementInclude;
}>;

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2002"
  );
}

function lineFingerprint(line: ReturnType<typeof parseIcbcVisaLayout>["statement"]["lines"][number]) {
  return sha256(JSON.stringify({
    sourceLine: line.sourceLine,
    purchaseOn: line.purchaseOn,
    billedOn: line.billedOn,
    description: line.description,
    classification: line.classification,
    billedCurrency: line.billedCurrency,
    billedAmount: line.billedAmount,
    originalCurrency: line.originalCurrency,
    originalAmount: line.originalAmount,
    installmentInfo: line.installmentInfo,
  }));
}

function serializeStatement(statement: StatementWithDetails) {
  const paidByCurrency = new Map<string, Prisma.Decimal>();
  for (const allocation of statement.paymentAllocations) {
    const currency = allocation.currency.trim();
    paidByCurrency.set(
      currency,
      (paidByCurrency.get(currency) ?? new Prisma.Decimal(0)).plus(allocation.amount)
    );
  }
  return {
    id: statement.id,
    cardGroup: statement.cardGroup,
    cycleFrom: statement.cycleFrom?.toISOString().slice(0, 10) ?? null,
    cycleTo: statement.cycleTo?.toISOString().slice(0, 10) ?? null,
    closingOn: statement.closingOn.toISOString().slice(0, 10),
    dueOn: statement.dueOn.toISOString().slice(0, 10),
    documentHash: statement.documentHash.trim(),
    revision: statement.revision,
    parserVersion: statement.parserVersion,
    paymentPolicy: statement.paymentPolicy,
    status: statement.status,
    ignoredPages: statement.ignoredPages,
    totals: statement.totals.map((total) => ({
      currency: total.currency.trim(),
      previousBalance: total.previousBalance.toFixed(2),
      paymentsAndCredits: total.paymentsAndCredits.toFixed(2),
      newCharges: total.newCharges.toFixed(2),
      reportedTotal: total.reportedTotal.toFixed(2),
      eligibleExclusions: total.eligibleExclusions.toFixed(2),
      payableTotal: total.payableTotal.toFixed(2),
      paidTotal: (paidByCurrency.get(total.currency.trim()) ?? new Prisma.Decimal(0)).toFixed(2),
      pendingTotal: Prisma.Decimal.max(
        total.payableTotal.minus(paidByCurrency.get(total.currency.trim()) ?? 0),
        0
      ).toFixed(2),
      residual: total.residual.toFixed(2),
    })),
    lines: statement.lines.map((line) => ({
      id: line.id,
      position: line.position,
      sourceLine: line.sourceLine,
      purchaseOn: line.purchaseOn?.toISOString().slice(0, 10) ?? null,
      billedOn: line.billedOn.toISOString().slice(0, 10),
      description: line.description,
      classification: line.classification,
      paymentTreatment: line.paymentTreatment,
      billedCurrency: line.billedCurrency.trim(),
      billedAmount: line.billedAmount.toFixed(2),
      originalCurrency: line.originalCurrency?.trim() ?? null,
      originalAmount: line.originalAmount?.toFixed(2) ?? null,
      installmentInfo: line.installmentInfo,
      category: line.category,
      proposedTaxExclusionId: line.proposedTaxExclusionId,
    })),
    taxExclusions: statement.taxExclusions.map((exclusion) => ({
      id: exclusion.id,
      amount: exclusion.amount.toFixed(2),
      currency: exclusion.currency.trim(),
      status: exclusion.status,
      resolution: exclusion.resolution,
    })),
    createdAt: statement.createdAt.toISOString(),
    updatedAt: statement.updatedAt.toISOString(),
  };
}

async function findExistingAfterConflict(cardGroupId: string, documentHash: string) {
  const existing = await prisma.ledgerCardStatement.findFirst({
    where: { cardGroupId, documentHash, status: { in: ["DRAFT", "CONFIRMED"] } },
    include: statementInclude,
    orderBy: { revision: "desc" },
  });
  if (!existing) return null;
  if (existing.status === "CONFIRMED") {
    throw new CardStatementDraftError(
      "STATEMENT_ALREADY_CONFIRMED",
      409,
      "This statement is already confirmed",
      existing.id
    );
  }
  return serializeStatement(existing);
}

export async function createOrReuseCardStatementDraft(input: {
  cardGroupId: string;
  documentBytes: Uint8Array;
  layoutItems: Parameters<typeof parseIcbcVisaLayout>[0];
}) {
  const cardGroupId = input.cardGroupId.trim();
  if (!cardGroupId) {
    throw new CardStatementDraftError(
      "CARD_GROUP_REQUIRED",
      400,
      "cardGroupId is required"
    );
  }
  const documentHash = sha256(input.documentBytes);

  try {
    const statement = await prisma.$transaction(async (transaction) => {
      const cardGroup = await transaction.accountGroup.findFirst({
        where: { id: cardGroupId, type: "CARD", isActive: true },
      });
      if (!cardGroup) {
        throw new CardStatementDraftError(
          "CARD_GROUP_NOT_FOUND",
          404,
          "Active card group not found"
        );
      }

      const confirmed = await transaction.ledgerCardStatement.findFirst({
        where: { cardGroupId, documentHash, status: "CONFIRMED" },
        select: { id: true },
      });
      if (confirmed) {
        throw new CardStatementDraftError(
          "STATEMENT_ALREADY_CONFIRMED",
          409,
          "This statement is already confirmed",
          confirmed.id
        );
      }

      const draft = await transaction.ledgerCardStatement.findFirst({
        where: { cardGroupId, documentHash, status: "DRAFT" },
        include: statementInclude,
        orderBy: { revision: "desc" },
      });
      if (draft) return draft;

      const latestRevision = await transaction.ledgerCardStatement.findFirst({
        where: { cardGroupId, documentHash },
        select: { revision: true },
        orderBy: { revision: "desc" },
      });
      const revision = (latestRevision?.revision ?? 0) + 1;
      const pendingTaxExclusions = await transaction.taxExclusion.findMany({
        where: {
          cardGroupId,
          status: "PENDING_CONFIRMATION",
          sourceStatement: { status: "CONFIRMED" },
        },
      });
      const newTaxExclusionIds: string[] = [];
      const parsed = parseIcbcVisaLayout(input.layoutItems, {
        pendingTaxExclusions: pendingTaxExclusions.map((exclusion) => ({
          key: exclusion.id,
          amount: exclusion.amount.toFixed(2),
          currency: exclusion.currency.trim(),
          status: "PENDING_CONFIRMATION",
          resolution: null,
        })),
        createTaxExclusionKey: () => {
          const id = randomUUID();
          newTaxExclusionIds.push(id);
          return id;
        },
      });
      const statementId = randomUUID();
      const lineIds = parsed.statement.lines.map(() => randomUUID());
      const categoryRules = await transaction.categoryRule.findMany({
        where: { isActive: true },
        select: { id: true, patternNormalized: true, categoryId: true, priority: true },
      });
      const matchedCategoryRules = parsed.statement.lines.map((line) =>
        chooseCategoryRule(line.description, categoryRules)
      );

      await transaction.ledgerCardStatement.create({
        data: {
          id: statementId,
          cardGroupId,
          closingOn: parseCivilDate(parsed.statement.closingOn),
          cycleTo: parseCivilDate(parsed.statement.closingOn),
          dueOn: parseCivilDate(parsed.statement.dueOn),
          documentHash,
          revision,
          confirmationKey: sha256(`${cardGroupId}:${documentHash}:${revision}`),
          parserVersion: parsed.parserVersion,
          ignoredPages: parsed.statement.ignoredPages,
          totals: {
            create: parsed.statement.totals.map((total) => ({
              currency: total.currency,
              previousBalance: total.previousBalance,
              paymentsAndCredits: total.paymentsAndCredits,
              newCharges: total.newCharges,
              reportedTotal: total.reportedTotal,
              eligibleExclusions: total.eligibleExclusions,
              payableTotal: total.payableTotal,
              residual: total.residual,
            })),
          },
          lines: {
            create: parsed.statement.lines.map((line, position) => ({
              id: lineIds[position],
              position,
              sourceLine: line.sourceLine,
              fingerprint: lineFingerprint(line),
              purchaseOn: line.purchaseOn ? parseCivilDate(line.purchaseOn) : null,
              billedOn: parseCivilDate(line.billedOn),
              description: line.description,
              classification: line.classification,
              paymentTreatment: line.paymentTreatment,
              billedCurrency: line.billedCurrency,
              billedAmount: line.billedAmount,
              originalCurrency: line.originalCurrency,
              originalAmount: line.originalAmount,
              installmentInfo: line.installmentInfo,
              categoryId: matchedCategoryRules[position]?.categoryId ?? null,
              proposedTaxExclusionId: line.resolvesTaxExclusion ?? null,
            })),
          },
        },
      });

      const matchedRuleIds = [...new Set(
        matchedCategoryRules.flatMap((rule) => rule ? [rule.id] : [])
      )];
      if (matchedRuleIds.length > 0) {
        await transaction.categoryRule.updateMany({
          where: { id: { in: matchedRuleIds } },
          data: { lastUsedAt: new Date() },
        });
      }

      const newIdSet = new Set(newTaxExclusionIds);
      const newExclusions = parsed.statement.taxExclusions.filter((exclusion) =>
        newIdSet.has(exclusion.key)
      );
      const eligibleLineIndices = parsed.statement.lines.flatMap((line, index) =>
        line.classification === "ELIGIBLE_USD_TAX" ? [index] : []
      );
      for (const [exclusionIndex, exclusion] of newExclusions.entries()) {
        const lineIndex = eligibleLineIndices[exclusionIndex];
        if (lineIndex === undefined) {
          throw new Error("Eligible tax line not found for parsed exclusion");
        }
        await transaction.taxExclusion.create({
          data: {
            id: exclusion.key,
            cardGroupId,
            sourceStatementId: statementId,
            sourceLineId: lineIds[lineIndex],
            amount: exclusion.amount,
            currency: exclusion.currency,
          },
        });
      }

      return transaction.ledgerCardStatement.findUniqueOrThrow({
        where: { id: statementId },
        include: statementInclude,
      });
    });

    return serializeStatement(statement);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const recovered = await findExistingAfterConflict(cardGroupId, documentHash);
      if (recovered) return recovered;
    }
    throw error;
  }
}

export async function listCardStatements() {
  const statements = await prisma.ledgerCardStatement.findMany({
    include: statementInclude,
    orderBy: [{ closingOn: "desc" }, { revision: "desc" }],
  });
  return statements.map(serializeStatement);
}

export async function deleteAbandonedCardStatementDrafts(now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return prisma.ledgerCardStatement.deleteMany({
    where: { status: "DRAFT", updatedAt: { lt: cutoff } },
  });
}
