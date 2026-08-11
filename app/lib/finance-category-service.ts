import type {
  CategorizeStatementLineCommand,
  CategoryRuleCommand,
} from "@/app/lib/finance-v1-contracts";
import { prisma } from "@/app/lib/prisma";

export class FinanceCategoryError extends Error {
  readonly code: string;
  readonly status: 404 | 409 | 422;

  constructor(code: string, status: 404 | 409 | 422, message: string) {
    super(message);
    this.name = "FinanceCategoryError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeMerchantPattern(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function chooseCategoryRule(
  description: string,
  rules: { id: string; patternNormalized: string; categoryId: string; priority: number }[]
) {
  const normalized = normalizeMerchantPattern(description);
  return rules
    .filter((rule) => normalized === rule.patternNormalized || normalized.includes(rule.patternNormalized))
    .sort((left, right) => {
      const leftExact = normalized === left.patternNormalized ? 1 : 0;
      const rightExact = normalized === right.patternNormalized ? 1 : 0;
      return rightExact - leftExact ||
        right.patternNormalized.length - left.patternNormalized.length ||
        right.priority - left.priority;
    })[0] ?? null;
}

export async function listCategoriesAndRules() {
  const [categories, rules] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.categoryRule.findMany({
      include: { category: true },
      orderBy: [{ isActive: "desc" }, { priority: "desc" }, { patternNormalized: "asc" }],
    }),
  ]);
  return { categories, rules };
}

export async function createFinanceCategory(input: { name: string; color?: string }) {
  const name = input.name.trim();
  if (!name) {
    throw new FinanceCategoryError("CATEGORY_NAME_REQUIRED", 422, "Category name is required");
  }
  const duplicate = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) return duplicate;
  return prisma.category.create({
    data: { name, color: input.color?.trim() || "#6B7280" },
  });
}

export async function createCategoryRule(command: CategoryRuleCommand) {
  const patternNormalized = normalizeMerchantPattern(command.pattern);
  if (!patternNormalized) {
    throw new FinanceCategoryError("CATEGORY_PATTERN_REQUIRED", 422, "Rule pattern is required");
  }
  const category = await prisma.category.findUnique({ where: { id: command.categoryId } });
  if (!category) {
    throw new FinanceCategoryError("CATEGORY_NOT_FOUND", 404, "Category not found");
  }
  return prisma.categoryRule.upsert({
    where: {
      patternNormalized_categoryId: {
        patternNormalized,
        categoryId: command.categoryId,
      },
    },
    create: {
      patternNormalized,
      categoryId: command.categoryId,
      priority: command.priority,
    },
    update: { priority: command.priority, isActive: true },
    include: { category: true },
  });
}

export async function setCategoryRuleActive(ruleId: string, isActive: boolean) {
  const existing = await prisma.categoryRule.findUnique({ where: { id: ruleId } });
  if (!existing) {
    throw new FinanceCategoryError("CATEGORY_RULE_NOT_FOUND", 404, "Category rule not found");
  }
  return prisma.categoryRule.update({
    where: { id: ruleId },
    data: { isActive },
    include: { category: true },
  });
}

export async function categorizeStatementLine(
  lineId: string,
  command: CategorizeStatementLineCommand
) {
  return prisma.$transaction(async (transaction) => {
    const [line, category] = await Promise.all([
      transaction.ledgerCardStatementLine.findUnique({
        where: { id: lineId },
        include: {
          statement: true,
          postings: { include: { journalEntry: true, ledgerAccount: true } },
        },
      }),
      transaction.category.findUnique({ where: { id: command.categoryId } }),
    ]);
    if (!line) {
      throw new FinanceCategoryError("STATEMENT_LINE_NOT_FOUND", 404, "Statement line not found");
    }
    if (line.statement.status === "REVERSED") {
      throw new FinanceCategoryError("STATEMENT_REVERSED", 409, "A reversed statement cannot be edited");
    }
    if (!category) {
      throw new FinanceCategoryError("CATEGORY_NOT_FOUND", 404, "Category not found");
    }
    await transaction.ledgerCardStatementLine.update({
      where: { id: line.id },
      data: { categoryId: category.id },
    });
    const expensePostings = line.postings.filter(
      (posting) => posting.ledgerAccount.kind === "EXPENSE"
    );
    for (const posting of expensePostings) {
      await transaction.posting.update({
        where: { id: posting.id },
        data: { categoryId: category.id },
      });
      await transaction.journalEntryAudit.create({
        data: {
          journalEntryId: posting.journalEntryId,
          field: "CATEGORY",
          previousValue: line.categoryId,
          newValue: category.id,
        },
      });
    }
    if (command.learnRule) {
      const patternNormalized = normalizeMerchantPattern(line.description);
      await transaction.categoryRule.upsert({
        where: {
          patternNormalized_categoryId: {
            patternNormalized,
            categoryId: category.id,
          },
        },
        create: { patternNormalized, categoryId: category.id },
        update: { isActive: true, lastUsedAt: new Date() },
      });
    }
    return { lineId: line.id, category };
  });
}
