import { Decimal } from "@prisma/client/runtime/client";
import { FinanceCategoryError } from "@/app/lib/finance-category-service";
import { getNativeAccountBalances } from "@/app/lib/ledger-account-service";
import { recordIncomeExpense } from "@/app/lib/ledger-cash-flow-service";
import { prisma } from "@/app/lib/prisma";

export const YIELD_CATEGORY_NAME = "Rendimientos";

async function userAccount(id: string) {
  const account = await prisma.ledgerAccount.findUnique({ where: { id } });
  if (!account || account.isSystem) {
    throw new FinanceCategoryError("ACCOUNT_NOT_FOUND", 404, "La cuenta no existe");
  }
  return account;
}

export async function renameAccount(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new FinanceCategoryError("ACCOUNT_NAME_REQUIRED", 422, "El nombre es obligatorio");
  await userAccount(id);
  return prisma.ledgerAccount.update({ where: { id }, data: { name: trimmed } });
}

/**
 * Deletes an account that was never used; otherwise archives it so past
 * months keep their history. Archiving requires a zero balance, or the
 * hidden account would keep counting in Cierre.
 */
export async function removeAccount(id: string) {
  const account = await userAccount(id);
  const [postings, commitments] = await Promise.all([
    prisma.posting.count({ where: { ledgerAccountId: id } }),
    prisma.recurringCommitment.count({ where: { expectedAccountId: id } }),
  ]);

  if (postings === 0 && commitments === 0) {
    await prisma.$transaction(async (transaction) => {
      await transaction.walletCardAlias.deleteMany({ where: { ledgerAccountId: id } });
      await transaction.ledgerAccount.delete({ where: { id } });
      if (account.accountGroupId) {
        const [remaining, statements] = await Promise.all([
          transaction.ledgerAccount.count({ where: { accountGroupId: account.accountGroupId } }),
          transaction.ledgerCardStatement.count({ where: { cardGroupId: account.accountGroupId } }),
        ]);
        if (remaining === 0 && statements === 0) {
          await transaction.accountGroup.delete({ where: { id: account.accountGroupId } });
        }
      }
    });
    return { result: "DELETED" as const };
  }

  const balance = (await getNativeAccountBalances()).find((item) => item.id === id)?.balance ?? "0.00";
  if (!new Decimal(balance).isZero()) {
    throw new FinanceCategoryError(
      "ACCOUNT_HAS_BALANCE",
      409,
      `La cuenta tiene movimientos y saldo ${balance} ${account.currency.trim()}. Llevá el saldo a 0 antes de archivarla.`
    );
  }
  await prisma.$transaction([
    prisma.walletCardAlias.deleteMany({ where: { ledgerAccountId: id } }),
    prisma.ledgerAccount.update({ where: { id }, data: { isActive: false } }),
  ]);
  return { result: "ARCHIVED" as const };
}

async function ensureYieldCategory() {
  const existing = await prisma.category.findFirst({
    where: { name: { equals: YIELD_CATEGORY_NAME, mode: "insensitive" } },
  });
  return existing ?? prisma.category.create({ data: { name: YIELD_CATEGORY_NAME, color: "#10B981" } });
}

/**
 * Sets the account to the balance the bank shows; the difference is booked
 * as income (or expense) in the Rendimientos category so it shows up in Mes.
 */
export async function updateAccountBalance(
  id: string,
  input: { balance: string; occurredOn: string; idempotencyKey: string }
) {
  const account = await userAccount(id);
  if (account.kind !== "ASSET" || !account.isActive) {
    throw new FinanceCategoryError("ACCOUNT_NOT_BALANCE_TRACKED", 422, "Sólo se actualiza el saldo de cuentas activas");
  }
  const current = (await getNativeAccountBalances()).find((item) => item.id === id)?.balance ?? "0.00";
  const difference = new Decimal(input.balance).sub(current);
  if (difference.isZero()) return { difference: "0.00", entryId: null };

  const category = await ensureYieldCategory();
  const entry = await recordIncomeExpense({
    type: difference.isPositive() ? "INCOME" : "EXPENSE",
    accountId: id,
    amount: difference.abs().toFixed(2),
    occurredOn: input.occurredOn,
    description: YIELD_CATEGORY_NAME,
    categoryId: category.id,
    idempotencyKey: input.idempotencyKey,
  });
  return { difference: difference.toFixed(2), entryId: entry.id };
}

export async function updateCategory(id: string, input: { name?: string; color?: string }) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new FinanceCategoryError("CATEGORY_NOT_FOUND", 404, "Category not found");
  const name = input.name?.trim();
  if (input.name !== undefined && !name) {
    throw new FinanceCategoryError("CATEGORY_NAME_REQUIRED", 422, "Category name is required");
  }
  if (name) {
    const duplicate = await prisma.category.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: "insensitive" } },
    });
    if (duplicate) throw new FinanceCategoryError("CATEGORY_EXISTS", 409, "Ya existe una categoría con ese nombre");
  }
  return prisma.category.update({
    where: { id },
    data: { ...(name ? { name } : {}), ...(input.color ? { color: input.color } : {}) },
  });
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: {
        select: { postings: true, statementLines: true, recurringCommitments: true, transactions: true },
      },
    },
  });
  if (!category) throw new FinanceCategoryError("CATEGORY_NOT_FOUND", 404, "Category not found");
  const uses = Object.values(category._count).reduce((total, count) => total + count, 0);
  if (uses > 0) {
    throw new FinanceCategoryError(
      "CATEGORY_IN_USE",
      409,
      "La categoría tiene movimientos o suscripciones. Recategorizalos antes de eliminarla."
    );
  }
  await prisma.$transaction([
    prisma.categoryRule.deleteMany({ where: { categoryId: id } }),
    prisma.category.delete({ where: { id } }),
  ]);
}
