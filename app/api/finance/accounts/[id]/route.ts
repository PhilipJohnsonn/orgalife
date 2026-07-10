import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { name, currencies, color, isActive } = body;

  const account = await prisma.financialAccount.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(currencies !== undefined && { currencies }),
      ...(color !== undefined && { color }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return Response.json(account);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.financialAccount.delete({ where: { id } });
  return Response.json({ ok: true });
}
