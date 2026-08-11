import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function GET() {
  const accounts = await prisma.financialAccount.findMany({
    orderBy: { createdAt: "asc" },
  });
  return Response.json(accounts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, currencies, color } = body;

  const account = await prisma.financialAccount.create({
    data: { name, currencies: currencies ?? [], color },
  });

  return Response.json(account, { status: 201 });
}
