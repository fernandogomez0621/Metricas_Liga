// Estado de la aplicación y persistencia.
// - Con servidor (Docker): el estado se guarda en el servidor y lo comparte todo el equipo.
// - Sin servidor (por ejemplo, abierto como artefacto): se guarda en este navegador (localStorage).
import { now, toast } from "./util.js";
import * as api from "./api.js";

const STORE_KEY = "metrica-liga.v1";
let MASTERS = null, DEMO = null;
let mode = "local", version = 0, conflict = false;
/** "server" si los datos se comparten en el servidor; "local" si solo están en este navegador. */
export const storeMode = () => mode;

/** Estado único y mutable. Se modifica en el sitio para que los imports sigan apuntando a él. */
export const S = {};

const blank = () => ({
  records: [],        // presencias: vallas (Segundos), Momentum, Estático
  audiencias: [],     // filas de Kantar por partido / canal / público
  goles: [],
  insitu: {},         // "jornada|partido" -> {led, est}
  validadas: { NACIONAL: [], INTERNACIONAL: [] },
  logA: [], logC: [],
  config: { emitido: "TV" },   // columna con la que se valora: Emitido TV u Emitido TM
  masters: JSON.parse(JSON.stringify(MASTERS)),
  seq: 1,
});

function replace(obj) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, blank(), obj); sortRecords(); }

export async function initStore() {
  const [m, d] = await Promise.all([
    fetch("data/masters.json").then(r => r.json()),
    fetch("data/demo.json").then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  MASTERS = m; DEMO = d;
  if (await api.available()) {
    try {
      const r = await api.getState();
      if (r.ok) {
        mode = "server"; version = r.body.version || 0;
        if (r.body.state && r.body.state.records) { replace(r.body.state); return "server"; }
        replace(DEMO ? JSON.parse(JSON.stringify(DEMO)) : {});   // primer arranque: se siembra con el ejemplo
        await saveNow();
        return "server-demo";
      }
    } catch (e) { /* si falla el servidor, se sigue en modo navegador */ }
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const o = JSON.parse(raw); if (o && o.records) { replace(o); return "saved"; } }
  } catch (e) { /* almacenamiento no disponible */ }
  replace(DEMO ? JSON.parse(JSON.stringify(DEMO)) : {});
  return DEMO ? "demo" : "empty";
}

async function saveNow() {
  if (mode !== "server") {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) { toast("El navegador no tiene espacio para guardar tantos datos: usa la app instalada en el servidor"); }
    return;
  }
  if (conflict) return;
  try {
    const r = await api.putState(S, version);
    if (r.ok) version = r.body.version;
    else if (r.status === 409) { conflict = true; toast("Otra persona guardó cambios. Recarga la página para trabajar sobre la versión actual."); }
    else toast("No se pudo guardar en el servidor (" + (r.body.detail || r.status) + ")");
  } catch (e) { toast("No se pudo guardar en el servidor: " + e.message); }
}

let timer = null;
export function persist() {
  clearTimeout(timer);
  timer = setTimeout(saveNow, mode === "server" ? 800 : 300);
}

const TIPO_ORDEN = { Segundos: 0, Momentum: 1, "Estático": 2 };
/** Orden por defecto: jornada, partido, feed nacional primero, tipo y anunciante. */
export function sortRecords() {
  S.records.sort((a, b) => (a.jornada - b.jornada) || String(a.partido).localeCompare(String(b.partido)) ||
    ((a.feed === "NACIONAL" ? 0 : 1) - (b.feed === "NACIONAL" ? 0 : 1)) || String(a.feed).localeCompare(String(b.feed)) ||
    ((TIPO_ORDEN[a.tipoEntrada] ?? 9) - (TIPO_ORDEN[b.tipoEntrada] ?? 9)) || String(a.anunciante).localeCompare(String(b.anunciante), "es"));
}

export const resetDemo = () => { replace(DEMO ? JSON.parse(JSON.stringify(DEMO)) : {}); persist(); };
export const resetEmpty = () => { replace({}); persist(); };
export const nextId = () => S.seq++;

export function logChange(ope, descripcion) {
  const t = now();
  S.logC.unshift({ club: "Equipo interno", dia: t.dia, hora: t.hora, usuario: "Usuario del prototipo", email: "—", ope, descripcion });
}
export function logAccess(anunciante) {
  const t = now();
  S.logA.unshift({ anunciante, dia: t.dia, hora: t.hora, usuario: "Usuario del prototipo", email: "—", ip: "—" });
}
