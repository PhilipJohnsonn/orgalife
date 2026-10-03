import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, hashSessionToken, passwordMatches } from "@/app/lib/auth";
import { startSession } from "@/app/lib/auth-session";
import { prisma } from "@/app/lib/prisma";

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.AUTH_PASSWORD;

  if (!configuredPassword) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!passwordMatches(password, configuredPassword)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  return startSession(request, NextResponse.json({ ok: true }));
}

export async function DELETE(request: NextRequest) {
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (sessionToken) {
    await prisma.session.updateMany({
      where: {
        tokenHash: hashSessionToken(sessionToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
