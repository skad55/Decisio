"use client";

import { useEffect, useMemo, useState } from "react";
import RevenueChart from "../../components/RevenueChart";
import { useSession } from "../../components/useSession";

type Site = {
  id: string;
  name: string;
  address: string;
};

type DashboardPayload = {
  historical: Array<{ day: string; revenue: number }>;
  forecast: Array<{ day: string; prediction: number }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function DashboardPage() {
  const { token, ready, isAuthenticated } = useSession();

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [debug, setDebug] = useState<string>("");

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

    loadDashboard();
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
      })),
    [data]
  );

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
        <RevenueChart historical={historical} forecast={forecast} />
      )}
    </main>
  );
}