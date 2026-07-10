import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { isExcluded, excludeReason, description, amountARS, amountUSD } = body;

  const expense = await prisma.cardExpense.update({
    where: { id },
    data: {
      ...(isExcluded !== undefined && { isExcluded }),
      ...(excludeReason !== undefined && { excludeReason: excludeReason ?? null }),
      ...(description !== undefined && { description }),
      ...(amountARS !== undefined && { amountARS: amountARS ?? null }),
      ...(amountUSD !== undefined && { amountUSD: amountUSD ?? null }),
    },
  });

  return Response.json(expense);
}
