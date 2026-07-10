import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function GET() {
  const statements = await prisma.cardStatement.findMany({
    orderBy: { createdAt: "desc" },
    include: { expenses: true },
  });
  return Response.json(statements);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardName, amountUSD, amountARS, dueDate, expenses } = body;

  const statement = await prisma.cardStatement.create({
    data: {
      cardName,
      amountUSD: amountUSD ?? null,
      amountARS: amountARS ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      expenses: expenses?.length
        ? { create: expenses.map((e: { description: string; installmentInfo?: string; originalCurrency?: string; originalAmount?: number; amountARS?: number; amountUSD?: number; isExcluded?: boolean; excludeReason?: string }) => ({
            description: e.description,
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

  return Response.json(statement, { status: 201 });
}
