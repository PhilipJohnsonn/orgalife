import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createOpaqueSessionToken,
  hashSessionToken,
} from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

/** Creates an opaque session (only its hash is stored), revokes the previous one and sets the cookie. */
export async function startSession(request: NextRequest, response: NextResponse) {
  const sessionToken = createOpaqueSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
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

/**
 * Route handlers behind the reverse proxy see an internal host in request.url,
 * so their redirects use a relative Location instead of an absolute URL.
 */
export function relativeRedirect(location: string) {
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}
