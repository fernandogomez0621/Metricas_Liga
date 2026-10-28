// Vista cliente: lo que ve un anunciante o club. Solo jornadas validadas.
import { S } from "../store.js";
import { esc, int, nf3, mmss, sortedValues } from "../util.js";
import { rerender } from "../bus.js";
import { canExport, exportXlsx } from "../exporter.js";
import { feedGroup } from "../masters.js";
import { analitica } from "../calc.js";

const F = { grp: "NACIONAL", feed: "", anun: "", comp: "", jor: "", pub: "16", sop: "",
  accGrp: "NACIONAL", accAnun: "", accSop: "", desde: "", hasta: "", accPub: "16" };
export const resetClientFilters = () => { F.anun = ""; F.accAnun = ""; };

export function viewAsOptions(viewAs) {
  const anun = sortedValues(S.records.map(r => r.anunciante));
  const pq = sortedValues(S.records.map(r => r.pq));
  return `<option value="">Vista previa (todos)</option>
    <optgroup label="Clientes / PQ">${pq.map(p => `<option value="pq:${esc(p)}" ${viewAs === "pq:" + p ? "selected" : ""}>${esc(p)}</option>`).join("")}</optgroup>
    <optgroup label="Anunciantes">${anun.map(a => `<option value="an:${esc(a)}" ${viewAs === "an:" + a ? "selected" : ""}>${esc(a)}</option>`).join("")}</optgroup>`;
}

const opts = (arr, cur, all) => `${all ? `<option value="">${all}</option>` : ""}${arr.map(v => `<option ${String(v) === String(cur) ? "selected" : ""}>${esc(v)}</option>`).join("")}`;
const sel = (id, label, inner) => `<div class="field"><label for="${id}">${label}</label><select id="${id}">${inner}</select></div>`;
const chipFeed = v => `<span class="chip ${v === "NACIONAL" ? "nac" : "int"}">${esc(v)}</span>`;
const diff = (a, b) => `<span class="${a - b >= 0 ? "pos" : "neg"}">${a - b >= 0 ? "+" : ""}${mmss(a - b)}</span>`;

export function renderClient(main, viewAs) {
  const A = analitica();
  const visible = A.filter(r => S.validadas[feedGroup(r.feed)].includes(r.jornada) &&
    (!viewAs || (viewAs.startsWith("pq:") ? r.pq === viewAs.slice(3) : r.anunciante === viewAs.slice(3))));
  const who = !viewAs ? "Vista previa" : viewAs.slice(3);

  // --- control de presencia por jornada
  const g1 = visible.filter(r => feedGroup(r.feed) === F.grp);
  const anunList = sortedValues(g1.map(r => r.anunciante));
  if (F.anun && !anunList.includes(F.anun)) F.anun = "";
  if (!F.anun && anunList.length === 1) F.anun = anunList[0];
  const rows = g1.filter(r => (!F.feed || r.feed === F.feed) && (!F.anun || r.anunciante === F.anun) && (!F.comp || r.competicion === F.comp) &&
    (!F.jor || String(r.jornada) === F.jor) && (!F.sop || r.soporte === F.sop));
  const p = F.pub, groups = {};
  for (const r of rows) {
    const k = [r.jornada, r.partido, r.feed, r.canal || ""].join("|");
    const g = groups[k] ||= { jornada: r.jornada, partido: r.partido, fecha: r.fecha, feed: r.feed, canal: r.canal, tipos: new Set(), ctto: 0, tv: 0, audH: null, audT: null, grpH: 0, grpT: 0, cuota: null, hasAud: false };
    g.tipos.add(r.tipoEntrada); g.ctto += r.ctto || 0; g.tv += r.sg || 0;
    if (r["audH" + p] != null) { g.hasAud = true; g.audH = r["audH" + p]; g.audT = r["audT" + p]; g.grpH += r["grpH" + p]; g.grpT += r["grp" + p]; g.cuota = r["cuota" + p]; }
  }
  const G = Object.values(groups).sort((a, b) => a.jornada - b.jornada || String(a.partido).localeCompare(b.partido) || String(a.feed).localeCompare(b.feed));
  // un partido con dos canales repite filas: los tiempos se cuentan una sola vez
  const once = rows.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);
  const ctto = once.reduce((a, r) => a + (r.ctto || 0), 0), tv = once.reduce((a, r) => a + (r.sg || 0), 0);
  const tvVallas = once.filter(r => r.tipoEntrada === "Segundos").reduce((a, r) => a + (r.sg || 0), 0);
  const scale = Math.max(ctto, tvVallas) || 1;

  // --- acumulado
  const gA = visible.filter(r => feedGroup(r.feed) === F.accGrp);
  const accAnunList = sortedValues(gA.map(r => r.anunciante));
  if (F.accAnun && !accAnunList.includes(F.accAnun)) F.accAnun = "";
  if (!F.accAnun && accAnunList.length === 1) F.accAnun = accAnunList[0];
  const jlist = sortedValues(gA.map(r => r.jornada));
  const accRows = gA.filter(r => (!F.accAnun || r.anunciante === F.accAnun) && (!F.accSop || r.soporte === F.accSop) && (!F.desde || r.jornada >= +F.desde) && (!F.hasta || r.jornada <= +F.hasta));
  const ap = F.accPub, accJ = {};
  for (const r of accRows) {
    const g = accJ[r.jornada] ||= { jornada: r.jornada, partidos: new Set(), ids: new Set(), ctto: 0, tv: 0, grpH: 0, grpT: 0 };
    g.partidos.add(r.partido);
    if (!g.ids.has(r.id)) { g.ids.add(r.id); g.ctto += r.ctto || 0; g.tv += r.sg || 0; }
    if (r["grp" + ap] != null) { g.grpH += r["grpH" + ap]; g.grpT += r["grp" + ap]; }
  }
  const AJ = Object.values(accJ).sort((a, b) => a.jornada - b.jornada);
  const sumA = k => AJ.reduce((a, g) => a + g[k], 0);
  const noValid = !S.validadas.NACIONAL.length && !S.validadas.INTERNACIONAL.length;

  main.innerHTML = `
  <div class="viewas-banner"><div><span class="eyebrow">Así lo ve</span><strong>${esc(who)}</strong></div>
    <p>El cliente solo ve las jornadas validadas${viewAs ? " y solo sus propios anunciantes" : ""}. Valoración con Emitido ${S.config.emitido}.</p></div>
  ${noValid ? `<div class="notice">No hay jornadas validadas: el cliente no vería datos. Valídalas desde «Investigación» con «Validar jornada».</div>` : ""}
  <div class="cl-grid">
    <section class="card span2" aria-labelledby="cp-h">
      <header class="card-h"><span class="tag blue">Por jornada</span><h3 id="cp-h">Control de presencia</h3>
        ${canExport() ? `<button class="btn subtle" id="c-xlsx">Descargar Excel</button>` : ""}</header>
      <div class="filters">
        ${sel("c-grp", "Ámbito", `<option value="NACIONAL" ${F.grp === "NACIONAL" ? "selected" : ""}>Nacional</option><option value="INTERNACIONAL" ${F.grp === "INTERNACIONAL" ? "selected" : ""}>Internacional</option>`)}
        ${sel("c-feed", "Feed", opts(sortedValues(g1.map(r => r.feed)), F.feed, "Todos"))}
        ${sel("c-anun", "Anunciante", opts(anunList, F.anun, "Todos"))}
        ${sel("c-comp", "Competición", opts(sortedValues(g1.map(r => r.competicion)), F.comp, "Todas"))}
        ${sel("c-jor", "Jornada", opts(sortedValues(g1.map(r => r.jornada)), F.jor, "Todas"))}
        ${sel("c-pub", "Público", opts(["16", "4"], F.pub))}
        ${sel("c-sop", "Soporte", opts(sortedValues(g1.map(r => r.soporte)), F.sop, "Todos"))}
      </div>
      <div class="tscroll flush"><table class="grid">
        <thead><tr><th>Feed</th><th>Partido</th><th>Fecha</th><th>Canal TV</th><th>Tipo</th><th class="num">Contratado</th><th class="num">Televisivo</th>
          <th class="num">Aud. hogar Kantar</th><th class="num">Aud. total*</th><th class="num">GRPs hogar</th><th class="num">GRPs totales</th><th class="num">Cuota %</th></tr></thead>
        <tbody>${G.length ? G.map(g => `<tr><td>${chipFeed(g.feed)}</td><td><b>J${g.jornada}</b> · ${esc(g.partido)}</td><td>${esc(g.fecha || "—")}</td><td>${esc(g.canal || "—")}</td>
          <td>${esc([...g.tipos].join(", "))}</td><td class="num">${mmss(g.ctto)}</td><td class="num">${mmss(g.tv)}</td>
          <td class="num">${g.hasAud ? int(g.audH) : "—"}</td><td class="num">${g.hasAud ? int(g.audT) : "—"}</td><td class="num">${g.hasAud ? nf3.format(g.grpH) : "—"}</td>
          <td class="num">${g.hasAud ? nf3.format(g.grpT) : "—"}</td><td class="num">${g.cuota != null ? nf3.format(g.cuota) : "—"}</td></tr>`).join("")
          : `<tr><td class="empty" colspan="12">No hay datos para esta selección.</td></tr>`}</tbody>
        ${G.length ? `<tfoot><tr><td colspan="5">Total</td><td class="num">${mmss(ctto)}</td><td class="num">${mmss(tv)}</td><td></td><td></td>
          <td class="num">${nf3.format(G.reduce((a, g) => a + g.grpH, 0))}</td><td class="num">${nf3.format(G.reduce((a, g) => a + g.grpT, 0))}</td><td></td></tr></tfoot>` : ""}
      </table></div>
      <p class="card-foot">* Audiencia total (hogar Kantar + acompañantes + bares) = audiencia Kantar × coeficiente corrector: 3,2 en canales de pago y 1,22 en abierto.${F.grp === "INTERNACIONAL" ? " Los feeds internacionales no tienen medición Kantar." : ""}</p>
    </section>
    <aside class="card" aria-labelledby="ct-h">
      <header class="card-h"><span class="tag coral">Vallas</span><h3 id="ct-h">Control de tiempo</h3></header>
      <div class="timecard">
        <div class="big">${mmss(tvVallas)}</div><div class="caption">televisivos frente a ${mmss(ctto)} contratados</div>
        <div class="bars" role="img" aria-label="Contratado frente a televisivo">
          <div><span>Contratado</span><i style="--w:${(ctto / scale * 100).toFixed(1)}%"></i></div>
          <div><span>Televisivo</span><i class="tv" style="--w:${(tvVallas / scale * 100).toFixed(1)}%"></i></div>
        </div>
        <div class="delta">Diferencia ${diff(tvVallas, ctto)}</div>
        <p class="caption">Momentums y estáticos suman aparte: ${mmss(tv - tvVallas)}.</p>
      </div>
    </aside>
    <section class="card span2" aria-labelledby="ca-h">
      <header class="card-h"><span class="tag green">Acumulado</span><h3 id="ca-h">Control de presencia acumulada</h3></header>
      <div class="filters">
        ${sel("a-grp", "Ámbito", `<option value="NACIONAL" ${F.accGrp === "NACIONAL" ? "selected" : ""}>Nacional</option><option value="INTERNACIONAL" ${F.accGrp === "INTERNACIONAL" ? "selected" : ""}>Internacional</option>`)}
        ${sel("a-anun", "Anunciante", opts(accAnunList, F.accAnun, "Todos"))}
        ${sel("a-sop", "Soporte", opts(sortedValues(gA.map(r => r.soporte)), F.accSop, "Todos"))}
        ${sel("a-desde", "De la jornada", opts(jlist, F.desde, "Primera"))}
        ${sel("a-hasta", "A la jornada", opts(jlist, F.hasta, "Última"))}
        ${sel("a-pub", "Público", opts(["16", "4"], F.accPub))}
      </div>
      <div class="tscroll flush"><table class="grid">
        <thead><tr><th>Jornada</th><th class="num">Partidos</th><th class="num">Contratado</th><th class="num">Televisivo</th><th class="num">GRPs hogar</th><th class="num">GRPs totales</th></tr></thead>
        <tbody>${AJ.length ? AJ.map(g => `<tr><td>Jornada ${g.jornada}</td><td class="num">${g.partidos.size}</td><td class="num">${mmss(g.ctto)}</td><td class="num">${mmss(g.tv)}</td>
          <td class="num">${nf3.format(g.grpH)}</td><td class="num">${nf3.format(g.grpT)}</td></tr>`).join("") : `<tr><td class="empty" colspan="6">No hay datos para esta selección.</td></tr>`}</tbody>
        ${AJ.length ? `<tfoot><tr><td>Acumulado</td><td class="num">${AJ.reduce((a, g) => a + g.partidos.size, 0)}</td><td class="num">${mmss(sumA("ctto"))}</td><td class="num">${mmss(sumA("tv"))}</td>
          <td class="num">${nf3.format(sumA("grpH"))}</td><td class="num">${nf3.format(sumA("grpT"))}</td></tr></tfoot>` : ""}
      </table></div>
    </section>
    <aside class="card" aria-labelledby="cta-h">
      <header class="card-h"><span class="tag amber">Acumulado</span><h3 id="cta-h">Control de tiempo acumulado</h3></header>
      <div class="timecard"><div class="big">${mmss(sumA("tv"))}</div><div class="caption">televisivos frente a ${mmss(sumA("ctto"))} contratados</div>
        <div class="delta">Diferencia ${diff(sumA("tv"), sumA("ctto"))}</div></div>
    </aside>
  </div>`;

  const bind = (id, key, reset) => main.querySelector("#" + id).onchange = e => { F[key] = e.target.value; if (reset) reset(); rerender(); };
  bind("c-grp", "grp", () => { F.feed = ""; F.anun = ""; F.sop = ""; });
  [["c-feed", "feed"], ["c-anun", "anun"], ["c-comp", "comp"], ["c-jor", "jor"], ["c-pub", "pub"], ["c-sop", "sop"],
    ["a-anun", "accAnun"], ["a-sop", "accSop"], ["a-desde", "desde"], ["a-hasta", "hasta"], ["a-pub", "accPub"]].forEach(([i, k]) => bind(i, k));
  bind("a-grp", "accGrp", () => { F.accAnun = ""; F.accSop = ""; });
  main.querySelector("#c-xlsx")?.addEventListener("click", () => {
    const cols = [["Feed", "feed"], ["Jornada", "jornada"], ["Partido", "partido"], ["Fecha", "fecha"], ["Canal", "canal"], ["Contratado (s)", "ctto"], ["Televisivo (s)", "tv"],
      ["Aud. hogar", "audH"], ["Aud. total", "audT"], ["GRPs hogar", "grpH"], ["GRPs totales", "grpT"], ["Cuota %", "cuota"]].map(([l, k]) => ({ l, k }));
    exportXlsx("ControlPresencia_" + (F.anun || who).replace(/\W+/g, "_"), cols, G, (r, c) => r[c.k]);
  });
}
