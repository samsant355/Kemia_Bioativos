const URL_BASE = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

function headers(extra = {}) {
  return {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function fetchAll(table) {
  if (!URL_BASE || !API_KEY) return [];
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function upsert(table, rows) {
  if (!rows || !rows.length || !URL_BASE || !API_KEY) return;
  await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
}

export async function removeRow(table, id) {
  if (!URL_BASE || !API_KEY) return;
  await fetch(`${URL_BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
}

export const supabaseConfigured = Boolean(URL_BASE && API_KEY);
