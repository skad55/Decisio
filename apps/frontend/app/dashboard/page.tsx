"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiKpis, getHealth, KpisPayload } from "../../components/api";
import { useSession } from "../../components/useSession";

type HealthPayload = {
  ok: boolean;
  env?: string;
};

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(2)} %`;
}

function signedPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} %`;
}

function signedEuro(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${euro(value)}`;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "red" | "slate";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "red"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", toneClass)}>
      {label}
    </span>
  );
}

function MetricCard({
  title,
  value,
  tone = "default",
  subtitle,
}: {
  title: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
  subtitle?: string;
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : tone === "bad"
      ? "border-rose-200 bg-rose-50"
      : "border-slate-200 bg-white";

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-slate-600">{subtitle}</div> : null}
    </div>
  );
}

function InsightRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900">{label}</div>
          <div className="mt-1 text-sm text-slate-600">{detail}</div>
        </div>
        <div className="shrink-0">{value}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { token, ready } = useSession();
  const [health, setHealth] = useState<HealthPayload | null>(null);
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

  const computed = useMemo(() => {
    const actual = Number(kpis?.kpis.ca_real_eur ?? 0);
    const predicted = Number(kpis?.kpis.ca_pred_eur ?? 0);
    const mape = Number(kpis?.kpis.mape ?? 0);
    const mae = Number(kpis?.kpis.mae ?? 0);

    const delta = predicted - actual;
    const deltaPct = actual !== 0 ? (delta / actual) * 100 : null;

    let precisionTone: "good" | "warn" | "bad" = "warn";
    let precisionText = "Précision moyenne";
    if (mape <= 0.1) {
      precisionTone = "good";
      precisionText = "Précision solide";
    } else if (mape <= 0.2) {
      precisionTone = "warn";
      precisionText = "Précision acceptable";
    } else {
      precisionTone = "bad";
      precisionText = "Précision insuffisante";
    }

    let biasTone: "good" | "warn" | "bad" = "good";
    let biasText = "Prévision équilibrée";
    if (delta > 0) {
      biasTone = Math.abs(deltaPct ?? 0) > 10 ? "warn" : "good";
      biasText = "Sur-prédiction";
    } else if (delta < 0) {
      biasTone = Math.abs(deltaPct ?? 0) > 10 ? "warn" : "good";
      biasText = "Sous-prédiction";
    }

    return {
      actual,
      predicted,
      mape,
      mae,
      delta,
      deltaPct,
      precisionTone,
      precisionText,
      biasTone,
      biasText,
    };
  }, [kpis]);

  const apiTone: "green" | "amber" | "red" =
    health?.ok === true ? "green" : health ? "red" : "amber";

  const sessionTone: "green" | "amber" = token ? "green" : "amber";

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">
                Vue de démonstration du produit : état technique, KPI forecast et lecture métier.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={health ? (health.ok ? "API disponible" : "API indisponible") : "API en attente"}
                tone={apiTone}
              />
              <StatusPill
                label={token ? "Session active" : "Non connecté"}
                tone={sessionTone}
              />
              {health?.env ? <StatusPill label={`ENV ${health.env}`} tone="slate" /> : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              onClick={load}
              disabled={loading}
              type="button"
            >
              {loading ? "Chargement..." : "Rafraîchir"}
            </button>

            {!token ? (
              <a
                href="/login"
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Aller au login
              </a>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            title="API health"
            value={health ? (health.ok ? "OK" : "KO") : "—"}
            tone={health?.ok ? "good" : health ? "bad" : "warn"}
            subtitle={health?.env ? `Environnement: ${health.env}` : "État de l’API"}
          />

          <MetricCard
            title="CA réel"
            value={euro(computed.actual)}
            subtitle="Valeur issue des KPI agrégés"
          />

          <MetricCard
            title="CA prédit"
            value={euro(computed.predicted)}
            subtitle="Prévision agrégée"
          />

          <MetricCard
            title="Écart forecast"
            value={signedEuro(computed.delta)}
            tone={Math.abs(computed.deltaPct ?? 0) > 10 ? "warn" : "good"}
            subtitle={computed.deltaPct === null ? "Base réelle nulle" : signedPercent(computed.deltaPct)}
          />

          <MetricCard
            title="MAPE"
            value={percent(computed.mape)}
            tone={computed.precisionTone}
            subtitle={computed.precisionText}
          />

          <MetricCard
            title="MAE"
            value={euro(computed.mae)}
            tone={computed.mae > 0 ? "default" : "warn"}
            subtitle="Erreur absolue moyenne"
          />
        </div>

        <SectionCard
          title="Lecture métier"
          subtitle="Interprétation immédiate des KPI pour une démonstration client ou investisseur."
        >
          <div className="grid grid-cols-1 gap-3">
            <InsightRow
              label="État technique"
              value={
                <StatusPill
                  label={health?.ok ? "Prêt pour démo" : "Vérification requise"}
                  tone={health?.ok ? "green" : "red"}
                />
              }
              detail="Le produit doit au minimum exposer une API saine et une session exploitable pour être démontrable."
            />

            <InsightRow
              label="Connexion utilisateur"
              value={
                <StatusPill
                  label={token ? "Authentifié" : "À connecter"}
                  tone={token ? "green" : "amber"}
                />
              }
              detail="Sans session active, le dashboard ne charge pas les KPI métier sécurisés."
            />

            <InsightRow
              label="Niveau de précision"
              value={<StatusPill label={computed.precisionText} tone={computed.precisionTone === "good" ? "green" : computed.precisionTone === "warn" ? "amber" : "red"} />}
              detail={`MAPE observé: ${percent(computed.mape)}. En dessous de 10 %, la lecture devient crédible pour une démo business.`}
            />

            <InsightRow
              label="Biais de prévision"
              value={<StatusPill label={computed.biasText} tone={computed.biasTone === "good" ? "green" : computed.biasTone === "warn" ? "amber" : "red"} />}
              detail={
                computed.deltaPct === null
                  ? "Impossible de calculer un pourcentage d’écart car la base réelle vaut 0."
                  : `Écart relatif observé: ${signedPercent(computed.deltaPct)} entre le réalisé et le prédit.`
              }
            />

            <InsightRow
              label="Verdict démonstration"
              value={
                <StatusPill
                  label={
                    health?.ok && token
                      ? "Démo exploitable"
                      : health?.ok
                      ? "Technique OK, login requis"
                      : "Blocage technique"
                  }
                  tone={health?.ok && token ? "green" : health?.ok ? "amber" : "red"}
                />
              }
              detail="Ce verdict est volontairement simple : il sert à lire le produit en 5 secondes."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Checks rapides"
          subtitle="Contrôles manuels immédiats après relance."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">Ce que tu dois voir</div>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>Un header lisible avec statuts API et session.</li>
                <li>6 cartes KPI avec écart forecast explicite.</li>
                <li>Une section “Lecture métier” intelligible sans explication orale.</li>
                <li>Un bouton de rafraîchissement fonctionnel.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">Ce que ce lot ne change pas</div>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>Aucune logique ML.</li>
                <li>Aucune route backend.</li>
                <li>Aucun schéma SQL.</li>
                <li>Aucune dépendance npm supplémentaire.</li>
              </ul>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}