import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// PATCH /api/tags/:id — Update tag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;

  const tag = await prisma.tag.update({
    where: { id },
    data,
  });

  return Response.json(tag);
}

// DELETE /api/tags/:id — Delete tag
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.tag.delete({ where: { id } });

  return Response.json({ deleted: true });
}
