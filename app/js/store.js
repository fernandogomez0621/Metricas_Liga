// Estado de la aplicación y persistencia.
// En el prototipo todo se guarda en el navegador (localStorage). En la versión real
// este módulo es el único que habría que cambiar para hablar con el servidor.
import { now } from "./util.js";

const STORE_KEY = "metrica-liga.v1";
let MASTERS = null, DEMO = null;

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
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const o = JSON.parse(raw); if (o && o.records) { replace(o); return "saved"; } }
  } catch (e) { /* almacenamiento no disponible */ }
  replace(DEMO ? JSON.parse(JSON.stringify(DEMO)) : {});
  return DEMO ? "demo" : "empty";
}

let timer = null;
export function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { } }, 300);
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
