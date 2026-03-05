(async () => {
  const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
  const r = await fetch(base + "/health");
  if (!r.ok) throw new Error("health failed");
  const j = await r.json();
  if (!j.ok) throw new Error("health not ok");
  console.log("SMOKE OK");
})();
