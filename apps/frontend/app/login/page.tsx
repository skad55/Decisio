"use client";

import { useState } from "react";
import AppShell from "../../components/AppShell";
import { apiLogin } from "../../components/api";
import { useSession } from "../../components/useSession";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("Admin123!");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { setAccessToken } = useSession();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      const auth = await apiLogin(email, password, base);
      setAccessToken(auth.access_token);
      window.location.href = "/sites";
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Connexion">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Login</h1>

        <form onSubmit={submit} className="mt-4 grid max-w-md gap-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
          />
          <input
            type="password"
            className="rounded-xl border px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl border bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {err ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border bg-rose-50 p-3 text-sm text-rose-900">
            {err}
          </pre>
        ) : null}
      </div>
    </AppShell>
  );
}