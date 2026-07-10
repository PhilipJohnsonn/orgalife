import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const STATE_COOKIE = "orgalife-oauth-state";

export function GET(request: NextRequest) {
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  authUrl.searchParams.set(
    "redirect_uri",
    new URL("/api/auth/google/callback", request.url).toString()
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
