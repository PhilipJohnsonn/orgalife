import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// POST /api/columns — Crear una columna en un board
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, boardId } = body;

  const lastColumn = await prisma.column.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
  });

  const column = await prisma.column.create({
    data: {
      name,
      position: lastColumn ? lastColumn.position + 1 : 0,
      boardId,
    },
    include: {
      tasks: true,
    },
  });

  return Response.json(column, { status: 201 });
}
