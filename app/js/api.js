// Cliente del servidor (carpeta api/). Si la app se abre sin servidor (por ejemplo, como
// artefacto de Claude), available() devuelve false y la app sigue funcionando en el navegador.
let _available = null;

async function call(path, opts = {}, timeout = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch("api/" + path, { ...opts, signal: ctl.signal, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

export async function available() {
  if (_available !== null) return _available;
  try { const r = await call("health", {}, 2500); _available = r.ok && r.body.ok === true; }
  catch (e) { _available = false; }
  return _available;
}

export const testDb = () => call("db/test", {}, 30000);
export const audienciasEspana = (desde, hasta) => call("audiencias/espana", { method: "POST", body: JSON.stringify({ desde, hasta }) }, 120000);
export const getState = () => call("state", {}, 30000);
export const putState = (state, version) => call("state", { method: "PUT", body: JSON.stringify({ version, state }) }, 60000);
