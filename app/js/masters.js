// Búsquedas en las tablas maestras (Canales, Soportes, Partidos) y alias de nombres.
import { S } from "./store.js";
import { norm, clean } from "./util.js";

const FEED_ALIAS = { EUROPE: "EUROPA", ASIA: "PRC+SEA", PRCSEA: "PRC+SEA" };
const SOPORTE_ALIAS = { [norm("2UTV VIRTUAL")]: "2UTV virtual", [norm("PANTALON TRASERO")]: "Pantalón trasero" };
// Errores de escritura habituales en los postplays → nombre oficial del anunciante.
// En la versión real esto sale de la tabla de anunciantes (Contratos Clientes).
const ANUNCIANTE_ALIAS = { [norm("BWSCORE")]: "BWSCORES", [norm("SILKEN HOTEKES")]: "SILKEN HOTELES" };

export const feedName = f => { const c = clean(f); if (!c) return null; return FEED_ALIAS[norm(c)] || c.toUpperCase(); };
export const feedGroup = f => f === "NACIONAL" ? "NACIONAL" : "INTERNACIONAL";
export const anunciante = n => ANUNCIANTE_ALIAS[norm(n)] || n;

export function soporteOf(name) {
  const k = norm(SOPORTE_ALIAS[norm(name)] || name);
  return S.masters.soportes.find(s => norm(s.soporte) === k) || S.masters.soportes.find(s => norm(s.abrev) === k) || null;
}
export const canalOf = name => S.masters.canales.find(c => norm(c.canal) === norm(name)) || null;

/** Asigna un Excel a un partido del calendario cruzando local y visitante (tolerante a nombres distintos). */
export function findPartido(local, visit, jornada) {
  const team = t => norm(t).replace(/CLUB/g, "").replace(/RC/g, "");
  const L = team(local), V = team(visit);
  if (!L || !V) return null;
  const like = (a, b) => a && b && (a === b || a.includes(b) || b.includes(a));
  return S.masters.partidos.find(p => (!jornada || p.jornada === jornada) && like(team(p.local), L) && like(team(p.visitante), V)) || null;
}
