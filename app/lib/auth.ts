import { createHmac } from "crypto";

export function createSessionToken(password?: string, secret?: string) {
  if (!password || !secret) return null;
  return createHmac("sha256", secret).update(password).digest("hex");
}
