import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

// GET /api/tags — List all tags
export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
  });

  return Response.json(tags);
}

// POST /api/tags — Create a tag
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, color } = body;

  const tag = await prisma.tag.create({
    data: {
      name,
      color: color || "#6B7280",
    },
  });

  return Response.json(tag, { status: 201 });
}
