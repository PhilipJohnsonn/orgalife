import { prisma } from "@/app/lib/prisma";
import { NextRequest } from "next/server";

export async function GET() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return Response.json(categories);
}

export async function POST(request: NextRequest) {
  const { name, color } = await request.json();
  const category = await prisma.category.create({ data: { name, color } });
  return Response.json(category, { status: 201 });
}
