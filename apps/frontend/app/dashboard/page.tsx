"use client";

import { useEffect, useMemo, useState } from "react";
import RevenueChart from "../../components/RevenueChart";
import { useSession } from "../../components/useSession";

type Site = {
  id: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Driver = {
  name: string;
  impact: number;
};

type DashboardPayload = {
  historical: Array<{ day: string; revenue: number }>;
  forecast: Array<{ day: string; prediction: number; lower?: number; upper?: number }>;
  confidence?: "high" | "medium" | "low";
  drivers?: Driver[];
  insights?: string[];
};

type StaffingRecommendation = {
  current_staff: number;
  recommended_staff: number;
  staff_gap: number;
  message: string;
};

type SimulationResult = {
  base_forecast: number;
  simulated_revenue: number;
  delta_value: number;
  delta_pct: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function DashboardPage() {
  const { token, ready, isAuthenticated } = useSession();

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>("");

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [staffing, setStaffing] = useState<StaffingRecommendation | null>(null);

  const [error, setError] = useState<string>("");
  const [debug, setDebug] = useState<string>("");

  const [weatherMessage, setWeatherMessage] = useState<string>("");
  const [weatherBusy, setWeatherBusy] = useState(false);

  const [simTrafficDeltaPct, setSimTrafficDeltaPct] = useState<number>(0);
  const [simStaffDelta, setSimStaffDelta] = useState<number>(0);
  const [simEventIntensityDelta, setSimEventIntensityDelta] = useState<number>(0);
  const [simRainDeltaMm, setSimRainDeltaMm] = useState<number>(0);
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string>("");

  useEffect(() => {
    if (!ready) return;

    if (!token) {
      setError("Aucun token trouvé. Connecte-toi d’abord dans l’application.");
      setDebug(`API_BASE=${API_BASE} | token=missing | ready=${ready}`);
      return;
    }

    async function loadSites() {
      try {
        setError("");
        setDebug(`GET ${API_BASE}/api/sites`);

        const response = await fetch(`${API_BASE}/api/sites`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const text = await response.text();

        if (!response.ok) {
          throw new Error(`GET /api/sites -> ${response.status} ${text}`);
        }

        const json = JSON.parse(text) as Site[];
        setSites(json);

        if (json.length > 0) {
          setSiteId(json[0].id);
        } else {
          setError("Aucun site trouvé.");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setError(`Erreur chargement des sites : ${msg}`);
        setDebug(`API_BASE=${API_BASE} | token=present`);
      }
    }

    loadSites();
  }, [ready, token]);

  useEffect(() => {
    if (!ready || !token || !siteId) return;

    async function loadDashboard() {
      try {
        setError("");
        setDebug(`GET ${API_BASE}/api/sites/${siteId}/dashboard`);

        const response = await fetch(`${API_BASE}/api/sites/${siteId}/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const text = await response.text();

        if (!response.ok) {
          throw new Error(`GET /api/sites/${siteId}/dashboard -> ${response.status} ${text}`);
        }

        const json = JSON.parse(text) as DashboardPayload;
        setData(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setError(`Erreur chargement dashboard : ${msg}`);
        setDebug(`API_BASE=${API_BASE} | siteId=${siteId} | token=present`);
      }
    }

    async function loadStaffingRecommendation() {
      try {
        const response = await fetch(
          `${API_BASE}/api/sites/${siteId}/staffing-recommendation`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const text = await response.text();

        if (!response.ok) {
          setStaffing(null);
          return;
        }

        const json = JSON.parse(text) as StaffingRecommendation;
        setStaffing(json);
      } catch {
        setStaffing(null);
      }
    }

    loadDashboard();
    loadStaffingRecommendation();
  }, [ready, token, siteId]);

  const historical = useMemo(
    () =>
      (data?.historical || []).map((p) => ({
        day: p.day,
        value: Number(p.revenue),
      })),
    [data]
  );

  const forecast = useMemo(
    () =>
      (data?.forecast || []).map((p) => ({
        day: p.day,
        value: Number(p.prediction),
        lower: p.lower !== undefined ? Number(p.lower) : undefined,
        upper: p.upper !== undefined ? Number(p.upper) : undefined,
      })),
    [data]
  );

  async function onFetchWeatherData() {
    if (!token || !siteId) return;

    try {
      setWeatherBusy(true);
      setWeatherMessage("");

      const response = await fetch(`${API_BASE}/api/sites/${siteId}/ingest/weather`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }

      const json = JSON.parse(text);
      setWeatherMessage(`Weather data updated (${json.rows_inserted} rows inserted)`);

      const dashboardResponse = await fetch(`${API_BASE}/api/sites/${siteId}/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (dashboardResponse.ok) {
        const dashboardJson = await dashboardResponse.json();
        setData(dashboardJson);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setWeatherMessage(`Erreur météo : ${msg}`);
    } finally {
      setWeatherBusy(false);
    }
  }

  async function onRunSimulation() {
    if (!token || !siteId) return;

    try {
      setSimBusy(true);
      setSimError("");
      setSimResult(null);

      const response = await fetch(`${API_BASE}/api/sites/${siteId}/simulate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traffic_delta_pct: Number(simTrafficDeltaPct),
          staff_delta: Number(simStaffDelta),
          event_intensity_delta: Number(simEventIntensityDelta),
          rain_delta_mm: Number(simRainDeltaMm),
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }

      const json = JSON.parse(text) as SimulationResult;
      setSimResult(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setSimError(msg);
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Revenue Dashboard</h1>
        <p className="text-sm text-gray-500">Historical revenue vs forecast</p>
      </div>

      {!ready && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm">
          Initialisation session...
        </div>
      )}

      {ready && !isAuthenticated && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
          Aucun token détecté. Connecte-toi d’abord dans l’application.
        </div>
      )}

      {sites.length > 0 && (
        <div className="max-w-sm">
          <label className="mb-2 block text-sm font-medium">Site</label>
          <select
            className="w-full rounded-lg border border-gray-300 p-2"
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
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {debug && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-xs text-gray-700 whitespace-pre-wrap">
          {debug}
        </div>
      )}

      {!error && data && (
        <>
          <div className="flex items-center gap-3">
            <span className="rounded-full border px-3 py-1 text-sm">
              Confidence: {(data.confidence || "low").toUpperCase()}
            </span>

            <button
              type="button"
              onClick={onFetchWeatherData}
              disabled={weatherBusy || !siteId}
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {weatherBusy ? "Fetching..." : "Fetch Weather Data"}
            </button>
          </div>

          {weatherMessage && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              {weatherMessage}
            </div>
          )}

          <RevenueChart historical={historical} forecast={forecast} />

          {data.insights && data.insights.length > 0 && (
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">AI Insights</h2>
              <div className="mt-3 space-y-2">
                {data.insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.drivers && data.drivers.length > 0 && (
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Revenue Drivers</h2>
              <div className="mt-3 space-y-2">
                {data.drivers.map((driver, idx) => {
                  const positive = Number(driver.impact) >= 0;
                  return (
                    <div
                      key={`${driver.name}-${idx}`}
                      className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="capitalize">{driver.name}</span>
                      <span className={positive ? "text-green-700" : "text-red-700"}>
                        {(Number(driver.impact) * 100).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {staffing && (
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Staffing Recommendation</h2>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <div>Current staff</div>
                <div>{staffing.current_staff}</div>

                <div>Recommended staff</div>
                <div>{staffing.recommended_staff}</div>

                <div>Staff gap</div>
                <div
                  className={
                    staffing.staff_gap > 0
                      ? "text-amber-700 font-medium"
                      : "text-green-700 font-medium"
                  }
                >
                  {staffing.staff_gap > 0 ? `+${staffing.staff_gap}` : staffing.staff_gap}
                </div>

                <div>Message</div>
                <div
                  className={
                    staffing.staff_gap > 0
                      ? "text-amber-700"
                      : "text-green-700"
                  }
                >
                  {staffing.message}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Scenario Simulator</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Traffic delta %</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-300 p-2"
                  value={simTrafficDeltaPct}
                  onChange={(e) => setSimTrafficDeltaPct(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Staff delta</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-300 p-2"
                  value={simStaffDelta}
                  onChange={(e) => setSimStaffDelta(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Event intensity delta</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full rounded-lg border border-gray-300 p-2"
                  value={simEventIntensityDelta}
                  onChange={(e) => setSimEventIntensityDelta(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Rain delta mm</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full rounded-lg border border-gray-300 p-2"
                  value={simRainDeltaMm}
                  onChange={(e) => setSimRainDeltaMm(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={onRunSimulation}
                disabled={simBusy || !siteId}
                className="rounded-lg border bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {simBusy ? "Running..." : "Run Simulation"}
              </button>
            </div>

            {simError && (
              <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
                {simError}
              </div>
            )}

            {simResult && (
              <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div>Base forecast</div>
                  <div>
                    {Number(simResult.base_forecast).toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} €
                  </div>

                  <div>Simulated revenue</div>
                  <div>
                    {Number(simResult.simulated_revenue).toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} €
                  </div>

                  <div>Delta €</div>
                  <div className={simResult.delta_value >= 0 ? "text-green-700" : "text-red-700"}>
                    {Number(simResult.delta_value).toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} €
                  </div>

                  <div>Delta %</div>
                  <div className={simResult.delta_pct >= 0 ? "text-green-700" : "text-red-700"}>
                    {Number(simResult.delta_pct).toFixed(2)} %
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}