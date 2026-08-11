import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createOpaqueSessionToken,
  hashSessionToken,
  passwordMatches,
} from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
}

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

  const sessionToken = createOpaqueSessionToken();
  const expiresAt = sessionExpiry();
  const previousToken = request.cookies.get(COOKIE_NAME)?.value;
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || null;

  await prisma.$transaction(async (transaction) => {
    if (previousToken) {
      await transaction.session.updateMany({
        where: {
          tokenHash: hashSessionToken(previousToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    await transaction.session.create({
      data: {
        tokenHash: hashSessionToken(sessionToken),
        expiresAt,
        userAgent,
      },
    });
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
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
