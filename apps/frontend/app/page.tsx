"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { apiKpis, getHealth, KpisPayload } from "../components/api";
import { useSession } from "../components/useSession";

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { token, ready } = useSession();

  const [health, setHealth] = useState<{ ok: boolean; env?: string } | null>(null);
  const [kpis, setKpis] = useState<KpisPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const healthData = await getHealth();
      setHealth(healthData);

      if (token) {
        const kpisData = await apiKpis(token);
        setKpis(kpisData);
      } else {
        setKpis(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Vue rapide de la santé API et des KPI principaux.</p>
          <div className="mt-3 text-sm text-slate-700">
            API health: {health ? (health.ok ? "OK" : "KO") : "—"}
            {health?.env ? ` (${health.env})` : ""}
          </div>
        </section>

        {!token ? (
          <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-amber-900">
            Non connecté. Rendez-vous sur <a className="underline" href="/login">/login</a>.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border bg-rose-50 p-4 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card title="CA réel" value={euro(kpis?.kpis.ca_real_eur ?? 0)} />
          <Card title="CA prédit" value={euro(kpis?.kpis.ca_pred_eur ?? 0)} />
          <Card title="MAPE" value={`${((kpis?.kpis.mape ?? 0) * 100).toFixed(2)} %`} />
          <Card title="MAE" value={euro(kpis?.kpis.mae ?? 0)} />
        </div>

        <button
          className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          onClick={load}
          disabled={loading}
          type="button"
        >
          {loading ? "Chargement..." : "Rafraîchir"}
        </button>
      </div>
    </AppShell>
  );
}