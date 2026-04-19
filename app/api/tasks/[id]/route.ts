import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// GET /api/tasks/:id — Detalle de una tarea
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      subtasks: { orderBy: { position: "asc" } },
      tags: true,
    },
  });

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json(task);
}

// PATCH /api/tasks/:id — Actualizar tarea (título, descripción, prioridad, mover de columna, etc)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.dueDate !== undefined)
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.position !== undefined) data.position = body.position;
  if (body.columnId !== undefined) data.columnId = body.columnId;

  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      subtasks: { orderBy: { position: "asc" } },
      tags: true,
    },
  });

  return Response.json(task);
}

// DELETE /api/tasks/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.task.delete({ where: { id } });

  return Response.json({ deleted: true });
}
