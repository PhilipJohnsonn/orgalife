import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/app/lib/auth";

const COOKIE_NAME = "orgalife-session";

function expectedApiKey(): string {
  return process.env.MCP_API_KEY ?? "";
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const expectedToken = createSessionToken(
    process.env.AUTH_PASSWORD,
    process.env.AUTH_SECRET
  );
  if (expectedToken && token === expectedToken) return NextResponse.next();

  const apiKey = expectedApiKey();
  const authHeader = request.headers.get("authorization");
  if (apiKey && authHeader === `Bearer ${apiKey}`) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
