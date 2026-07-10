import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { cardName, amountUSD, amountARS, dueDate, isPaid } = body;

  const statement = await prisma.cardStatement.update({
    where: { id },
    data: {
      ...(cardName !== undefined && { cardName }),
      ...(amountUSD !== undefined && { amountUSD: amountUSD ?? null }),
      ...(amountARS !== undefined && { amountARS: amountARS ?? null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(isPaid !== undefined && { isPaid }),
    },
    include: { expenses: true },
  });

  return Response.json(statement);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.cardStatement.delete({ where: { id } });
  return Response.json({ ok: true });
}
