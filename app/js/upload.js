// Ventana "Cargar datos": postplays, estáticos y audiencias (España por base de datos o Excel de Kantar;
// internacionales por Excel y país). Volver a cargar un partido, una jornada de estáticos o una
// audiencia reemplaza lo anterior de eso mismo, sin duplicar; el resto se acumula.
import { S, persist, nextId, logChange, sortRecords } from "./store.js";
import { esc, uniq, sortedValues, toast } from "./util.js";
import { rerender } from "./bus.js";
import { modal } from "./modals.js";
import * as api from "./api.js";
import { readWorkbook, parsePostplay, parseEstaticos, parseAudiencias, isKantarWorkbook, parseKantar, mapSqlAudiencias } from "./parsers.js";

export const PAISES = ["EUROPA", "USA", "LATAM", "MEXICO", "MENA", "AFRICA", "INDIA", "PRC", "SEA", "PRC+SEA", "EASTERN", "RUSSIA – EASTERN", "ROW"];

const drop = (k, title, desc) => `
  <label class="drop" data-k="${k}" for="f-${k}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0l-5 5m5-5l5 5M4 20h16"/></svg>
    <b>${title}</b><span>${desc}</span>
    <input type="file" id="f-${k}" accept=".xlsx,.xls" multiple>
    <span class="files" id="fl-${k}">Arrastra aquí o pulsa para elegir (varios a la vez)</span>
  </label>`;

const isoDate = d => d.toISOString().slice(0, 10);

export function uploadModal() {
  const files = { newevents: [], soportes: [], kantarEs: [], kantarInt: [] };
  const estJ = sortedValues(S.records.filter(r => r.tipoEntrada === "Estático").map(r => r.jornada));
  const audJ = sortedValues(S.audiencias.filter(a => !a.ambito || a.ambito === "ESPAÑA").map(a => a.jornada));
  const hoy = new Date(), hace7 = new Date(Date.now() - 6 * 864e5);
  const m = modal({
    title: "Cargar datos", wide: true,
    subtitle: "Los datos quedan como borrador: los clientes no los ven hasta que validas la jornada.",
    body: `
    <section class="load-sec">
      <h3>1 · Segundos</h3>
      <div class="drops">
        ${drop("newevents", "Postplays", "Un Excel por partido y feed, nacional e internacional.")}
        ${drop("soportes", "Estáticos", `Un Excel por jornada. Cada jornada nueva se suma a las ya cargadas; si repites una, se reemplaza. Cargadas: ${estJ.length ? "J" + estJ.join(", J") : "ninguna"}.`)}
      </div>
    </section>
    <section class="load-sec">
      <h3>2 · Audiencias Kantar</h3>
      <div class="seg-control" role="tablist" aria-label="Audiencias">
        <button role="tab" data-at="es" aria-pressed="true">Audiencias España</button>
        <button role="tab" data-at="int" aria-pressed="false">Audiencias internacionales</button>
      </div>
      <div class="aud-tab" data-panel="es">
        <div class="db-box">
          <div class="db-row">
            <div class="field"><label for="d-desde">Fecha inicio</label><input type="date" id="d-desde" value="${isoDate(hace7)}"></div>
            <div class="field"><label for="d-hasta">Fecha fin</label><input type="date" id="d-hasta" value="${isoDate(hoy)}"></div>
            <button class="btn primary" id="db-query" type="button">Consultar base de datos</button>
            <button class="btn" id="db-test" type="button">Probar conexión</button>
          </div>
          <div class="db-status" id="db-status" aria-live="polite">Comprobando servidor…</div>
        </div>
        <div class="or"><span>o carga el Excel exportado de Kantar</span></div>
        <div class="drops one">${drop("kantarEs", "Excel de Kantar (España)", `Hoja «Programas» exportada de Kantar, uno o varios a la vez. También acepta la tabla de Audiencias. Jornadas con audiencia: ${audJ.length ? "J" + audJ.join(", J") : "ninguna"}.`)}</div>
      </div>
      <div class="aud-tab" data-panel="int" hidden>
        <div class="db-row">
          <div class="field"><label for="pais">País / feed</label><select id="pais">${PAISES.map(p => `<option>${esc(p)}</option>`).join("")}</select></div>
          <p class="caption">Se guardan como referencia del país elegido. La valoración en euros sigue siendo solo con la audiencia de España.</p>
        </div>
        <div class="drops one">${drop("kantarInt", "Excel de audiencias internacionales", "Mismo formato que el de Kantar. Uno o varios a la vez.")}</div>
      </div>
    </section>
    <div id="up-report" aria-live="polite"></div>`,
    footer: `<span class="sp"></span><button class="btn" data-close>Cerrar</button><button class="btn primary" id="up-go">Procesar archivos</button>`,
  });

  const shows = {};
  for (const k of Object.keys(files)) {
    const inp = m.root.querySelector("#f-" + k), box = m.root.querySelector(`.drop[data-k="${k}"]`), list = m.root.querySelector("#fl-" + k);
    const show = shows[k] = () => { list.textContent = files[k].length ? files[k].map(f => f.name).join(" · ") : "Arrastra aquí o pulsa para elegir (varios a la vez)"; box.classList.toggle("has", files[k].length > 0); };
    inp.onchange = () => { files[k] = [...inp.files]; show(); };
    box.ondragover = e => { e.preventDefault(); box.classList.add("over"); };
    box.ondragleave = () => box.classList.remove("over");
    box.ondrop = e => { e.preventDefault(); box.classList.remove("over"); files[k] = [...e.dataTransfer.files].filter(f => /\.xlsx?$/i.test(f.name)); show(); };
  }
  m.root.querySelectorAll("[data-at]").forEach(b => b.onclick = () => {
    m.root.querySelectorAll("[data-at]").forEach(x => x.setAttribute("aria-pressed", x === b));
    m.root.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== b.dataset.at);
  });

  const report = m.root.querySelector("#up-report");
  const go = m.root.querySelector("#up-go");
  go.onclick = async () => {
    go.disabled = true; go.textContent = "Procesando…";
    const rep = await processUploads(files, m.root.querySelector("#pais").value);
    report.innerHTML = reportHtml(rep);
    // los archivos ya procesados se quitan de la selección para no cargarlos dos veces
    for (const k of Object.keys(files)) { files[k] = []; m.root.querySelector("#f-" + k).value = ""; shows[k](); }
    go.disabled = false; go.textContent = "Procesar archivos";
    persist(); rerender();
  };

  // --- base de datos (solo con servidor)
  const status = m.root.querySelector("#db-status"), bTest = m.root.querySelector("#db-test"), bQuery = m.root.querySelector("#db-query");
  const setStatus = (html, cls = "") => { status.className = "db-status " + cls; status.innerHTML = html; };
  api.available().then(ok => {
    if (!ok) { bTest.disabled = bQuery.disabled = true; setStatus("La consulta a la base de datos solo funciona con la app instalada en el servidor (Docker). Mientras tanto, carga el Excel de Kantar.", "warn"); }
    else setStatus("Servidor disponible. Pulsa «Probar conexión» para comprobar el acceso a SQL Server.");
  });
  bTest.onclick = async () => {
    bTest.disabled = true; setStatus("Conectando…");
    try {
      const r = await api.testDb();
      if (r.ok && r.body.ok) {
        const d = r.body;
        setStatus(`<b>Conexión correcta</b> · ${esc(d.server)} · base ${esc(d.database)} · usuario ${esc(d.usuario)} · ${d.ms} ms<br>
          Acceso a ${esc(d.audiencias_db)}: <b>${d.acceso_audiencias_db ? "sí" : "no"}</b> · acceso a LINKNUEVOOK: <b>${d.acceso_linknuevook ? "sí" : "no"}</b>
          ${d.acceso_linknuevook ? "" : "<br>Sin acceso a LINKNUEVOOK la consulta de audiencias dará el error 916 (permisos)."}`, d.acceso_linknuevook ? "ok" : "warn");
      } else setStatus(`<b>No se pudo conectar</b>: ${esc(r.body.error || r.body.detail || "error " + r.status)}`, "bad");
    } catch (e) { setStatus(`<b>No se pudo conectar</b>: ${esc(e.message)}`, "bad"); }
    bTest.disabled = false;
  };
  bQuery.onclick = async () => {
    const desde = m.root.querySelector("#d-desde").value, hasta = m.root.querySelector("#d-hasta").value;
    if (!desde || !hasta || desde > hasta) return setStatus("Revisa las fechas: la fecha inicio debe ser anterior o igual a la fecha fin.", "bad");
    bQuery.disabled = true; setStatus(`Consultando audiencias del ${desde} al ${hasta}…`);
    try {
      const r = await api.audienciasEspana(desde, hasta);
      if (!r.ok || !r.body.ok) { setStatus(`<b>La consulta falló</b>: ${esc(r.body.error || r.body.detail || "error " + r.status)}`, "bad"); }
      else {
        const p = mapSqlAudiencias(r.body.rows || []);
        const n = mergeAudiencias(p.rows);
        if (n) logChange("audienciasSQL", `${desde} a ${hasta}: ${n} filas`);
        setStatus(`<b>${r.body.rows.length} emisiones recibidas</b> · ${n} filas de audiencia guardadas.`, n ? "ok" : "warn");
        report.innerHTML = reportHtml([{ tipo: "Audiencias España (BD)", archivo: `${desde} → ${hasta}`, detalle: uniq(p.rows.map(a => "J" + a.jornada)).join(", "), ins: n, issues: p.issues }]);
        persist(); rerender();
      }
    } catch (e) { setStatus(`<b>La consulta falló</b>: ${esc(e.message)}`, "bad"); }
    bQuery.disabled = false;
  };
}

/** Inserta audiencias reemplazando las que coinciden en ámbito, jornada, partido, canal y público. */
function mergeAudiencias(rows) {
  const key = a => [a.ambito || "ESPAÑA", a.jornada, a.partido, a.canal, a.publico].join("|");
  const ks = new Set(rows.map(key));
  S.audiencias = S.audiencias.filter(a => !ks.has(key(a)));
  rows.forEach(a => a.id = nextId());
  S.audiencias.push(...rows);
  return rows.length;
}

export async function processUploads(files, pais = "EUROPA") {
  const rep = [];
  const fail = (tipo, f, e) => rep.push({ tipo, archivo: f.name, detalle: "—", ins: 0, issues: ["No se pudo leer el archivo: " + e.message] });
  for (const f of files.newevents || []) {
    try {
      const p = parsePostplay(f.name, await readWorkbook(f));
      if (p.partido) {
        const j = p.records[0]?.jornada;
        S.records = S.records.filter(r => !(r.partido === p.partido && r.feed === p.feed && r.tipoEntrada !== "Estático" && r.jornada === j));
        S.goles = S.goles.filter(g => !(g.partido === p.partido && g.feed === p.feed));
        p.records.forEach(r => r.id = nextId());
        S.records.push(...p.records); S.goles.push(...p.goles);
        logChange("cargarPostplay", f.name);
      }
      rep.push({ tipo: "Postplay", archivo: f.name, detalle: p.partido ? `${p.partido} · ${p.feed}` : "—", ins: p.records.length, extra: p.goles.length ? `${p.goles.length} goles` : "", issues: p.issues });
    } catch (e) { fail("Postplay", f, e); }
  }
  for (const f of files.soportes || []) {
    try {
      const p = parseEstaticos(f.name, await readWorkbook(f));
      const js = uniq(p.records.map(r => r.jornada));
      S.records = S.records.filter(r => !(r.tipoEntrada === "Estático" && js.includes(r.jornada)));
      p.records.forEach(r => r.id = nextId());
      S.records.push(...p.records); logChange("cargarEstaticos", f.name);
      rep.push({ tipo: "Estáticos", archivo: f.name, detalle: js.length ? "Jornada " + js.join(", ") : "—", ins: p.records.length, issues: p.issues });
    } catch (e) { fail("Estáticos", f, e); }
  }
  const audiencias = async (list, ambito, tipo) => {
    for (const f of list || []) {
      try {
        const wb = await readWorkbook(f);
        const p = isKantarWorkbook(wb) ? parseKantar(f.name, wb, ambito) : parseAudiencias(f.name, wb);
        if (!isKantarWorkbook(wb)) p.rows.forEach(a => { a.ambito = ambito; a.origen = "Tabla Audiencias"; a.archivo = f.name; });
        const n = mergeAudiencias(p.rows);
        if (n) logChange("cargarAudiencias", `${ambito} · ${f.name}`);
        rep.push({ tipo, archivo: f.name, detalle: uniq(p.rows.map(a => "J" + a.jornada)).join(", "), ins: n, issues: p.issues });
      } catch (e) { fail(tipo, f, e); }
    }
  };
  await audiencias(files.kantarEs || files.kantar, "ESPAÑA", "Audiencias España");
  await audiencias(files.kantarInt, pais, `Audiencias ${pais}`);
  sortRecords();
  return rep;
}

function reportHtml(rep) {
  if (!rep.length) return `<div class="notice">Elige al menos un archivo.</div>`;
  const total = rep.reduce((a, r) => a + r.ins, 0), avisos = rep.reduce((a, r) => a + r.issues.length, 0);
  return `<div class="report"><div class="report-head"><b>${rep.length} ${rep.length === 1 ? "carga procesada" : "cargas procesadas"}</b><span>${total} registros insertados</span>${avisos ? `<span class="chip warn">${avisos} avisos</span>` : `<span class="chip ok">Sin avisos</span>`}</div>
    ${rep.map(r => `<div class="report-row"><span class="chip ${r.ins ? "ok" : "bad"}">${r.ins}</span><div><b>${esc(r.archivo)}</b><span>${esc(r.tipo)} · ${esc(r.detalle)} ${esc(r.extra || "")}</span>
      ${r.issues.length ? `<ul>${r.issues.slice(0, 8).map(i => `<li>${esc(i)}</li>`).join("")}${r.issues.length > 8 ? `<li>… y ${r.issues.length - 8} avisos más</li>` : ""}</ul>` : ""}</div></div>`).join("")}</div>`;
}
