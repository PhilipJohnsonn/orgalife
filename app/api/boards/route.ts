import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// GET /api/boards — Lista todos los boards con sus columnas y tareas
export async function GET(request: NextRequest) {
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";

  const boards = await prisma.board.findMany({
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          tasks: {
            where: includeArchived ? undefined : { isArchived: false },
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
          { name: "To Do", position: 0 },
          { name: "In Progress", position: 1 },
          { name: "Done", position: 2 },
        ],
      },
    },
    include: {
      columns: { orderBy: { position: "asc" } },
    },
  });

  return Response.json(board, { status: 201 });
}
