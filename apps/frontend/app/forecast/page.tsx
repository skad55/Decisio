"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import ForecastChart from "../../components/ForecastChart";
import {
  forecast,
  ForecastPayload,
  getSites,
  Site,
  trainModel,
  TrainResponse,
} from "../../components/api";
import { useSession } from "../../components/useSession";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function shortNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "red" | "blue" | "slate";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "red"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClass
      )}
    >
      {label}
    </span>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  tone = "default",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : tone === "bad"
      ? "border-rose-200 bg-rose-50"
      : tone === "info"
      ? "border-blue-200 bg-blue-50"
      : "border-slate-200 bg-white";

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-slate-600">{subtitle}</div> : null}
    </div>
  );
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

type ForecastBlockMeta = {
  model_run_id?: string;
  site_id?: string;
  horizon_days?: number;
  insights?: string[];
  forecast: Array<{
    day: string;
    predicted_revenue_eur: number | string;
  }>;
};

function getForecastMeta(block: ForecastPayload | null): ForecastBlockMeta | null {
  if (!block) return null;
  return block as unknown as ForecastBlockMeta;
}

function sumForecast(block: ForecastPayload | null) {
  const meta = getForecastMeta(block);
  if (!meta?.forecast?.length) return 0;

  return meta.forecast.reduce((acc, row) => {
    return acc + Number(row.predicted_revenue_eur || 0);
  }, 0);
}

function avgForecast(block: ForecastPayload | null) {
  const meta = getForecastMeta(block);
  if (!meta?.forecast?.length) return 0;
  return sumForecast(block) / meta.forecast.length;
}

function classifyInsight(insight: string) {
  const normalized = insight.toLowerCase();

  if (
    normalized.includes("risque") ||
    normalized.includes("baisse") ||
    normalized.includes("attention") ||
    normalized.includes("tension") ||
    normalized.includes("sous") ||
    normalized.includes("retard")
  ) {
    return {
      toneClass: "border-rose-200 bg-rose-50",
      badgeLabel: "Point de vigilance",
    };
  }

  if (
    normalized.includes("opportunité") ||
    normalized.includes("hausse") ||
    normalized.includes("croissance") ||
    normalized.includes("potentiel") ||
    normalized.includes("levier")
  ) {
    return {
      toneClass: "border-emerald-200 bg-emerald-50",
      badgeLabel: "Point favorable",
    };
  }

  return {
    toneClass: "border-slate-200 bg-white",
    badgeLabel: "Point d’analyse",
  };
}

export default function ForecastPage() {
  const { token, ready } = useSession();

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>("");

  const [training, setTraining] = useState(false);
  const [forecasting, setForecasting] = useState(false);

  const [trainResult, setTrainResult] = useState<TrainResponse | null>(null);
  const [forecast7, setForecast7] = useState<ForecastPayload | null>(null);
  const [forecast30, setForecast30] = useState<ForecastPayload | null>(null);

  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ready) return;

    if (!token) {
      window.location.href = "/login";
      return;
    }

    async function loadSites() {
      try {
        setErr("");
        const rows = await getSites(token);
        setSites(rows);

        if (rows.length > 0) {
          setSiteId(rows[0].id);
        }
      } catch (error: any) {
        setErr(String(error?.message || error));
      }
    }

    loadSites();
  }, [ready, token]);

  async function onTrain() {
    if (!token) {
      setErr("Non connecté.");
      return;
    }
    if (!siteId) {
      setErr("Aucun site sélectionné.");
      return;
    }

    try {
      setTraining(true);
      setErr("");
      setTrainResult(null);

      const result = await trainModel(token, siteId);
      setTrainResult(result);
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setTraining(false);
    }
  }

  async function onRunForecasts() {
    if (!token) {
      setErr("Non connecté.");
      return;
    }
    if (!siteId) {
      setErr("Aucun site sélectionné.");
      return;
    }

    try {
      setForecasting(true);
      setErr("");
      setForecast7(null);
      setForecast30(null);

      const f7 = await forecast(token, siteId, 7);
      const f30 = await forecast(token, siteId, 30);

      setForecast7(f7);
      setForecast30(f30);
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setForecasting(false);
    }
  }

  async function onTrainAndForecast() {
    if (!token) {
      setErr("Non connecté.");
      return;
    }
    if (!siteId) {
      setErr("Aucun site sélectionné.");
      return;
    }

    try {
      setErr("");
      setTraining(true);
      setForecasting(true);
      setTrainResult(null);
      setForecast7(null);
      setForecast30(null);

      const result = await trainModel(token, siteId);
      setTrainResult(result);

      const f7 = await forecast(token, siteId, 7);
      const f30 = await forecast(token, siteId, 30);

      setForecast7(f7);
      setForecast30(f30);
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setTraining(false);
      setForecasting(false);
    }
  }

  const selectedSite = useMemo(() => {
    return sites.find((site) => site.id === siteId) || null;
  }, [sites, siteId]);

  const forecast7Meta = useMemo(() => getForecastMeta(forecast7), [forecast7]);
  const forecast30Meta = useMemo(() => getForecastMeta(forecast30), [forecast30]);

  const summary = useMemo(() => {
    const hasTrain = !!trainResult;
    const hasF7 = !!forecast7Meta?.forecast?.length;
    const hasF30 = !!forecast30Meta?.forecast?.length;
    const hasAnyForecast = hasF7 || hasF30;
    const hasError = !!err;

    let verdict = "Prêt à lancer";
    let verdictTone: "green" | "amber" | "red" | "blue" = "blue";

    if (hasError) {
      verdict = "Erreur à corriger";
      verdictTone = "red";
    } else if (training || forecasting) {
      verdict = "Traitement en cours";
      verdictTone = "blue";
    } else if (hasTrain && hasF7 && hasF30) {
      verdict = "Démo exploitable";
      verdictTone = "green";
    } else if (hasTrain || hasAnyForecast) {
      verdict = "Partiellement exploitable";
      verdictTone = "amber";
    }

    return {
      hasTrain,
      hasF7,
      hasF30,
      verdict,
      verdictTone,
      forecast7Total: sumForecast(forecast7),
      forecast30Total: sumForecast(forecast30),
      forecast7Avg: avgForecast(forecast7),
      forecast30Avg: avgForecast(forecast30),
    };
  }, [
    trainResult,
    forecast7Meta,
    forecast30Meta,
    err,
    training,
    forecasting,
    forecast7,
    forecast30,
  ]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Forecast IA</h1>
              <p className="mt-1 text-sm text-slate-600">
                Entraîne le modèle sur le site sélectionné puis génère les prévisions J+7
                et J+30.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusPill
                label={selectedSite ? `Site sélectionné: ${selectedSite.name}` : "Aucun site"}
                tone={selectedSite ? "green" : "amber"}
              />
              <StatusPill
                label={
                  training
                    ? "Training en cours"
                    : summary.hasTrain
                    ? "Dernier training OK"
                    : "Training non lancé"
                }
                tone={training ? "blue" : summary.hasTrain ? "green" : "amber"}
              />
              <StatusPill
                label={
                  forecasting
                    ? "Forecast en cours"
                    : summary.hasF7 || summary.hasF30
                    ? "Forecast disponible"
                    : "Forecast non lancé"
                }
                tone={forecasting ? "blue" : summary.hasF7 || summary.hasF30 ? "green" : "amber"}
              />
              <StatusPill label={summary.verdict} tone={summary.verdictTone} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-900">Site</label>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">Lecture immédiate</div>
              <div className="mt-2 text-sm text-slate-600">
                Cette page permet de démontrer en quelques clics la chaîne complète :
                sélection du site, entraînement du modèle, puis prévisions opérationnelles à
                7 et 30 jours.
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onTrain}
              disabled={training || forecasting || !siteId}
              className="rounded-xl border bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {training ? "Training..." : "Train model"}
            </button>

            <button
              type="button"
              onClick={onRunForecasts}
              disabled={training || forecasting || !siteId}
              className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {forecasting ? "Forecast..." : "Run forecast"}
            </button>

            <button
              type="button"
              onClick={onTrainAndForecast}
              disabled={training || forecasting || !siteId}
              className="rounded-xl border bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {training || forecasting ? "Processing..." : "Train + Forecast"}
            </button>
          </div>

          {err ? (
            <div className="mt-4 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              {err}
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            title="Sites chargés"
            value={String(sites.length)}
            subtitle={selectedSite ? `Site actif: ${selectedSite.name}` : "Aucun site actif"}
            tone={sites.length > 0 ? "good" : "warn"}
          />
          <MetricCard
            title="Training"
            value={summary.hasTrain ? "OK" : training ? "..." : "—"}
            subtitle={
              summary.hasTrain
                ? "Dernier entraînement disponible"
                : "Aucun résultat d’entraînement"
            }
            tone={summary.hasTrain ? "good" : training ? "info" : "warn"}
          />
          <MetricCard
            title="Forecast J+7"
            value={summary.hasF7 ? "OK" : forecasting ? "..." : "—"}
            subtitle={
              summary.hasF7
                ? `${forecast7Meta?.forecast?.length || 0} lignes générées`
                : "Aucune prévision J+7"
            }
            tone={summary.hasF7 ? "good" : forecasting ? "info" : "warn"}
          />
          <MetricCard
            title="Forecast J+30"
            value={summary.hasF30 ? "OK" : forecasting ? "..." : "—"}
            subtitle={
              summary.hasF30
                ? `${forecast30Meta?.forecast?.length || 0} lignes générées`
                : "Aucune prévision J+30"
            }
            tone={summary.hasF30 ? "good" : forecasting ? "info" : "warn"}
          />
          <MetricCard
            title="Total J+7"
            value={summary.hasF7 ? euro(summary.forecast7Total) : "—"}
            subtitle={
              summary.hasF7 ? `Moyenne/jour: ${euro(summary.forecast7Avg)}` : "Pas encore calculé"
            }
            tone={summary.hasF7 ? "info" : "default"}
          />
          <MetricCard
            title="Total J+30"
            value={summary.hasF30 ? euro(summary.forecast30Total) : "—"}
            subtitle={
              summary.hasF30
                ? `Moyenne/jour: ${euro(summary.forecast30Avg)}`
                : "Pas encore calculé"
            }
            tone={summary.hasF30 ? "info" : "default"}
          />
        </div>

        {trainResult ? (
          <SectionCard
            title="Dernier entraînement"
            subtitle="Lecture synthétique du dernier model run exécuté depuis cette page."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Modèle"
                value={trainResult.model_name}
                subtitle="Nom du moteur utilisé"
                tone="info"
              />
              <MetricCard
                title="Train rows"
                value={shortNumber(Number(trainResult.train_rows))}
                subtitle="Volume de lignes d’entraînement"
                tone="default"
              />
              <MetricCard
                title="MAE"
                value={shortNumber(Number(trainResult.mae))}
                subtitle="Erreur absolue moyenne"
                tone="default"
              />
              <MetricCard
                title="MAPE"
                value={`${(Number(trainResult.mape) * 100).toFixed(2)} %`}
                subtitle={
                  Number(trainResult.mape) <= 0.1
                    ? "Précision solide"
                    : Number(trainResult.mape) <= 0.2
                    ? "Précision acceptable"
                    : "Précision à surveiller"
                }
                tone={
                  Number(trainResult.mape) <= 0.1
                    ? "good"
                    : Number(trainResult.mape) <= 0.2
                    ? "warn"
                    : "bad"
                }
              />
            </div>

            <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
              <div>Model run ID</div>
              <div className="break-all font-mono text-xs">{trainResult.model_run_id}</div>
              <div>Site ID</div>
              <div className="break-all font-mono text-xs">{trainResult.site_id}</div>
            </div>
          </SectionCard>
        ) : null}

        {([
          {
            block: forecast7,
            title: "Forecast J+7",
            empty: "Aucun forecast J+7 généré pour le moment.",
          },
          {
            block: forecast30,
            title: "Forecast J+30",
            empty: "Aucun forecast J+30 généré pour le moment.",
          },
        ] as const).map(({ block, title, empty }, idx) => {
          const meta = getForecastMeta(block);
          const total = sumForecast(block);
          const avg = avgForecast(block);

          return (
            <SectionCard key={idx} title={title} subtitle="Prévisions détaillées et lecture de synthèse.">
              {!meta ? (
                <p className="text-sm text-slate-500">{empty}</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      title="Lignes"
                      value={String(meta.forecast?.length || 0)}
                      subtitle="Nombre de jours générés"
                      tone="good"
                    />
                    <MetricCard
                      title="Horizon"
                      value={meta.horizon_days ? `${meta.horizon_days} jours` : "—"}
                      subtitle="Fenêtre de projection"
                      tone="info"
                    />
                    <MetricCard
                      title="Total"
                      value={euro(total)}
                      subtitle="Somme forecastée"
                      tone="default"
                    />
                    <MetricCard
                      title="Moyenne/jour"
                      value={euro(avg)}
                      subtitle="Projection journalière moyenne"
                      tone="default"
                    />
                  </div>

                  <div className="mt-4">
                    <ForecastChart title={`${title} — évolution prévisionnelle`} points={meta.forecast} />
                  </div>

                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                    {meta.model_run_id ? (
                      <>
                        <div>Model run ID</div>
                        <div className="break-all font-mono text-xs">{meta.model_run_id}</div>
                      </>
                    ) : null}

                    {meta.site_id ? (
                      <>
                        <div>Site ID</div>
                        <div className="break-all font-mono text-xs">{meta.site_id}</div>
                      </>
                    ) : null}

                    {meta.horizon_days ? (
                      <>
                        <div>Horizon exact</div>
                        <div>{meta.horizon_days} jours</div>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="py-2">Date</th>
                          <th className="py-2">Forecast (€)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meta.forecast.map((p) => (
                          <tr key={p.day} className="border-t">
                            <td className="py-2">{p.day}</td>
                            <td className="py-2">
                              {Number(p.predicted_revenue_eur).toLocaleString("fr-FR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              €
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {meta.insights && Array.isArray(meta.insights) && meta.insights.length > 0 ? (
                    <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Insights opérationnels
                        </div>
                        <div className="text-xs text-slate-500">
                          {meta.insights.length} insight{meta.insights.length > 1 ? "s" : ""}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3">
                        {meta.insights.map((insight: string, i: number) => {
                          const classification = classifyInsight(insight);

                          return (
                            <div
                              key={i}
                              className={`rounded-xl border px-4 py-3 ${classification.toneClass}`}
                            >
                              <div className="mb-2">
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                  {classification.badgeLabel}
                                </span>
                              </div>
                              <div className="text-sm leading-6 text-slate-800">{insight}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Aucun insight IA retourné pour ce forecast.
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          );
        })}
      </div>
    </AppShell>
  );
}