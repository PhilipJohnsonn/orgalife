import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  hashSessionToken,
  mcpBearerDecision,
  sessionIsActive,
} from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export async function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (sessionToken) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(sessionToken) },
      select: { expiresAt: true, revokedAt: true },
    });

    if (sessionIsActive(session)) return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const mcpDecision = mcpBearerDecision(
    authHeader,
    process.env.MCP_API_KEY,
    request.nextUrl.pathname
  );
  if (mcpDecision === "allow") return NextResponse.next();
  if (mcpDecision === "forbid") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return unauthorized(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
