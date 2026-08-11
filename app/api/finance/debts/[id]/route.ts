import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { description, creditor, amountUSD, amountARS, dueDate, isIncluded, isPaid } = body;

  const debt = await prisma.debt.update({
    where: { id },
    data: {
      ...(description !== undefined && { description }),
      ...(creditor !== undefined && { creditor: creditor ?? null }),
      ...(amountUSD !== undefined && { amountUSD: amountUSD ?? null }),
      ...(amountARS !== undefined && { amountARS: amountARS ?? null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(isIncluded !== undefined && { isIncluded }),
      ...(isPaid !== undefined && { isPaid }),
    },
  });

  return Response.json(debt);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.debt.delete({ where: { id } });
  return Response.json({ ok: true });
}
