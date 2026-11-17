// Se alguém colar a URL com "/rest/v1/" no final, limpamos aqui.
const URL_BASE = (import.meta.env.VITE_SUPABASE_URL || "")
  .trim()
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/$/, "");
const API_KEY = (import.meta.env.VITE_SUPABASE_KEY || "").trim();

function headers(extra = {}) {
  return {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readDetail(res) {
  const t = await res.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    return j.message || j.details || j.hint || t;
  } catch {
    return t;
  }
}

// Transforma a recusa do banco numa mensagem que dá pra entender.
async function ensureOk(res, what) {
  if (res.ok) return;
  const detail = await readDetail(res);
  let motivo = detail || `erro ${res.status}`;
  if (
    /row-level security/i.test(detail) ||
    res.status === 401 ||
    res.status === 403
  ) {
    motivo = `o banco recusou (trava de segurança RLS ligada nessa tabela). ${detail}`;
  } else if (/foreign key/i.test(detail)) {
    motivo = `esse registro está ligado a outro. ${detail}`;
  } else if (
    /does not exist|could not find|schema cache|PGRST20/i.test(detail) ||
    res.status === 404
  ) {
    motivo = `falta uma tabela ou coluna no banco — rode o SQL de atualização no Supabase. ${detail}`;
  }
  throw new Error(`Não consegui salvar em "${what}": ${motivo}`);
}

export async function fetchAll(table) {
  if (!URL_BASE || !API_KEY) return [];
  let res;
  try {
    res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: headers(),
    });
  } catch {
    throw new Error(
      "Sem conexão com o banco de dados. Confira a internet e tente de novo."
    );
  }
  if (!res.ok) {
    const detail = await readDetail(res);
    const falta =
      /does not exist|could not find|schema cache|PGRST20/i.test(detail) ||
      res.status === 404;
    throw new Error(
      falta
        ? `A tabela "${table}" não existe no banco. Rode o SQL de atualização no Supabase e tente de novo.`
        : `Não consegui ler "${table}" (${res.status}). ${detail}`
    );
  }
  return res.json();
}

export async function upsert(table, rows) {
  if (!rows || !rows.length || !URL_BASE || !API_KEY) return;
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  await ensureOk(res, table);
}

export async function removeRow(table, id) {
  if (!URL_BASE || !API_KEY) return;
  const res = await fetch(
    `${URL_BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(),
    }
  );
  await ensureOk(res, table);
}

// Apaga as linhas "filhas" de um registro que não estão mais na lista (ex.: linha removida da fórmula).
export async function pruneChildren(table, parentCol, parentId, keepIds) {
  if (!URL_BASE || !API_KEY) return;
  let q = `${parentCol}=eq.${encodeURIComponent(parentId)}`;
  if (keepIds.length)
    q += `&id=not.in.(${keepIds.map((k) => encodeURIComponent(k)).join(",")})`;
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${q}`, {
    method: "DELETE",
    headers: headers(),
  });
  await ensureOk(res, table);
}

export const supabaseConfigured = Boolean(URL_BASE && API_KEY);
