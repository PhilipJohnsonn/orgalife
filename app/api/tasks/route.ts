import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// POST /api/tasks — Crear una tarea en una columna
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, description, priority, dueDate, columnId } = body;

  // Calcular la posición: se agrega al final de la columna
  const lastTask = await prisma.task.findFirst({
    where: { columnId },
    orderBy: { position: "desc" },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      position: lastTask ? lastTask.position + 1 : 0,
      columnId,
    },
    include: {
      subtasks: true,
      tags: true,
    },
  });

  return Response.json(task, { status: 201 });
}
