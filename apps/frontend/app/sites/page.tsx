"use client";
import { useEffect, useState } from "react";

export default function Sites() {
  const [sites, setSites] = useState<any[]>([]);
  const [name, setName] = useState("Nouveau site");
  const [address, setAddress] = useState("Adresse");
  const [err, setErr] = useState("");

  const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

  async function load() {
    const token = localStorage.getItem("access") || "";
    const r = await fetch(base + "/api/sites", { headers: { Authorization: "Bearer " + token }});
    if (!r.ok) throw new Error(await r.text());
    setSites(await r.json());
  }

  async function create() {
    const token = localStorage.getItem("access") || "";
    const r = await fetch(base + "/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ name, address }),
    });
    if (!r.ok) { setErr(await r.text()); return; }
    await load();
  }

  useEffect(()=>{ load().catch(e=>setErr(String(e))); }, []);

  return (
    <div>
      <h1>Sites</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={name} onChange={(e)=>setName(e.target.value)} />
        <input value={address} onChange={(e)=>setAddress(e.target.value)} />
        <button onClick={create}>Créer</button>
      </div>
      {err && <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</pre>}
      <ul>
        {sites.map(s => <li key={s.id}><b>{s.name}</b> — {s.address}</li>)}
      </ul>
    </div>
  );
}
