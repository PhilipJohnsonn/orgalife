import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const COOKIE_NAME = "orgalife-session";

function expectedToken(): string {
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(password).digest("hex");
}

function expectedApiKey(): string {
  return process.env.MCP_API_KEY ?? "";
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token === expectedToken()) return NextResponse.next();

  const apiKey = expectedApiKey();
  const authHeader = request.headers.get("authorization");
  if (apiKey && authHeader === `Bearer ${apiKey}`) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
