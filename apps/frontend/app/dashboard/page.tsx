"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiKpis, getHealth, KpisPayload } from "../../components/api";
import { useSession } from "../../components/useSession";

type HealthPayload = {
  ok: boolean;
  env?: string;
};

export default function DashboardPage() {
  const { token, ready } = useSession();

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [kpis, setKpis] = useState<KpisPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ready) return;

    if (!token) {
      window.location.href = "/login";
      return;
    }

    async function load() {
      try {
        setErr("");

        const h = await getHealth();
        setHealth(h);

        const k = await apiKpis(token);
        setKpis(k);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    }

    load();
  }, [ready, token]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Vue synthétique de l’état technique, des données disponibles et du
            prochain meilleur enchaînement d’actions.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">System health</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs uppercase text-emerald-700">API</div>
              <div className="mt-1 text-lg font-semibold text-emerald-900">
                {health?.ok ? "Online" : "Unknown"}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs uppercase text-blue-700">Session</div>
              <div className="mt-1 text-lg font-semibold text-blue-900">
                {token ? "Authenticated" : "Not logged"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-600">Environment</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {health?.env ?? "local"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-600">System</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {health?.ok ? "Operational" : "Check API"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Business KPIs</h2>

          {!kpis ? (
            <div className="mt-3 text-sm text-slate-500">
              Aucun KPI disponible.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs uppercase text-slate-600">
                  Revenue 7 days
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {Number(kpis.revenue_last_7_days).toLocaleString("fr-FR")} €
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs uppercase text-slate-600">
                  Revenue 30 days
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {Number(kpis.revenue_last_30_days).toLocaleString("fr-FR")} €
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs uppercase text-slate-600">Sites</div>
                <div className="mt-1 text-xl font-semibold">
                  {kpis.sites_count}
                </div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-xs uppercase text-slate-600">
                  Data readiness
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {Number(kpis.revenue_last_30_days) > 0 ? "Data available" : "No data"}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recommended actions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Séquence simple pour aller d’un environnement prêt à une démo complète.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  1. Importer les données
                </div>
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  Préparation
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Charger CA, météo, trafic, staffing et événements pour rendre le
                moteur exploitable.
              </p>
              <a
                href="/imports"
                className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Aller aux imports
              </a>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  2. Entraîner le modèle
                </div>
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  Modélisation
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Lancer l’entraînement sur un site pour produire un model run et
                vérifier la qualité.
              </p>
              <a
                href="/forecast"
                className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Aller au forecast
              </a>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  3. Générer les prévisions
                </div>
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  Démonstration
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Produire J+7 et J+30, afficher les graphiques et lire les insights
                opérationnels.
              </p>
              <a
                href="/forecast"
                className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Ouvrir la démo forecast
              </a>
            </div>
          </div>
        </section>

        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            {err}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}