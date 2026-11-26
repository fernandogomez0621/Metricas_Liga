// Pestaña "Archivos": qué hay cargado en cada jornada (postplays por partido y feed, estáticos,
// audiencias y goles), de qué archivo viene, cuándo se cargó, y borrado por archivo o por jornada.
import { S, persist, logChange } from "../store.js";
import { esc, nf0, uniq, sortedValues, toast } from "../util.js";
import { rerender } from "../bus.js";
import { modal, armDelete } from "../modals.js";

let selected = null;   // jornada abierta en el detalle

const isAudES = a => !a.ambito || a.ambito === "ESPAÑA";
const MANUAL = "Alta manual";

/** Fecha y hora de la última carga de un archivo, sacada del log de cambios. */
function loadedAt(archivo) {
  if (!archivo || archivo === MANUAL) return "";
  if (archivo === "Consulta a la base de datos") { const q = S.logC.find(l => l.ope === "audienciasSQL"); return q ? `${q.dia} ${q.hora}` : ""; }
  const e = S.logC.find(l => /^cargar|^uploadFiles|^audienciasSQL/.test(l.ope || "") && String(l.descripcion || "").endsWith(archivo));
  return e ? `${e.dia} ${e.hora}` : "";
}

/** Agrupa todo lo cargado de una jornada en "elementos" que se pueden borrar de una vez. */
function itemsOf(j) {
  const items = [];
  const recs = S.records.filter(r => r.jornada === j);
  // postplays: un elemento por archivo (partido + feed); las altas manuales aparte
  const pp = recs.filter(r => r.tipoEntrada !== "Estático");
  for (const key of uniq(pp.map(r => (r.archivo || MANUAL) + "|" + r.partido + "|" + r.feed))) {
    const [archivo, partido, feed] = key.split("|");
    const rows = pp.filter(r => (r.archivo || MANUAL) === archivo && r.partido === partido && r.feed === feed);
    const goles = archivo === MANUAL ? [] : S.goles.filter(g => g.jornada === j && g.partido === partido && g.feed === feed);
    items.push({ tipo: archivo === MANUAL ? "Alta manual" : "Postplay", archivo, partido, ambito: feed, n: rows.length,
      detalle: `${rows.filter(r => r.tipoEntrada === "Segundos").length} vallas · ${rows.filter(r => r.tipoEntrada === "Momentum").length} momentums${goles.length ? ` · ${goles.length} goles` : ""}`,
      del: () => {
        S.records = S.records.filter(r => !(r.jornada === j && r.tipoEntrada !== "Estático" && (r.archivo || MANUAL) === archivo && r.partido === partido && r.feed === feed));
        if (archivo !== MANUAL) S.goles = S.goles.filter(g => !(g.jornada === j && g.partido === partido && g.feed === feed));
      } });
  }
  // estáticos: un elemento por archivo
  const est = recs.filter(r => r.tipoEntrada === "Estático");
  for (const archivo of uniq(est.map(r => r.archivo || MANUAL))) {
    const rows = est.filter(r => (r.archivo || MANUAL) === archivo);
    items.push({ tipo: "Estáticos", archivo, partido: `${uniq(rows.map(r => r.partido)).length} partidos`, ambito: uniq(rows.map(r => r.feed)).length + " feeds", n: rows.length,
      detalle: `${uniq(rows.map(r => r.soporte)).length} soportes`,
      del: () => { S.records = S.records.filter(r => !(r.jornada === j && r.tipoEntrada === "Estático" && (r.archivo || MANUAL) === archivo)); } });
  }
  // audiencias: un elemento por ámbito y origen (archivo de Kantar, consulta SQL o alta manual)
  const aud = S.audiencias.filter(a => a.jornada === j);
  for (const key of uniq(aud.map(a => (a.ambito || "ESPAÑA") + "|" + (a.archivo || MANUAL)))) {
    const [ambito, archivo] = key.split("|");
    const rows = aud.filter(a => (a.ambito || "ESPAÑA") === ambito && (a.archivo || MANUAL) === archivo);
    items.push({ tipo: ambito === "ESPAÑA" ? "Audiencias España" : "Audiencias internacionales", archivo: archivo === "SQL" ? "Consulta a la base de datos" : archivo,
      partido: `${uniq(rows.map(a => a.partido)).length} partidos`, ambito, n: rows.length, detalle: uniq(rows.map(a => a.canal)).join(", "),
      del: () => { S.audiencias = S.audiencias.filter(a => !(a.jornada === j && (a.ambito || "ESPAÑA") === ambito && (a.archivo || MANUAL) === archivo)); } });
  }
  return items;
}

function summaryOf(j) {
  const recs = S.records.filter(r => r.jornada === j);
  const cal = S.masters.partidos.filter(p => p.jornada === j);
  const ppNac = uniq(recs.filter(r => r.tipoEntrada !== "Estático" && r.feed === "NACIONAL").map(r => r.partido));
  const ppInt = recs.filter(r => r.tipoEntrada !== "Estático" && r.feed !== "NACIONAL");
  const audES = S.audiencias.filter(a => a.jornada === j && isAudES(a));
  return {
    j, cal: cal.length, ppNac: ppNac.length, ppIntFeeds: uniq(ppInt.map(r => r.partido + "|" + r.feed)).length,
    est: recs.filter(r => r.tipoEntrada === "Estático").length, audPartidos: uniq(audES.map(a => a.partido)).length,
    audInt: S.audiencias.filter(a => a.jornada === j && !isAudES(a)).length, goles: S.goles.filter(g => g.jornada === j).length,
    segs: recs.filter(r => r.tipoEntrada !== "Estático").length,
    vN: S.validadas.NACIONAL.includes(j), vI: S.validadas.INTERNACIONAL.includes(j),
  };
}

const jornadas = () => sortedValues([...S.records.map(r => r.jornada), ...S.audiencias.map(a => a.jornada), ...S.goles.map(g => g.jornada)]);
const tipoChip = t => `<span class="chip ${t === "Postplay" ? "nac" : t === "Estáticos" ? "est" : t.startsWith("Audiencias España") ? "ok" : t.startsWith("Audiencias") ? "int" : "mom"}">${esc(t)}</span>`;
const yes = (ok, txt) => `<span class="chip ${ok ? "ok" : ""}">${ok ? "✓ " : ""}${txt}</span>`;

export function renderArchivos(main) {
  const js = jornadas();
  if (selected !== null && !js.includes(selected)) selected = null;
  if (selected === null && js.length) selected = js.at(-1);
  const sums = js.map(summaryOf);

  main.innerHTML = `
  <div class="pagehead"><div><h2>Archivos</h2>
    <p>Qué hay cargado en cada jornada y de qué archivo viene. Pulsa una jornada para ver el detalle, eliminar un archivo concreto o vaciar la jornada entera.</p></div></div>
  ${js.length ? `
  <div class="tscroll"><table class="grid">
    <thead><tr><th>Jornada</th><th class="num">Postplays nacionales</th><th class="num">Feeds internacionales</th><th class="num">Segundos</th><th class="num">Estáticos</th>
      <th class="num">Audiencia España</th><th class="num">Aud. internacionales</th><th class="num">Goles</th><th>Validada</th><th></th></tr></thead>
    <tbody>${sums.map(s => `<tr class="click ${s.j === selected ? "sel" : ""}" data-j="${s.j}">
      <td><b>Jornada ${s.j}</b></td>
      <td class="num">${s.cal ? `${s.ppNac} / ${s.cal}` : s.ppNac}${s.cal && s.ppNac < s.cal ? ` <span class="miss" title="Partidos del calendario sin postplay nacional">faltan ${s.cal - s.ppNac}</span>` : ""}</td>
      <td class="num">${s.ppIntFeeds}</td><td class="num">${nf0.format(s.segs)}</td><td class="num">${nf0.format(s.est)}</td>
      <td class="num">${s.audPartidos ? `${s.audPartidos} partidos` : "—"}</td><td class="num">${s.audInt || "—"}</td><td class="num">${s.goles || "—"}</td>
      <td>${yes(s.vN, "Nac.")} ${yes(s.vI, "Int.")}</td>
      <td><button class="btn danger sm" data-delj="${s.j}">Eliminar jornada</button></td></tr>`).join("")}</tbody>
  </table></div>
  <div id="arch-detail"></div>` : `<div class="notice">Todavía no hay datos cargados. Usa «Cargar datos».</div>`}`;

  main.querySelectorAll("tr[data-j]").forEach(tr => tr.onclick = e => {
    if (e.target.closest("[data-delj]")) return;
    selected = +tr.dataset.j; rerender();
  });
  main.querySelectorAll("[data-delj]").forEach(b => b.onclick = e => { e.stopPropagation(); deleteJornadaModal(+b.dataset.delj); });
  if (selected !== null) renderDetail(main.querySelector("#arch-detail"), selected);
}

function renderDetail(el, j) {
  const items = itemsOf(j);
  const cal = S.masters.partidos.filter(p => p.jornada === j);
  const recs = S.records.filter(r => r.jornada === j);
  const audES = S.audiencias.filter(a => a.jornada === j && isAudES(a));
  const extra = uniq(recs.map(r => r.partido)).filter(p => !cal.some(c => c.partido === p));
  const partidos = [...cal.map(c => c.partido), ...extra];
  el.innerHTML = `
  <section class="card">
    <header class="card-h"><span class="tag blue">Jornada ${j}</span><h3>Archivos cargados</h3>
      <button class="btn danger" id="del-j">Eliminar jornada ${j}</button></header>
    <div class="tscroll flush"><table class="grid">
      <thead><tr><th>Tipo</th><th>Archivo / origen</th><th>Partido</th><th>Feed / ámbito</th><th class="num">Registros</th><th>Contenido</th><th>Cargado</th><th></th></tr></thead>
      <tbody>${items.length ? items.map((it, i) => `<tr><td>${tipoChip(it.tipo)}</td><td class="file">${esc(it.archivo)}</td><td>${esc(it.partido)}</td><td>${esc(it.ambito)}</td>
        <td class="num">${nf0.format(it.n)}</td><td class="muted">${esc(it.detalle)}</td><td class="muted">${esc(loadedAt(it.archivo))}</td>
        <td><button class="btn danger sm" data-del="${i}">Eliminar</button></td></tr>`).join("") : `<tr><td class="empty" colspan="8">Nada cargado en esta jornada.</td></tr>`}</tbody>
    </table></div>
  </section>
  <section class="card">
    <header class="card-h"><span class="tag green">Control</span><h3>Partidos de la jornada ${j}</h3></header>
    <div class="tscroll flush"><table class="grid">
      <thead><tr><th>Partido</th><th>Postplay nacional</th><th>Feeds internacionales</th><th class="num">Estáticos</th><th>Audiencia España</th></tr></thead>
      <tbody>${partidos.map(p => {
        const r = recs.filter(x => x.partido === p);
        const nac = r.some(x => x.feed === "NACIONAL" && x.tipoEntrada !== "Estático");
        const feeds = uniq(r.filter(x => x.feed !== "NACIONAL" && x.tipoEntrada !== "Estático").map(x => x.feed));
        const aud = uniq(audES.filter(a => a.partido === p).map(a => a.canal));
        return `<tr><td><b>${esc(p)}</b>${extra.includes(p) ? ' <span class="miss">fuera del calendario</span>' : ""}</td>
          <td>${yes(nac, nac ? "Cargado" : "Falta")}</td><td>${feeds.length ? esc(feeds.join(", ")) : "—"}</td>
          <td class="num">${nf0.format(r.filter(x => x.tipoEntrada === "Estático").length)}</td>
          <td>${aud.length ? yes(true, esc(aud.join(", "))) : yes(false, "Falta")}</td></tr>`;
      }).join("")}</tbody>
    </table></div>
  </section>`;
  el.querySelector("#del-j").onclick = () => deleteJornadaModal(j);
  el.querySelectorAll("[data-del]").forEach(b => armDelete(b, () => {
    const it = items[+b.dataset.del];
    it.del(); logChange("eliminarArchivo", `J${j} · ${it.tipo} · ${it.archivo}${it.tipo === "Postplay" ? " · " + it.partido + " " + it.ambito : ""}`);
    persist(); rerender(); toast(`Eliminado: ${it.archivo} (${nf0.format(it.n)} registros)`);
  }));
}

/** Ventana "Eliminar jornada": se elige qué tipos de datos borrar. */
export function deleteJornadaModal(j) {
  const recs = S.records.filter(r => r.jornada === j);
  const opts = [
    ["pp", "Segundos de postplays (vallas y momentums) y altas manuales", recs.filter(r => r.tipoEntrada !== "Estático").length],
    ["est", "Estáticos", recs.filter(r => r.tipoEntrada === "Estático").length],
    ["goles", "Goles", S.goles.filter(g => g.jornada === j).length],
    ["audES", "Audiencias España", S.audiencias.filter(a => a.jornada === j && isAudES(a)).length],
    ["audInt", "Audiencias internacionales", S.audiencias.filter(a => a.jornada === j && !isAudES(a)).length],
  ];
  const validada = S.validadas.NACIONAL.includes(j) || S.validadas.INTERNACIONAL.includes(j);
  const m = modal({ title: `Eliminar jornada ${j}`, subtitle: "Marca qué quieres borrar. No se puede deshacer, pero puedes volver a cargar los archivos.",
    body: `<div class="del-list">${opts.map(([k, l, n]) => `<label class="${n ? "" : "off"}"><input type="checkbox" data-k="${k}" ${n ? "checked" : "disabled"}><span>${l}</span><b>${nf0.format(n)}</b></label>`).join("")}</div>
      ${validada ? `<label class="del-list"><span><input type="checkbox" id="del-val" checked> Retirar también la validación (los clientes dejarán de ver la jornada ${j})</span></label>` : ""}
      <p class="caption">La configuración (canales, soportes, partidos…) y las demás jornadas no se tocan.</p>`,
    footer: `<span class="sp"></span><button class="btn" data-close>Cancelar</button><button class="btn danger" id="del-go">Eliminar seleccionado</button>` });
  armDelete(m.root.querySelector("#del-go"), () => {
    const sel = new Set([...m.root.querySelectorAll("[data-k]:checked")].map(c => c.dataset.k));
    if (!sel.size) return toast("No marcaste nada para eliminar");
    const before = S.records.length + S.audiencias.length + S.goles.length;
    if (sel.has("pp")) S.records = S.records.filter(r => !(r.jornada === j && r.tipoEntrada !== "Estático"));
    if (sel.has("est")) S.records = S.records.filter(r => !(r.jornada === j && r.tipoEntrada === "Estático"));
    if (sel.has("goles")) S.goles = S.goles.filter(g => g.jornada !== j);
    if (sel.has("audES")) S.audiencias = S.audiencias.filter(a => !(a.jornada === j && isAudES(a)));
    if (sel.has("audInt")) S.audiencias = S.audiencias.filter(a => !(a.jornada === j && !isAudES(a)));
    if (m.root.querySelector("#del-val")?.checked) { S.validadas.NACIONAL = S.validadas.NACIONAL.filter(x => x !== j); S.validadas.INTERNACIONAL = S.validadas.INTERNACIONAL.filter(x => x !== j); }
    const n = before - (S.records.length + S.audiencias.length + S.goles.length);
    logChange("eliminarJornada", `J${j} · ${[...sel].join(", ")} · ${n} registros`);
    m.close(); persist(); rerender(); toast(`Jornada ${j}: ${nf0.format(n)} registros eliminados`);
  });
}
