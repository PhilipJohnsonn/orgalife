import { prisma } from "@/app/lib/prisma";
import { buildTransactionData } from "@/app/lib/finance";
import { NextRequest } from "next/server";

export async function GET() {
  const statements = await prisma.cardStatement.findMany({
    orderBy: { createdAt: "desc" },
    include: { expenses: true },
  });
  return Response.json(statements);
}

interface ExpenseInput {
  description: string;
  purchaseDate?: string | null;
  installmentInfo?: string | null;
  originalCurrency?: string | null;
  originalAmount?: number | null;
  amountARS?: number | null;
  amountUSD?: number | null;
  isExcluded?: boolean;
  excludeReason?: string | null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardName, amountUSD, amountARS, dueDate, expenses, exchangeRate } = body as {
    cardName: string;
    amountUSD?: number | null;
    amountARS?: number | null;
    dueDate?: string | null;
    expenses?: ExpenseInput[];
    exchangeRate?: number;
  };

  const parsedDueDate = dueDate ? new Date(dueDate) : null;

  const statement = await prisma.$transaction(async (tx) => {
    const created = await tx.cardStatement.create({
      data: {
        cardName,
        amountUSD: amountUSD ?? null,
        amountARS: amountARS ?? null,
        dueDate: parsedDueDate,
        expenses: expenses?.length
          ? { create: expenses.map((e) => ({
              description: e.description,
              purchaseDate: e.purchaseDate ? new Date(e.purchaseDate) : null,
              installmentInfo: e.installmentInfo ?? null,
              originalCurrency: e.originalCurrency ?? null,
              originalAmount: e.originalAmount ?? null,
              amountARS: e.amountARS ?? null,
              amountUSD: e.amountUSD ?? null,
              isExcluded: e.isExcluded ?? false,
              excludeReason: e.excludeReason ?? null,
            })) }
          : undefined,
      },
      include: { expenses: true },
    });

    if (created.expenses.length === 0) return created;

    // Dedup: las compras con esta tarjeta cargadas a mano quedan reemplazadas por el
    // resumen. Solo hasta la última compra del resumen — lo posterior al cierre
    // pertenece al próximo.
    const purchaseDates = created.expenses
      .map((e) => e.purchaseDate)
      .filter((d): d is Date => d !== null);
    const cutoff = purchaseDates.length
      ? new Date(Math.max(...purchaseDates.map((d) => d.getTime())))
      : parsedDueDate ?? new Date();

    await tx.transaction.deleteMany({
      where: {
        type: "EXPENSE",
        method: "CREDIT",
        cardName,
        cardExpenseId: null,
        date: { lte: cutoff },
      },
    });

    await tx.transaction.createMany({
      data: created.expenses
        .filter((e) => !e.isExcluded && (e.amountARS != null || e.amountUSD != null))
        .map((e) => buildTransactionData(e, created.cardName, parsedDueDate, exchangeRate)),
    });

    return created;
  });

  return Response.json(statement, { status: 201 });
}
