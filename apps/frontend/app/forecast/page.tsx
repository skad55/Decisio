"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  forecast,
  ForecastPayload,
  getSites,
  Site,
  trainModel,
  TrainResponse,
} from "../../components/api";
import { useSession } from "../../components/useSession";

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
    await onTrain();
    await onRunForecasts();
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Forecast IA</h1>
          <p className="mt-2 text-sm text-slate-600">
            Entraîne le modèle sur les données du site sélectionné puis génère les
            prévisions J+7 et J+30.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Site</label>
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
            <div className="mt-4 rounded-xl border bg-rose-50 p-3 text-sm text-rose-900 whitespace-pre-wrap">
              {err}
            </div>
          ) : null}

          {trainResult ? (
            <div className="mt-4 rounded-xl border bg-slate-50 p-4">
              <div className="text-sm font-semibold">Train result</div>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <div>Model run ID</div>
                <div className="font-mono text-xs break-all">{trainResult.model_run_id}</div>
                <div>Site ID</div>
                <div className="font-mono text-xs break-all">{trainResult.site_id}</div>
                <div>Model</div>
                <div>{trainResult.model_name}</div>
                <div>Train rows</div>
                <div>{trainResult.train_rows}</div>
                <div>MAE</div>
                <div>{trainResult.mae}</div>
                <div>MAPE</div>
                <div>{trainResult.mape}</div>
              </div>
            </div>
          ) : null}
        </div>

        {([forecast7, forecast30] as const).map((block, idx) => (
          <div key={idx} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">
              {idx === 0 ? "Forecast J+7" : "Forecast J+30"}
            </h2>

            {!block ? (
              <p className="mt-3 text-sm text-slate-500">
                Aucun forecast généré pour le moment.
              </p>
            ) : (
              <>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  {"model_run_id" in block ? (
                    <>
                      <div>Model run ID</div>
                      <div className="font-mono text-xs break-all">
                        {(block as any).model_run_id}
                      </div>
                    </>
                  ) : null}

                  {"site_id" in block ? (
                    <>
                      <div>Site ID</div>
                      <div className="font-mono text-xs break-all">
                        {(block as any).site_id}
                      </div>
                    </>
                  ) : null}

                  {"horizon_days" in block ? (
                    <>
                      <div>Horizon</div>
                      <div>{(block as any).horizon_days} jours</div>
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
                      {block.forecast.map((p) => (
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

                {(block as any).insights && Array.isArray((block as any).insights) ? (
                  <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                    <div className="text-sm font-semibold">AI Insights</div>
                    <div className="mt-3 space-y-2">
                      {(block as any).insights.map((insight: string, i: number) => (
                        <div
                          key={i}
                          className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          {insight}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}