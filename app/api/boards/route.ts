import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// GET /api/boards — Lista todos los boards con sus columnas y tareas
export async function GET() {
  const boards = await prisma.board.findMany({
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

  return Response.json(boards);
}

// POST /api/boards — Crea un board con columnas default
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name } = body;

  const board = await prisma.board.create({
    data: {
      name,
      columns: {
        create: [
          { name: "Por hacer", position: 0 },
          { name: "En progreso", position: 1 },
          { name: "Hecho", position: 2 },
        ],
      },
    },
    include: {
      columns: { orderBy: { position: "asc" } },
    },
  });

  return Response.json(board, { status: 201 });
}
