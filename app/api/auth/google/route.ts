import { NextResponse } from "next/server";
import { GOOGLE_AUTH_COOKIE, authorizationUrl, createAuthRequest, googleConfig } from "@/app/lib/google-oidc";
import { relativeRedirect } from "@/app/lib/auth-session";

export function GET() {
  const config = googleConfig();
  if (!config) return relativeRedirect("/login?error=google");

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
