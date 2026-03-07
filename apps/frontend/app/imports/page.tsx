"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiImports, type ImportBatch } from "../../components/api";
import { useSession } from "../../components/useSession";

type ImportResponse = {
  batch_id: string;
  filename: string;
  type: string;
  status: string;
  rows_total: number;
  rows_ok: number;
  rows_duplicated: number;
  rows_failed: number;
  errors_preview?: Array<{ row: number; error: string }>;
};

type UploadSectionProps = {
  title: string;
  endpoint: string;
  token: string;
  base: string;
  busyGlobal: boolean;
  onUploaded: () => Promise<void>;
};

function ResultCard({ result }: { result: ImportResponse | null }) {
  if (!result) return null;

  return (
    <div className="mt-4 rounded-xl border bg-slate-50 p-3">
      <div className="text-sm font-semibold">Résultat import</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>Status</div>
        <div className="font-medium">{result.status}</div>
        <div>Total</div>
        <div>{result.rows_total}</div>
        <div>OK</div>
        <div>{result.rows_ok}</div>
        <div>Fail</div>
        <div>{result.rows_failed}</div>
        <div>Duplicated</div>
        <div>{result.rows_duplicated}</div>
      </div>

      {result.errors_preview && result.errors_preview.length > 0 ? (
        <pre className="mt-3 overflow-auto rounded-lg border bg-white p-3 text-xs">
{JSON.stringify(result.errors_preview, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function UploadSection({
  title,
  endpoint,
  token,
  base,
  busyGlobal,
  onUploaded,
}: UploadSectionProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e?.target?.files?.[0];
    if (!file) return;

    setBusy(true);
    setErr("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }

      const json = JSON.parse(text) as ImportResponse;
      setResult(json);
      await onUploaded();
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="mt-4 flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onPickFile}
            disabled={busy || busyGlobal}
          />
          {busy ? "Import en cours..." : "Choisir un fichier CSV"}
        </label>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border bg-rose-50 p-3 text-sm text-rose-900 whitespace-pre-wrap">
          {err}
        </div>
      ) : null}

      <ResultCard result={result} />
    </div>
  );
}

export default function ImportsPage() {
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState<ImportBatch[]>([]);

  const { token, ready } = useSession();
  const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

  async function loadImports() {
    if (!token) return;
    try {
      setErr("");
      setImports(await apiImports(token, base));
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      window.location.href = "/login";
      return;
    }
    loadImports();
  }, [ready, token]);

  return (
    <AppShell title="Imports">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Imports CSV</h1>
          <p className="mt-2 text-sm text-slate-700">
            Importe séparément les données CA, météo, trafic, staffing et événements.
            Le champ <span className="font-mono">site</span> doit correspondre exactement au nom du site créé.
          </p>

          <div className="mt-3">
            <a className="text-sm underline text-slate-700" href="/sites">
              Créer / vérifier les sites
            </a>
          </div>
        </div>

        <UploadSection
          title="Imports CA (CSV)"
          endpoint="/api/import/ca"
          token={token}
          base={base}
          busyGlobal={busy}
          onUploaded={loadImports}
        />

        <UploadSection
          title="Imports Weather (CSV)"
          endpoint="/api/import/weather"
          token={token}
          base={base}
          busyGlobal={busy}
          onUploaded={loadImports}
        />

        <UploadSection
          title="Imports Traffic (CSV)"
          endpoint="/api/import/traffic"
          token={token}
          base={base}
          busyGlobal={busy}
          onUploaded={loadImports}
        />

        <UploadSection
          title="Imports Staffing (CSV)"
          endpoint="/api/import/staffing"
          token={token}
          base={base}
          busyGlobal={busy}
          onUploaded={loadImports}
        />

        <UploadSection
          title="Imports Events (CSV)"
          endpoint="/api/import/events"
          token={token}
          base={base}
          busyGlobal={busy}
          onUploaded={loadImports}
        />

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Historique imports</div>
            <button
              className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              onClick={loadImports}
              disabled={busy}
            >
              Rafraîchir
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border bg-rose-50 p-3 text-sm text-rose-900 whitespace-pre-wrap">
              {err}
            </div>
          ) : null}

          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Fichier</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">OK</th>
                  <th className="py-2">Dup</th>
                  <th className="py-2">Fail</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-2 font-mono text-xs">{b.filename}</td>
                    <td className="py-2">{b.status}</td>
                    <td className="py-2">{b.rows_total}</td>
                    <td className="py-2">{b.rows_ok}</td>
                    <td className="py-2">{b.rows_duplicated}</td>
                    <td className="py-2">{b.rows_failed}</td>
                  </tr>
                ))}
                {imports.length === 0 ? (
                  <tr className="border-t">
                    <td className="py-3 text-slate-500" colSpan={6}>
                      Aucun import pour l’instant.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}