"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiImportCa, apiImports, type ImportBatch, type ImportCaResponse } from "../../components/api";
import { useSession } from "../../components/useSession";

export default function ImportsPage() {
  const [result, setResult] = useState<ImportCaResponse | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e?.target?.files?.[0];
    if (!file) return;

    setBusy(true);
    setErr("");
    setResult(null);

    try {
      if (!token) throw new Error("Non connecté. Va sur /login.");
      setResult(await apiImportCa(token, file, base));
      await loadImports();
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <AppShell title="Imports">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Imports CA (CSV)</h1>
          <p className="mt-2 text-sm text-slate-700">
            Format attendu : colonnes <span className="font-mono">date,site,ca</span> (date = YYYY-MM-DD).
            Le champ <span className="font-mono">site</span> doit correspondre au nom exact du site créé.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onPickFile}
                disabled={busy}
              />
              {busy ? "Import en cours..." : "Choisir un fichier CSV"}
            </label>

            <a className="text-sm underline text-slate-700" href="/sites">
              Créer / vérifier les sites
            </a>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border bg-rose-50 p-3 text-sm text-rose-900 whitespace-pre-wrap">
              {err}
            </div>
          ) : null}

          {result ? (
            <div className="mt-4 rounded-xl border bg-slate-50 p-3">
              <div className="text-sm font-semibold">Résultat import</div>
              <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre>
            </div>
          ) : null}
        </div>

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