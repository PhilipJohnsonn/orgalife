import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// PATCH /api/columns/:id/reorder — Batch-update task positions within a column
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { taskIds } = await request.json();

  await prisma.$transaction(
    (taskIds as string[]).map((taskId, index) =>
      prisma.task.update({
        where: { id: taskId },
        data: { position: index, columnId: id },
      })
    )
  );

  return Response.json({ ok: true });
}
