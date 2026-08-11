import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function GET() {
  const transactions = await prisma.transaction.findMany({
    include: { account: true, category: true },
    orderBy: { date: "desc" },
  });
  return Response.json(transactions);
}

export async function POST(request: NextRequest) {
  const { type, description, amount, currency, amountUSD, date, isRecurring, method, cardName, accountId, categoryId } = await request.json();

  const transaction = await prisma.transaction.create({
    data: {
      type,
      description,
      amount,
      currency,
      amountUSD: amountUSD ?? null,
      date: new Date(date),
      isRecurring: isRecurring ?? false,
      method: method ?? "CASH",
      cardName: cardName ?? null,
      accountId: accountId || null,
      categoryId: categoryId || null,
    },
    include: { account: true, category: true },
  });

  return Response.json(transaction, { status: 201 });
}
