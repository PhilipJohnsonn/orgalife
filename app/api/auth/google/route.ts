import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_AUTH_COOKIE, authorizationUrl, createAuthRequest, googleConfig } from "@/app/lib/google-oidc";

export function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL("/login?error=google", request.url));

  const authRequest = createAuthRequest();
  const response = NextResponse.redirect(authorizationUrl(config, authRequest));
  response.cookies.set(GOOGLE_AUTH_COOKIE, Buffer.from(JSON.stringify(authRequest)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 60 * 10,
  });
  return response;
}
