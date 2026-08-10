import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/app/lib/auth";

const COOKIE_NAME = "orgalife-session";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const sessionToken = createSessionToken(
    process.env.AUTH_PASSWORD,
    process.env.AUTH_SECRET
  );

  if (!sessionToken) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
