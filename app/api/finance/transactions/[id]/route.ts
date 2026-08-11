import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { type, description, amount, currency, amountUSD, date, isRecurring, method, cardName, accountId, categoryId } = await request.json();

  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(description !== undefined && { description }),
      ...(amount !== undefined && { amount }),
      ...(currency !== undefined && { currency }),
      ...(amountUSD !== undefined && { amountUSD }),
      ...(date !== undefined && { date: new Date(date) }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(method !== undefined && { method }),
      ...(cardName !== undefined && { cardName: cardName || null }),
      ...(accountId !== undefined && { accountId: accountId || null }),
      ...(categoryId !== undefined && { categoryId: categoryId || null }),
    },
    include: { account: true, category: true },
  });

  return Response.json(transaction);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.transaction.delete({ where: { id } });
  return Response.json({ ok: true });
}
