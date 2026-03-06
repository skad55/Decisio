"use client";

import { useEffect, useState } from "react";
import { forecast, ForecastPayload, getSites, Site, trainModel, TrainResponse } from "../../components/api";
import { useSession } from "../../components/useSession";

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export default function ForecastPage() {
  const { token, ready } = useSession();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [training, setTraining] = useState<TrainResponse | null>(null);
  const [forecast7, setForecast7] = useState<ForecastPayload | null>(null);
  const [forecast30, setForecast30] = useState<ForecastPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSites() {
      if (!token) return;
      try {
        const rows = await getSites(token);
        setSites(rows);
        if (!siteId && rows.length > 0) {
          setSiteId(rows[0].id);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erreur inattendue");
      }
    }

    if (ready) {
      loadSites();
    }
  }, [ready, token, siteId]);

  async function onTrainAndForecast() {
    if (!token || !siteId) {
      setError("Sélectionnez un site et connectez-vous.");
      return;
    }
    setBusy(true);
    setError("");
    setTraining(null);
    setForecast7(null);
    setForecast30(null);

    try {
          const trainRes = await trainModel(token, siteId);
      setTraining(trainRes);

      const f7 = await forecast(token, siteId, 7);
      setForecast7(f7);

      const f30 = await forecast(token, siteId, 30);
      setForecast30(f30);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Forecast IA</h1>
        <p className="mt-1 text-sm text-slate-600">
          Entraînement local (régression linéaire) avec variables : météo, trafic, staffing, événements, calendrier, lags, caractéristiques site.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            onClick={onTrainAndForecast}
            disabled={busy || !siteId || !token}
            type="button"
          >
            {busy ? "Calcul en cours..." : "Entraîner + Prévoir J+7/J+30"}
          </button>
        </div>

        {error ? <div className="mt-3 rounded-xl border bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
      </section>

      {training ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm text-sm">
          <div className="font-semibold">Dernier entraînement</div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>Model: <span className="font-mono">{training.model_name}</span></div>
            <div>Lignes train: {training.train_rows}</div>
            <div>MAE: {euro(training.mae)} | MAPE: {(training.mape * 100).toFixed(2)}%</div>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {([forecast7, forecast30] as const).map((block, idx) => (
          <section key={idx} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold">Prévision {block ? `J+${block.horizon_days}` : "—"}</div>
            <div className="mt-1 text-sm text-slate-600">Total prédit: {block ? euro(block.sum_predicted_eur) : "—"}</div>
            {block ? (
              <div className="mt-2 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">Date</th><th className="py-2">CA prédit</th></tr>
                  </thead>
                  <tbody>
                    {block.forecast.map((p) => (
                      <tr key={p.day} className="border-t"><td className="py-2">{p.day}</td><td className="py-2">{euro(p.predicted_revenue_eur)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}