import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// PATCH /api/subtasks/:id — Marcar como done/undone o renombrar
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.done !== undefined) data.done = body.done;
  if (body.position !== undefined) data.position = body.position;

  const subtask = await prisma.subtask.update({
    where: { id },
    data,
  });

  return Response.json(subtask);
}

// DELETE /api/subtasks/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.subtask.delete({ where: { id } });

  return Response.json({ deleted: true });
}
