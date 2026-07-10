import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function GET() {
  const debts = await prisma.debt.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json(debts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { description, creditor, amountUSD, amountARS, dueDate, isIncluded } = body;

  const debt = await prisma.debt.create({
    data: {
      description,
      creditor: creditor ?? null,
      amountUSD: amountUSD ?? null,
      amountARS: amountARS ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      isIncluded: isIncluded ?? true,
    },
  });

  return Response.json(debt, { status: 201 });
}
