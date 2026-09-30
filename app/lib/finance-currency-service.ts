import { Prisma } from "@/app/generated/prisma/client";
import {
  CurrencyError,
  assertCurrencyRemovable,
  parseCurrencyCode,
} from "@/app/lib/finance-currencies";
import { prisma } from "@/app/lib/prisma";

export async function listEnabledCurrencies(): Promise<string[]> {
  const rows = await prisma.enabledCurrency.findMany({ orderBy: { code: "asc" } });
  return rows.map((row) => row.code.trim());
}

export async function enableCurrency(input: unknown): Promise<string> {
  const code = parseCurrencyCode(input);
  try {
    await prisma.enabledCurrency.create({ data: { code } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CurrencyError("CURRENCY_EXISTS", 409, `${code} ya está habilitada`);
    }
    throw error;
  }
  return code;
}

export async function disableCurrency(input: unknown): Promise<void> {
  const code = parseCurrencyCode(input);
  const existing = await prisma.enabledCurrency.findUnique({ where: { code } });
  if (!existing) throw new CurrencyError("CURRENCY_NOT_FOUND", 404, `${code} no está habilitada`);
  const activeAccounts = await prisma.ledgerAccount.findMany({
    where: { currency: code, isActive: true, isSystem: false },
    select: { name: true, currency: true },
    orderBy: { name: "asc" },
  });
  assertCurrencyRemovable(code, activeAccounts);
  await prisma.enabledCurrency.delete({ where: { code } });
}
