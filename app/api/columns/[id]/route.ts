import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// PATCH /api/columns/:id — Renombrar o reordenar columna
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.position !== undefined) data.position = body.position;

  const column = await prisma.column.update({
    where: { id },
    data,
  });

  return Response.json(column);
}

// DELETE /api/columns/:id — Borrar columna (cascade borra sus tareas)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.column.delete({ where: { id } });

  return Response.json({ deleted: true });
}
