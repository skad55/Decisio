"use client";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("Admin123!");
  const [err, setErr] = useState("");

  async function submit(e: any) {
    e.preventDefault();
    setErr("");
    const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) { setErr(await r.text()); return; }
    const j = await r.json();
    localStorage.setItem("access", j.access_token);
    window.location.href = "/sites";
  }

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="email" />
        <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="password" />
        <button type="submit">Se connecter</button>
        {err && <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</pre>}
      </form>
    </div>
  );
}
