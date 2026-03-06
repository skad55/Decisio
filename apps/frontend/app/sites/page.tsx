"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiCreateSite, apiSites, type Site } from "../../components/api";
import { useSession } from "../../components/useSession";

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState("Nouveau site");
  const [address, setAddress] = useState("Adresse");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const { token, ready } = useSession();
  const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

  async function load() {
    if (!token) return;
    setErr("");
    const list = await apiSites(token, base);
    setSites(list);
  }

  async function create() {
    if (!token) {
      setErr("Non connecté. Va sur /login.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await apiCreateSite(token, { name, address }, base);
      await load();
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      window.location.href = "/login";
      return;
    }
    load().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  return (
    <AppShell title="Sites">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Sites</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du site"
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Adresse"
          />
          <button
            onClick={create}
            disabled={busy}
            className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Création..." : "Créer"}
          </button>
        </div>

        {err ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border bg-rose-50 p-3 text-sm text-rose-900">
            {err}
          </pre>
        ) : null}

        <ul className="mt-4 space-y-2">
          {sites.map((s) => (
            <li key={s.id} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
              <b>{s.name}</b> — {s.address}
            </li>
          ))}
          {sites.length === 0 ? (
            <li className="rounded-xl border px-3 py-2 text-sm text-slate-500">Aucun site.</li>
          ) : null}
        </ul>
      </div>
    </AppShell>
  );
}