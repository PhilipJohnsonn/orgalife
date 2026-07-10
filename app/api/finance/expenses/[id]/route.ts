import { prisma } from "@/app/lib/prisma";
import { buildTransactionData } from "@/app/lib/finance";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { isExcluded, excludeReason, description, amountARS, amountUSD, exchangeRate } = body;

  const expense = await prisma.cardExpense.update({
    where: { id },
    data: {
      ...(isExcluded !== undefined && { isExcluded }),
      ...(excludeReason !== undefined && { excludeReason: excludeReason ?? null }),
      ...(description !== undefined && { description }),
      ...(amountARS !== undefined && { amountARS: amountARS ?? null }),
      ...(amountUSD !== undefined && { amountUSD: amountUSD ?? null }),
    },
    include: { statement: true, transaction: true },
  });

  // Sync con la transacción derivada: excluir la borra, reincluir la recrea.
  if (isExcluded === true && expense.transaction) {
    await prisma.transaction.delete({ where: { id: expense.transaction.id } });
  } else if (
    isExcluded === false &&
    !expense.transaction &&
    (expense.amountARS != null || expense.amountUSD != null)
  ) {
    await prisma.transaction.create({
      data: buildTransactionData(expense, expense.statement.cardName, expense.statement.dueDate, exchangeRate),
    });
  }

  return Response.json(expense);
}
