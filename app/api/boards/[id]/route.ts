import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// GET /api/boards/:id — Un board con todo su contenido
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const board = await prisma.board.findUnique({
    where: { id },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          tasks: {
            orderBy: { position: "asc" },
            include: {
              subtasks: { orderBy: { position: "asc" } },
              tags: true,
            },
          },
        },
      },
    },
  });

  if (!board) {
    return Response.json({ error: "Board not found" }, { status: 404 });
  }

  return Response.json(board);
}

// PATCH /api/boards/:id — Renombrar board
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const board = await prisma.board.update({
    where: { id },
    data: { name: body.name },
  });

  return Response.json(board);
}

// DELETE /api/boards/:id — Eliminar board (cascade borra columnas y tareas)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.board.delete({ where: { id } });

  return Response.json({ deleted: true });
}
