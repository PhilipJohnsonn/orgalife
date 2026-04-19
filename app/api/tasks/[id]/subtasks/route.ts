import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// POST /api/tasks/:id/subtasks — Agregar subtarea a una tarea
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const body = await request.json();

  const lastSubtask = await prisma.subtask.findFirst({
    where: { taskId },
    orderBy: { position: "desc" },
  });

  const subtask = await prisma.subtask.create({
    data: {
      title: body.title,
      position: lastSubtask ? lastSubtask.position + 1 : 0,
      taskId,
    },
  });

  return Response.json(subtask, { status: 201 });
}
