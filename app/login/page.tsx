"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GoogleError() {
  const error = useSearchParams().get("error");
  if (!error) return null;

  return (
    <p className="text-sm text-destructive">
      {error === "email"
        ? "Esa cuenta de Google no está autorizada."
        : "No se pudo iniciar sesión con Google."}
    </p>
  );
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">OrgaLife</h1>
          <p className="text-sm text-muted-foreground">
            Ingresá tu contraseña para continuar.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoFocus
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {error && (
            <p className="text-sm text-destructive">Contraseña incorrecta.</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">o</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-4">
          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16A11 11 0 0 0 2.18 7.06L5.84 9.9c.87-2.6 3.3-4.53 6.16-4.53Z"
              />
            </svg>
            Continuar con Google
          </a>
          <Suspense>
            <GoogleError />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
