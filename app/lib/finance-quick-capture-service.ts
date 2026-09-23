import {
  chooseCategoryRule,
  normalizeMerchantPattern,
} from "@/app/lib/finance-category-service";
import { getCurrentUsdRates } from "@/app/lib/exchange-rate-service";
import { convertUsdPivotAmount } from "@/app/lib/finance-rates";
import type { QuickCaptureCommand } from "@/app/lib/finance-v1-contracts";
import { recordProvisionalCardPurchase } from "@/app/lib/ledger-card-provisional-service";
import { recordIncomeExpense } from "@/app/lib/ledger-cash-flow-service";
import { prisma } from "@/app/lib/prisma";

export class QuickCaptureError extends Error {
  readonly code: string;
  readonly status: 404 | 409 | 422;

  constructor(code: string, status: 404 | 409 | 422, message: string) {
    super(message);
    this.name = "QuickCaptureError";
    this.code = code;
    this.status = status;
  }
}

type CapturableAccount = {
  id: string;
  name: string;
  currency: string;
  kind: string;
  subtype: string;
  isSystem: boolean;
  isActive: boolean;
  accountGroupId: string | null;
};

function isCardAccount(account: CapturableAccount) {
  return account.kind === "LIABILITY" && account.subtype === "CARD" && Boolean(account.accountGroupId);
}

function isCapturable(account: CapturableAccount) {
  return (account.kind === "ASSET" && !account.isSystem) || isCardAccount(account);
}

async function resolveAccount(command: QuickCaptureCommand): Promise<CapturableAccount> {
  let account: CapturableAccount | null = null;
  if (command.accountId) {
    account = await prisma.ledgerAccount.findUnique({ where: { id: command.accountId } });
    if (!account) {
      throw new QuickCaptureError("ACCOUNT_NOT_FOUND", 404, "La cuenta no existe");
    }
  } else if (command.card) {
    const alias = await prisma.walletCardAlias.findUnique({
      where: { aliasNormalized: normalizeMerchantPattern(command.card) },
      include: { ledgerAccount: true },
    });
    // Manual shortcuts pick from account names; Wallet sends the card name.
    const byName = alias
      ? null
      : await prisma.ledgerAccount.findFirst({
          where: { name: { equals: command.card, mode: "insensitive" }, isActive: true, isSystem: false },
        });
    if (!alias && !byName) {
      throw new QuickCaptureError(
        "UNKNOWN_CARD",
        422,
        `La tarjeta "${command.card}" no está asociada a ninguna cuenta. Agregala en Finanzas > Ajustes.`
      );
    }
    account = alias?.ledgerAccount ?? byName;
  }
  if (!account || !account.isActive || !isCapturable(account)) {
    throw new QuickCaptureError(
      "UNSUPPORTED_ACCOUNT",
      422,
      "La cuenta debe ser una cuenta activa o una tarjeta"
    );
  }
  return account;
}

async function convert(amount: string, from: string, to: string) {
  if (from === to) return amount;
  const snapshots = await getCurrentUsdRates([from, to].filter((currency) => currency !== "USD"));
  const rates = new Map(
    [...snapshots.entries()].map(([currency, snapshot]) => [currency, snapshot.rate.toFixed(8)])
  );
  const converted = convertUsdPivotAmount(amount, from, to, rates);
  if (converted === null) {
    throw new QuickCaptureError(
      "RATE_MISSING",
      422,
      `Falta la cotización para convertir ${from} a ${to}. Cargala en Finanzas > Cierre.`
    );
  }
  return converted;
}

export const NO_CATEGORY_LABEL = "Sin categoría";

async function resolveCategoryId(command: QuickCaptureCommand) {
  if (command.categoryId) return command.categoryId;
  if (command.categoryName) {
    if (command.categoryName === NO_CATEGORY_LABEL) return null;
    // An unknown name must not lose the capture; it falls back to the rules.
    const category = await prisma.category.findFirst({
      where: { name: { equals: command.categoryName, mode: "insensitive" } },
      select: { id: true },
    });
    if (category) return category.id;
  }
  const rules = await prisma.categoryRule.findMany({ where: { isActive: true } });
  const rule = chooseCategoryRule(command.merchant, rules);
  if (!rule) return null;
  await prisma.categoryRule.update({ where: { id: rule.id }, data: { lastUsedAt: new Date() } });
  return rule.categoryId;
}

export async function recordQuickCapture(command: QuickCaptureCommand) {
  const account = await resolveAccount(command);
  const accountCurrency = account.currency.trim();
  const purchaseCurrency = command.currency ?? accountCurrency;
  const categoryId = await resolveCategoryId(command);

  let targetCurrency = accountCurrency;
  if (isCardAccount(account)) {
    if (command.kind === "INCOME") {
      throw new QuickCaptureError("CARD_INCOME_NOT_SUPPORTED", 422, "Un ingreso no puede ir a una tarjeta");
    }
    // Prefer the card account billed in the purchase currency (ICBC bills ARS and USD).
    const sameCurrencyCard = await prisma.ledgerAccount.findFirst({
      where: {
        accountGroupId: account.accountGroupId,
        currency: purchaseCurrency,
        kind: "LIABILITY",
        subtype: "CARD",
        isActive: true,
      },
    });
    if (sameCurrencyCard) targetCurrency = purchaseCurrency;
  }

  const amount = await convert(command.amount, purchaseCurrency, targetCurrency);
  const converted = targetCurrency !== purchaseCurrency;
  const description = [
    command.merchant,
    command.note ? `— ${command.note}` : null,
    converted ? `(${command.amount} ${purchaseCurrency})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const entry = isCardAccount(account)
    ? await recordProvisionalCardPurchase({
        cardGroupId: account.accountGroupId!,
        currency: targetCurrency,
        amount,
        occurredOn: command.occurredOn,
        description,
        ...(categoryId ? { categoryId } : {}),
        idempotencyKey: command.idempotencyKey,
      })
    : await recordIncomeExpense({
        type: command.kind,
        accountId: account.id,
        amount,
        occurredOn: command.occurredOn,
        description,
        ...(categoryId ? { categoryId } : {}),
        idempotencyKey: command.idempotencyKey,
      });

  const category = categoryId
    ? await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } })
    : null;
  return {
    id: entry.id,
    kind: command.kind,
    status: entry.status,
    amount,
    currency: targetCurrency,
    original: converted ? { amount: command.amount, currency: purchaseCurrency } : null,
    account: account.name,
    category: category?.name ?? null,
    message: [
      `${amount} ${targetCurrency}`,
      category?.name ?? "Sin categoría",
      account.name,
    ].join(" · "),
  };
}

export async function getQuickCaptureOptions() {
  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ledgerAccount.findMany({
      where: {
        isActive: true,
        isSystem: false,
        OR: [{ kind: "ASSET" }, { kind: "LIABILITY", subtype: "CARD" }],
      },
      select: { id: true, name: true, currency: true, kind: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    categories,
    accounts: accounts.map((account) => ({ ...account, currency: account.currency.trim() })),
    // Plain lists for iOS Shortcuts "Choose from List".
    categoryNames: [NO_CATEGORY_LABEL, ...categories.map((category) => category.name)],
    accountNames: accounts.map((account) => account.name),
  };
}

export async function listWalletCardAliases() {
  return prisma.walletCardAlias.findMany({
    include: { ledgerAccount: { select: { id: true, name: true, currency: true } } },
    orderBy: { label: "asc" },
  });
}

export async function createWalletCardAlias(input: { label: string; ledgerAccountId: string }) {
  const label = input.label.trim();
  const aliasNormalized = normalizeMerchantPattern(label);
  if (!aliasNormalized) {
    throw new QuickCaptureError("ALIAS_REQUIRED", 422, "El nombre de la tarjeta es obligatorio");
  }
  const account = await prisma.ledgerAccount.findUnique({ where: { id: input.ledgerAccountId } });
  if (!account || !account.isActive || !isCapturable(account)) {
    throw new QuickCaptureError("UNSUPPORTED_ACCOUNT", 422, "La cuenta debe ser una cuenta activa o una tarjeta");
  }
  try {
    return await prisma.walletCardAlias.create({
      data: { label, aliasNormalized, ledgerAccountId: account.id },
      include: { ledgerAccount: { select: { id: true, name: true, currency: true } } },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new QuickCaptureError("ALIAS_EXISTS", 409, "Esa tarjeta ya está asociada a una cuenta");
    }
    throw error;
  }
}

export async function updateWalletCardAlias(
  id: string,
  input: { label?: string; ledgerAccountId?: string }
) {
  const alias = await prisma.walletCardAlias.findUnique({ where: { id } });
  if (!alias) throw new QuickCaptureError("ALIAS_NOT_FOUND", 404, "Alias no encontrado");
  const data: { label?: string; aliasNormalized?: string; ledgerAccountId?: string } = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    const aliasNormalized = normalizeMerchantPattern(label);
    if (!aliasNormalized) {
      throw new QuickCaptureError("ALIAS_REQUIRED", 422, "El nombre de la tarjeta es obligatorio");
    }
    Object.assign(data, { label, aliasNormalized });
  }
  if (input.ledgerAccountId !== undefined) {
    const account = await prisma.ledgerAccount.findUnique({ where: { id: input.ledgerAccountId } });
    if (!account || !account.isActive || !isCapturable(account)) {
      throw new QuickCaptureError("UNSUPPORTED_ACCOUNT", 422, "La cuenta debe ser una cuenta activa o una tarjeta");
    }
    data.ledgerAccountId = account.id;
  }
  try {
    return await prisma.walletCardAlias.update({
      where: { id },
      data,
      include: { ledgerAccount: { select: { id: true, name: true, currency: true } } },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new QuickCaptureError("ALIAS_EXISTS", 409, "Esa tarjeta ya está asociada a una cuenta");
    }
    throw error;
  }
}

export async function deleteWalletCardAlias(id: string) {
  const alias = await prisma.walletCardAlias.findUnique({ where: { id } });
  if (!alias) throw new QuickCaptureError("ALIAS_NOT_FOUND", 404, "Alias no encontrado");
  await prisma.walletCardAlias.delete({ where: { id } });
}
