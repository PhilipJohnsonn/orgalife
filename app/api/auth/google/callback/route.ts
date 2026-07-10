import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const COOKIE_NAME = "orgalife-session";
const STATE_COOKIE = "orgalife-oauth-state";

function expectedToken(): string {
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(password).digest("hex");
}

function loginError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(
    new URL(`/login?error=${error}`, request.url)
  );
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return loginError(request, "google");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: new URL("/api/auth/google/callback", request.url).toString(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) return loginError(request, "google");

  const { id_token: idToken } = await tokenRes.json();
  if (!idToken) return loginError(request, "google");

  // El ID token llega directo de Google por TLS en el canje del code,
  // por eso alcanza con decodificar el payload sin verificar la firma.
  const payload = JSON.parse(
    Buffer.from(idToken.split(".")[1], "base64url").toString()
  );

  const allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL ?? "";
  if (!allowedEmail || payload.email !== allowedEmail || !payload.email_verified) {
    return loginError(request, "email");
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(STATE_COOKIE);
  response.cookies.set(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
