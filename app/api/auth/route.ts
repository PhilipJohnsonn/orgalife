import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const COOKIE_NAME = "orgalife-session";

function expectedToken(): string {
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(password).digest("hex");
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, expectedToken(), {
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
