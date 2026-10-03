import type { NextRequest } from "next/server";
import { relativeRedirect, startSession } from "@/app/lib/auth-session";
import { GOOGLE_AUTH_COOKIE, GOOGLE_TOKEN_URL, googleConfig, verifyGoogleIdToken } from "@/app/lib/google-oidc";

function readAuthRequest(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString());
    const valid = ["state", "nonce", "codeVerifier"].every((key) => typeof parsed?.[key] === "string" && parsed[key]);
    return valid ? (parsed as { state: string; nonce: string; codeVerifier: string }) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const config = googleConfig();
  const loginError = (error: "google" | "email") => {
    const response = relativeRedirect(`/login?error=${error}`);
    response.cookies.delete({ name: GOOGLE_AUTH_COOKIE, path: "/api/auth/google" });
    return response;
  };

  const authRequest = readAuthRequest(request.cookies.get(GOOGLE_AUTH_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  if (!config || !authRequest || !code || request.nextUrl.searchParams.get("state") !== authRequest.state) {
    return loginError("google");
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: authRequest.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!tokenResponse.ok) return loginError("google");
    const { id_token: idToken } = (await tokenResponse.json()) as { id_token?: string };
    if (!idToken) return loginError("google");

    const verified = await verifyGoogleIdToken(idToken, {
      clientId: config.clientId,
      nonce: authRequest.nonce,
      allowedEmail: config.allowedEmail,
    });
    if (!verified.ok) return loginError(verified.reason);
  } catch (error) {
    console.error("auth_google_callback_failed", error instanceof Error ? error.name : "unknown");
    return loginError("google");
  }

  const response = relativeRedirect("/");
  response.cookies.delete({ name: GOOGLE_AUTH_COOKIE, path: "/api/auth/google" });
  return startSession(request, response);
}
