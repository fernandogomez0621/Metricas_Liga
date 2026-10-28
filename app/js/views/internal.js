// Vista interna "Investigación": las mismas pestañas que IKLAN.
import { S, persist, nextId, logChange } from "../store.js";
import { esc, isNum, round3, uniq, int, dec2, dec3, eur, mmss, nf0, nf3, toast } from "../util.js";
import { rerender } from "../bus.js";
import { table } from "../table.js";
import { formModal } from "../modals.js";
import { canalOf } from "../masters.js";
import { analitica } from "../calc.js";
import { renderFormulas } from "./formulas.js";

export const TABS = [
  ["segundos", "Segundos"], ["audiencias", "Audiencias"], ["goles", "Goles"], ["loga", "Log A."], ["logc", "Log C."],
  ["equipos", "Equipos"], ["partidos", "Partidos"], ["publicos", "Públicos"], ["canales", "Canales"], ["soportes", "Soportes"], ["analitica", "Analítica"], ["formulas", "Fórmulas"],
];

export const tabCounts = () => ({
  segundos: S.records.length, audiencias: S.audiencias.length, goles: S.goles.length, loga: S.logA.length, logc: S.logC.length,
  equipos: S.masters.equipos.length, partidos: S.masters.partidos.length, publicos: S.masters.publicos.length,
  canales: S.masters.canales.length, soportes: S.masters.soportes.length,
});

const chipFeed = v => v ? `<span class="chip ${v === "NACIONAL" ? "nac" : "int"}">${esc(v)}</span>` : "";
const chipTipo = v => v ? `<span class="chip ${v === "Momentum" ? "mom" : v === "Estático" ? "est" : "seg"}">${esc(v)}</span>` : "";
const head = (h, p, actions = "") => `<div class="pagehead"><div><h2>${h}</h2>${p ? `<p>${p}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
const kpis = items => `<div class="kpis">${items.map(([l, v, h, cls]) => `<div class="kpi ${cls || ""}"><span class="l">${l}</span><span class="v">${v}</span>${h ? `<span class="h">${h}</span>` : ""}</div>`).join("")}</div>`;

function recordForm(r) {
  const P = S.masters.partidos.filter(p => p.jornada === (r.jornada || 1)).map(p => p.partido);
  const fields = [
    { k: "feed", l: "Feed", type: "select", opts: uniq(["NACIONAL", "ROW", "EUROPA", "USA", "LATAM", "MENA", "PRC+SEA", r.feed].filter(Boolean)) },
    { k: "anunciante", l: "Anunciante" }, { k: "pq", l: "PQ (cliente)" },
    { k: "jornada", l: "Jornada", type: "number" }, { k: "partido", l: "Partido", type: "select", opts: uniq([r.partido, ...P].filter(Boolean)) },
    { k: "soporte", l: "Soporte", type: "select", opts: uniq([r.soporte, ...S.masters.soportes.map(s => s.soporte)].filter(Boolean)) },
    { k: "tipoEntrada", l: "Tipo de entrada", type: "select", opts: ["Segundos", "Momentum", "Estático"] },
    { k: "tipoMomentum", l: "Tipo (momentum)" }, { k: "minuto", l: "Minuto" },
    { k: "ctto", l: "Ctto. TM (s)", type: "number" }, { k: "emitidoTV", l: "Emitido TV (s)", type: "number" }, { k: "emitidoTM", l: "Emitido TM (s)", type: "number" },
    { k: "comMP", l: "Comentario interno", type: "textarea", wide: true }, { k: "comCliente", l: "Comentario para el cliente", type: "textarea", wide: true },
  ];
  const isNew = !r.id;
  formModal(isNew ? "Nuevo registro de segundos" : "Modificar registro de segundos", fields, r, o => {
    const p = S.masters.partidos.find(x => x.jornada === o.jornada && x.partido === o.partido);
    if (p) Object.assign(o, { local: p.local, visitante: p.visitante, fecha: p.fecha, competicion: p.competicion });
    if (isNew) { o.id = nextId(); o.archivo = "Alta manual"; S.records.push(o); logChange("addRecord", `${o.partido} · ${o.anunciante}`); }
    else { Object.assign(S.records.find(x => x.id === r.id), o); logChange("editRecord", `${o.partido} · ${o.anunciante}`); }
  }, isNew ? null : () => { S.records = S.records.filter(x => x.id !== r.id); logChange("deleteRecord", `${r.partido} · ${r.anunciante}`); });
}

function crud(list, fields, title) {
  return {
    onRow: o => formModal("Modificar " + title, fields, o, n => { Object.assign(o, n); logChange("edit", title); }, () => { const i = list().indexOf(o); if (i >= 0) list().splice(i, 1); logChange("delete", title); }),
    add: () => formModal("Nuevo · " + title, fields, {}, n => { n.id = nextId(); list().push(n); logChange("add", title); }),
  };
}

const VIEWS = {
  segundos(main, T) {
    const nac = S.records.filter(r => r.feed === "NACIONAL");
    main.innerHTML = head("Segundos", "Cada fila es una presencia: vallas, momentums y estáticos. Pulsa una fila para modificarla o eliminarla.") +
      kpis([["Registros", nf0.format(S.records.length), `${uniq(S.records.map(r => r.partido)).length} partidos`],
        ["Contratado (vallas)", mmss(S.records.reduce((a, r) => a + (r.ctto || 0), 0)), "Ctto. TM"],
        ["Emitido TV", mmss(S.records.filter(r => r.tipoEntrada === "Segundos").reduce((a, r) => a + (r.emitidoTV || 0), 0)), "Vallas, todos los feeds"],
        ["Feed nacional", nf0.format(nac.length), "registros"]]);
    main.appendChild(T);
    const inS = r => S.insitu[r.jornada + "|" + r.partido] || {};
    table(T, { id: "seg", file: "Segundos", totals: true, onRow: recordForm,
      add: () => recordForm({ jornada: 1, tipoEntrada: "Segundos", feed: "NACIONAL", soporte: "UTV" }), rows: () => S.records, cols: [
        { k: "feed", l: "Feed", html: chipFeed }, { k: "anunciante", l: "Anunciante" }, { k: "pq", l: "PQ" }, { k: "competicion", l: "Competición", hide: true },
        { k: "jornada", l: "Jornada", num: true }, { k: "partido", l: "Partido" }, { k: "local", l: "Local", hide: true }, { k: "visitante", l: "Visitante", hide: true },
        { k: "soporte", l: "Soporte" }, { k: "sub1", l: "SubSoporte 1", hide: true }, { k: "sub2", l: "SubSoporte 2", hide: true },
        { k: "tipoEntrada", l: "Tipo de entrada", html: chipTipo }, { k: "tipoMomentum", l: "Tipo" }, { k: "minuto", l: "Minuto", hide: true },
        { k: "ctto", l: "Ctto. TM", num: true, sum: true, fmt: int, nofilter: true },
        { k: "emitidoTV", l: "Emitido TV", num: true, sum: true, fmt: int, nofilter: true },
        { k: "emitidoTM", l: "Emitido TM", num: true, sum: true, fmt: int, nofilter: true },
        { k: "led", l: "Insitu LED", num: true, v: r => inS(r).led, fmt: int, hide: true, nofilter: true },
        { k: "est", l: "Insitu Estáticos", num: true, v: r => inS(r).est, fmt: int, hide: true, nofilter: true },
        { k: "comMP", l: "Comentarios MP", hide: true }, { k: "comCliente", l: "Comentarios cliente", hide: true }, { k: "archivo", l: "Archivo", hide: true }] });
  },
  audiencias(main, T) {
    main.innerHTML = head("Audiencias", "Datos de Kantar por partido, canal y público. La audiencia total aplica el factor del canal: 3,2 en pago y 1,22 en abierto.");
    main.appendChild(T);
    const fields = [{ k: "jornada", l: "Jornada", type: "number" }, { k: "partido", l: "Partido" }, { k: "canal", l: "Canal", type: "select", opts: S.masters.canales.map(c => c.canal).filter(Boolean) },
      { k: "tipoCanal", l: "Tipo canal" }, { k: "publico", l: "Público", type: "select", opts: [16, 4] }, { k: "cuota", l: "Cuota pant. %", type: "number" },
      { k: "amHogar", l: "AM % hogar", type: "number" }, { k: "audHogar", l: "Aud. hogar", type: "number" }];
    table(T, { id: "aud", file: "Audiencias", ...crud(() => S.audiencias, fields, "audiencia"), rows: () => S.audiencias, cols: [
      { k: "competicion", l: "Competición" }, { k: "jornada", l: "Jornada", num: true }, { k: "partido", l: "Partido" }, { k: "local", l: "Local" }, { k: "visitante", l: "Visitante" },
      { k: "canal", l: "Canal" }, { k: "tipoCanal", l: "Tipo canal" }, { k: "publico", l: "Público", num: true },
      { k: "cuota", l: "Cuota pant. %", num: true, fmt: dec3, nofilter: true }, { k: "amHogar", l: "AM % hogar", num: true, fmt: dec3, nofilter: true },
      { k: "audHogar", l: "Aud. hogar", num: true, fmt: int, nofilter: true },
      { k: "amT", l: "AM % total", num: true, v: a => { const c = canalOf(a.canal); return c ? round3(a.amHogar * c.fTotal) : null; }, fmt: dec3, nofilter: true },
      { k: "audT", l: "Aud. total", num: true, v: a => { const c = canalOf(a.canal); return c ? a.audHogar * c.fTotal : null; }, fmt: int, nofilter: true }] });
  },
  goles(main, T) {
    main.innerHTML = head("Goles", "Goles y penaltis patrocinados, leídos de la tabla GOALS de cada postplay."); main.appendChild(T);
    const fields = [{ k: "tipo", l: "Tipo", type: "select", opts: ["GOL", "PENALTI"] }, { k: "cliente", l: "Cliente" }, { k: "anunciante", l: "Anunciante" },
      { k: "jornada", l: "Jornada", type: "number" }, { k: "partido", l: "Partido" }, { k: "minuto", l: "Minuto" }, { k: "resultado", l: "Resultado" }];
    table(T, { id: "gol", file: "Goles", ...crud(() => S.goles, fields, "gol"), rows: () => S.goles, empty: "Sin goles registrados.", cols: [
      { k: "tipo", l: "Tipo" }, { k: "cliente", l: "Cliente" }, { k: "anunciante", l: "Anunciante" }, { k: "feed", l: "Feed", html: chipFeed }, { k: "competicion", l: "Competición" },
      { k: "jornada", l: "Jornada", num: true }, { k: "local", l: "Local" }, { k: "visitante", l: "Visitante" }, { k: "fecha", l: "Fecha" }, { k: "minuto", l: "Minuto" }, { k: "resultado", l: "Resultado" }] });
  },
  loga(main, T) {
    main.innerHTML = head("Log de accesos", "Cada entrada a la vista cliente queda registrada."); main.appendChild(T);
    table(T, { id: "loga", file: "LogAccesos", rows: () => S.logA, empty: "Sin accesos todavía. Entra en «Vista cliente» para generar uno.", cols: [
      { k: "anunciante", l: "Anunciante" }, { k: "dia", l: "Día" }, { k: "hora", l: "Hora" }, { k: "usuario", l: "Usuario" }, { k: "email", l: "Email" }, { k: "ip", l: "IP" }] });
  },
  logc(main, T) {
    main.innerHTML = head("Log de cambios", "Subidas de archivos, ediciones, validaciones y asistencias."); main.appendChild(T);
    table(T, { id: "logc", file: "LogCambios", rows: () => S.logC, empty: "Sin cambios registrados.", cols: [
      { k: "club", l: "Club / equipo" }, { k: "dia", l: "Día" }, { k: "hora", l: "Hora" }, { k: "usuario", l: "Usuario" }, { k: "email", l: "Email", hide: true }, { k: "ope", l: "Operación" }, { k: "descripcion", l: "Descripción" }] });
  },
  equipos(main, T) {
    main.innerHTML = head("Equipos", ""); main.appendChild(T);
    const fields = [{ k: "nombre", l: "Equipo", wide: true }, { k: "corto", l: "Nombre corto" }, { k: "siglas", l: "Abreviatura" }, { k: "estadio", l: "Estadio" },
      { k: "capacidad", l: "Capacidad", type: "number" }, { k: "socios", l: "Socios", type: "number" }];
    table(T, { id: "eq", file: "Equipos", ...crud(() => S.masters.equipos, fields, "equipo"), rows: () => S.masters.equipos, cols: [
      { k: "nombre", l: "Equipo" }, { k: "corto", l: "Nombre corto" }, { k: "siglas", l: "Abreviatura" }, { k: "socios", l: "Socios", num: true, fmt: int },
      { k: "capacidad", l: "Capacidad", num: true, fmt: int }, { k: "estadio", l: "Estadio" }] });
  },
  partidos(main, T) {
    main.innerHTML = head("Partidos", "Calendario de la temporada. Los Excel se asignan a un partido cruzando los nombres de local y visitante."); main.appendChild(T);
    const fields = [{ k: "competicion", l: "Competición" }, { k: "jornada", l: "Jornada", type: "number" }, { k: "fecha", l: "Fecha (dd-mm-aaaa)" }, { k: "dia", l: "Día" },
      { k: "partido", l: "Partido" }, { k: "local", l: "Local" }, { k: "visitante", l: "Visitante" }];
    table(T, { id: "pa", file: "Partidos", ...crud(() => S.masters.partidos, fields, "partido"), rows: () => S.masters.partidos, cols: [
      { k: "competicion", l: "Competición" }, { k: "jornada", l: "Jornada", num: true }, { k: "fecha", l: "Fecha" }, { k: "dia", l: "Día" },
      { k: "partido", l: "Partido" }, { k: "local", l: "Local" }, { k: "visitante", l: "Visitante" }] });
  },
  publicos(main, T) {
    main.innerHTML = head("Públicos", "Universos de Kantar: personas de 16 años o más y de 4 años o más."); main.appendChild(T);
    const fields = [{ k: "publico", l: "Público", type: "number" }, { k: "universo", l: "Universo nacional", type: "number" }];
    table(T, { id: "pub", file: "Publicos", ...crud(() => S.masters.publicos, fields, "público"), rows: () => S.masters.publicos, cols: [
      { k: "publico", l: "Público", num: true }, { k: "universo", l: "Universo nacional", num: true, fmt: int }] });
  },
  canales(main, T) {
    main.innerHTML = head("Canales", "Coste de un GRP y factor de audiencia por canal. Se usan en la valoración económica."); main.appendChild(T);
    const fields = [{ k: "canal", l: "Canal", wide: true }, { k: "abrev", l: "Abreviatura" }, { k: "tipo", l: "Tipo" }, { k: "influencia", l: "Influencia" },
      { k: "cgrpN", l: "C. GRP nacional €", type: "number" }, { k: "cgrpR", l: "C. GRP regional €", type: "number" }, { k: "fCasa", l: "F. casa", type: "number" }, { k: "fTotal", l: "F. total", type: "number" }];
    table(T, { id: "can", file: "Canales", ...crud(() => S.masters.canales, fields, "canal"), rows: () => S.masters.canales, cols: [
      { k: "canal", l: "Canal" }, { k: "abrev", l: "Abreviatura" }, { k: "tipo", l: "Tipo" }, { k: "influencia", l: "Influencia" },
      { k: "cgrpN", l: "C. GRP nacional €", num: true, fmt: dec2 }, { k: "cgrpR", l: "C. GRP regional €", num: true, fmt: dec2 },
      { k: "fCasa", l: "F. casa", num: true }, { k: "fTotal", l: "F. total", num: true, fmt: dec2 }] });
  },
  soportes(main, T) {
    main.innerHTML = head("Soportes", "El coeficiente de tamaño pondera cada soporte frente a un anuncio a pantalla completa."); main.appendChild(T);
    const fields = [{ k: "soporte", l: "Soporte" }, { k: "abrev", l: "Abreviatura" }, { k: "desc", l: "Descripción", wide: true }, { k: "coef", l: "Coeficiente de tamaño", type: "number" }];
    table(T, { id: "sop", file: "Soportes", ...crud(() => S.masters.soportes, fields, "soporte"), rows: () => S.masters.soportes, cols: [
      { k: "soporte", l: "Soporte" }, { k: "abrev", l: "Abreviatura" }, { k: "desc", l: "Descripción" }, { k: "coef", l: "Coeficiente de tamaño", num: true, fmt: dec2 }] });
  },
  analitica(main, T) {
    const A = analitica();
    const tot = p => A.reduce((a, r) => a + (r["val" + p] || 0), 0);
    const sinAud = uniq(A.filter(r => r.feed === "NACIONAL" && !r.canal).map(r => "J" + r.jornada + " " + r.partido));
    main.innerHTML = head("Analítica", "GRPs = AM % total × segundos ÷ 20 · Valoración = GRPs × coste GRP del canal × coeficiente del soporte.",
      `<label class="inline-select" for="emit">Valorar con <select id="emit"><option value="TV" ${S.config.emitido === "TV" ? "selected" : ""}>Emitido TV</option><option value="TM" ${S.config.emitido === "TM" ? "selected" : ""}>Emitido TM</option></select></label>`) +
      kpis([["Valoración +16", eur(tot(16)), `${nf0.format(A.filter(r => r.val16 != null).length)} filas valoradas`, "accent"],
        ["Valoración +4", eur(tot(4)), "Público de 4 años o más"],
        ["Segundos valorados", mmss(A.filter(r => r.val16 != null).reduce((a, r) => a + (r.sg || 0), 0)), "Solo feed nacional"],
        ["Partidos sin audiencia", String(sinAud.length), sinAud.length ? esc(sinAud.slice(0, 3).join(" · ")) + (sinAud.length > 3 ? "…" : "") : "Todos tienen Kantar", sinAud.length ? "warn" : ""]]);
    main.appendChild(T);
    main.querySelector("#emit").onchange = e => { S.config.emitido = e.target.value; logChange("config", "Valorar con Emitido " + e.target.value); persist(); rerender(); toast("Recalculado con Emitido " + e.target.value); };
    const g3 = v => isNum(v) ? nf3.format(v) : "";
    table(T, { id: "ana", file: "Analitica", totals: true, rows: () => A, cols: [
      { k: "feed", l: "Feed", html: chipFeed }, { k: "anunciante", l: "Anunciante" }, { k: "pq", l: "PQ" }, { k: "competicion", l: "Competición", hide: true },
      { k: "jornada", l: "Jornada", num: true }, { k: "fecha", l: "Fecha", hide: true }, { k: "partido", l: "Partido" }, { k: "local", l: "Local", hide: true }, { k: "visitante", l: "Visitante", hide: true },
      { k: "soporte", l: "Soporte" }, { k: "canal", l: "Canal" }, { k: "tipoEntrada", l: "Tipo de entrada", html: chipTipo }, { k: "tipoMomentum", l: "Tipo momentum", hide: true },
      { k: "sg", l: "Sg emitidos", num: true, sum: true, fmt: int, nofilter: true }, { k: "ctto", l: "Sg teóricos", num: true, sum: true, fmt: int, nofilter: true },
      { k: "amT16", l: "AM % total +16", num: true, fmt: dec3, nofilter: true, hide: true }, { k: "amT4", l: "AM % total +4", num: true, fmt: dec3, nofilter: true, hide: true },
      { k: "audT16", l: "Aud. total +16", num: true, fmt: int, nofilter: true, hide: true }, { k: "audT4", l: "Aud. total +4", num: true, fmt: int, nofilter: true, hide: true },
      { k: "grp16", l: "GRPs +16", num: true, sum: true, fmt: g3, nofilter: true }, { k: "grp4", l: "GRPs +4", num: true, sum: true, fmt: g3, nofilter: true, hide: true },
      { k: "costeN", l: "Coste canal N.", num: true, fmt: int, nofilter: true, hide: true }, { k: "coef", l: "Coef. tamaño", num: true, nofilter: true, hide: true },
      { k: "val16", l: "Valoración € +16", num: true, sum: true, fmt: eur, nofilter: true }, { k: "val4", l: "Valoración € +4", num: true, sum: true, fmt: eur, nofilter: true }] });
  },
};

VIEWS.formulas = main => renderFormulas(main);

export function renderInternal(main, tab) {
  const T = document.createElement("div");
  (VIEWS[tab] || VIEWS.segundos)(main, T);
}
