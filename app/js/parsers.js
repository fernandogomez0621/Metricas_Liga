// Lectura de los tres tipos de Excel. Cada lector devuelve datos limpios y una lista de avisos;
// no toca el estado (eso lo hace upload.js).
import { S } from "./store.js";
import { norm, clean, isNum, uniq } from "./util.js";
import { feedName, anunciante, soporteOf, canalOf, findPartido } from "./masters.js";

const XLSX = () => window.XLSX;
const rowsOf = wb => XLSX().utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
const colIdx = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX().read(buf, { type: "array", cellFormula: true, cellDates: false });
}

/**
 * Postplay (Newevents): una fila por anunciante con Hired TV Time (contratado),
 * Broad TM Time (Emitido TM) y Output Seconds LIVE (Emitido TV), más tablas GOALS y MOMENTUMS.
 * Las columnas se localizan por su título porque no siempre están en la misma posición.
 */
export function parsePostplay(name, wb) {
  const out = { records: [], goles: [], issues: [], partido: null, feed: null };
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = rowsOf(wb);
  const local = clean(rows[0]?.[1]), visit = clean(rows[0]?.[4]);
  out.feed = feedName(rows[3]?.[1]);
  const jm = name.match(/_J(\d+)_/); const jornada = jm ? +jm[1] : null;
  const p = findPartido(local, visit, jornada);
  if (!p) { out.issues.push(`Partido no encontrado: ${local} - ${visit} (jornada ${jornada ?? "?"})`); return out; }
  out.partido = p.partido;

  const hdr = (rows[3] || []).map(norm);
  const col = (t, d) => { const i = hdr.indexOf(norm(t)); return i >= 0 ? i : d; };
  const iD = col("Hired TV Time", 3), iE = col("Broad TM Time", 4), iH = col("Output Seconds LIVE", null);
  const base = { jornada: p.jornada, competicion: p.competicion, partido: p.partido, local: p.local, visitante: p.visitante, fecha: p.fecha, feed: out.feed, archivo: name };

  const outputLive = (r, ri) => {
    if (iH == null) return null;
    if (isNum(r[iH])) return r[iH];
    const f = String(ws[XLSX().utils.encode_cell({ r: ri, c: iH })]?.f || "").replace(/\s/g, "");
    const m = f.match(/^SUM\(([A-Z]+)\d+:([A-Z]+)\d+\)$/i);
    if (!m) return null;
    let s = 0; for (let c = colIdx(m[1].toUpperCase()); c <= colIdx(m[2].toUpperCase()); c++) if (isNum(r[c])) s += r[c];
    return s;
  };

  const pqOf = {};
  let section = "seg";
  for (let ri = 4; ri < rows.length; ri++) {
    const r = rows[ri] || [], b = clean(r[1]);
    if (b === "GOALS") { section = "gol"; continue; }
    if (b === "MOMENTUMS") { section = "mom"; continue; }
    if (b === "MATCH COMMENTS") { section = "com"; continue; }
    if (section === "seg" && b && isNum(r[iE])) {
      const an = anunciante(b); pqOf[norm(an)] = clean(r[2]);
      out.records.push({ ...base, anunciante: an, pq: clean(r[2]), soporte: "UTV", tipoEntrada: "Segundos", tipoMomentum: null, minuto: null,
        ctto: isNum(r[iD]) ? r[iD] : 0, emitidoTM: r[iE], emitidoTV: outputLive(r, ri) });
    } else if (section === "gol" && b && b !== "ADVERTISER") {
      const an = anunciante(b);
      out.goles.push({ tipo: clean(r[5]) || "GOL", cliente: pqOf[norm(an)] || null, anunciante: an, competicion: p.competicion, jornada: p.jornada,
        partido: p.partido, local: p.local, visitante: p.visitante, fecha: p.fecha, feed: out.feed, minuto: clean(r[3]),
        resultado: String(clean(r[4]) ?? "").replace(/^="?|"$/g, "") });
    } else if (section === "mom" && b && !["ADVERTISER", "SUPPORTS", "OTHER COMMENTS"].includes(b)) {
      const m = String(r[6] ?? "").match(/^\s*(\d+)/);
      if (!m) { out.issues.push(`Momentum sin duración: ${b} ${clean(r[3]) ?? ""}`); continue; }
      const an = anunciante(b), s = +m[1];
      out.records.push({ ...base, anunciante: an, pq: pqOf[norm(an)] || null, soporte: "UTV", tipoEntrada: "Momentum", tipoMomentum: clean(r[5]),
        minuto: clean(r[3]), ctto: 0, emitidoTM: s, emitidoTV: s });
    }
  }
  return out;
}

/** Excel de estáticos de la jornada: una fila por soporte, anunciante y feed con "Tiempo en segundos". */
export function parseEstaticos(name, wb) {
  const out = { records: [], issues: [] };
  const rows = rowsOf(wb), H = (rows[0] || []).map(clean);
  for (let i = 1; i < rows.length; i++) {
    const d = {}; H.forEach((h, j) => { if (h) d[h] = clean(rows[i][j]); });
    if (!d["Anunciante"]) continue;
    const secs = d["Tiempo en segundos"];
    if (!isNum(secs)) { out.issues.push(`Fila ${i + 1}: ${d["Partido"]} ${d["Anunciante"]} sin segundos (${secs ?? "vacío"}${d["Anotaciones"] ? " · " + d["Anotaciones"] : ""})`); continue; }
    const p = findPartido(d["Equipo Local"], d["Equipo Visitante"], d["Jornada"]);
    if (!p) { out.issues.push(`Fila ${i + 1}: partido no encontrado ${d["Equipo Local"]} - ${d["Equipo Visitante"]}`); continue; }
    const sop = soporteOf(d["Soporte"]);
    if (!sop) out.issues.push(`Fila ${i + 1}: soporte "${d["Soporte"]}" sin coeficiente en la tabla Soportes`);
    out.records.push({ jornada: p.jornada, competicion: p.competicion, partido: p.partido, local: p.local, visitante: p.visitante, fecha: p.fecha,
      feed: feedName(d["Feed"]), anunciante: anunciante(d["Anunciante"]), pq: d["Cliente"], soporte: sop ? sop.soporte : d["Soporte"],
      sub1: d["Sub Soporte - 1"], sub2: d["Sub Soporte - 2"], tipoEntrada: "Estático", tipoMomentum: null, minuto: null, ctto: null,
      emitidoTM: secs, emitidoTV: secs, comMP: d["Incidencias"] || null, comCliente: d["Anotaciones"] || null, archivo: name });
  }
  return out;
}

/** Audiencias en el formato de la tabla Audiencias (Partido, Canal, Público, AM % Hogar, Aud. Hogar…). */
export function parseAudiencias(name, wb) {
  const out = { rows: [], issues: [] };
  const rows = rowsOf(wb), H = (rows[0] || []).map(norm);
  const g = (r, k) => { const i = H.indexOf(norm(k)); return i >= 0 ? clean(r[i]) : null; };
  if (H.indexOf(norm("AM % Hogar")) < 0) { out.issues.push("No reconozco las columnas. Se espera el formato de la tabla Audiencias (Partido, Canal, Público, AM % Hogar, Aud. Hogar…)."); return out; }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || g(r, "Jornada") == null) continue;
    const j = +g(r, "Jornada"), partido = g(r, "Partido");
    const p = S.masters.partidos.find(x => x.jornada === j && norm(x.partido) === norm(partido)) || findPartido(g(r, "Local"), g(r, "Visitante"), j);
    if (!p) { out.issues.push(`Fila ${i + 1}: partido ${partido} (J${j}) no está en la tabla Partidos`); continue; }
    out.rows.push({ competicion: p.competicion, jornada: j, partido: p.partido, local: p.local, visitante: p.visitante, canal: g(r, "Canal"), tipoCanal: g(r, "Tipo Canal"),
      publico: +g(r, "Público"), cuota: g(r, "Cuota Pant. %"), amHogar: g(r, "AM % Hogar"), audHogar: g(r, "Aud. Hogar") });
    if (!canalOf(g(r, "Canal"))) out.issues.push(`Canal "${g(r, "Canal")}" no está en la tabla Canales: sus filas no se valoran`);
  }
  out.issues = uniq(out.issues);
  return out;
}
