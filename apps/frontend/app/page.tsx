"use client";

import { useEffect, useState } from "react";

type Kpis = {
  org: { id: string; name: string };
  kpis: { ca_real_eur: number; ca_pred_eur: number; mape: number; mae: number };
  updated_at: string;
};

function euro(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Kpis | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setErr("");
      const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      const token = localStorage.getItem("access") || "";
      if (!token) {
        setData(null);
        return;
      }
      const r = await fetch(base + "/api/kpis", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load on mount
    load();
    // also refresh if token changes (basic polling approach for demo)
    const t = setInterval(() => {
      const token = localStorage.getItem("access");
      if (token && !data && !loading) load();
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("access");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Organisation</div>
          <div className="mt-1 text-xl font-semibold">{data?.org?.name || "—"}</div>
          <div className="mt-2 text-sm text-slate-600">
            Objectif: prévisions CA multi-sites, imports robustes, explications (version locale).
          </div>
        </div>
        <button
          className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Chargement..." : "Recharger"}
        </button>
      </div>

      {!hasToken ? (
        <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-amber-900">
          Tu n’es pas connecté. Va sur <a className="underline" href="/login">/login</a>.
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border bg-rose-50 p-4 text-sm text-rose-900 whitespace-pre-wrap">
          {err}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card title="CA réel (démo)" value={euro(data?.kpis?.ca_real_eur ?? 0)} subtitle="Période: démo" />
        <Card title="CA prédit (démo)" value={euro(data?.kpis?.ca_pred_eur ?? 0)} subtitle="Horizon: J+7" />
        <Card title="MAPE" value={`${(data?.kpis?.mape ?? 0).toFixed(1)}%`} subtitle="Erreur relative" />
        <Card title="MAE" value={euro(data?.kpis?.mae ?? 0)} subtitle="Erreur absolue" />
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold">Prochaines étapes (MVP commercial)</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
          <li>Imports CSV CA + variables externes (météo, trafic, promos), mapping + logs.</li>
          <li>Job Celery: training + backtesting (MAPE/MAE) + importance variables.</li>
          <li>Prévisions J+7/J+30 par site et organisation.</li>
          <li>Alertes (baisse &gt; X%) email + in-app.</li>
        </ul>
        <div className="mt-3 text-xs text-slate-500">
          Dernière mise à jour: {data?.updated_at || "—"}
        </div>
      </div>
    </div>
  );
}