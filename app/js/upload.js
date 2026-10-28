// Ventana "Subir Excel": recoge archivos, los pasa por los lectores y actualiza el estado.
// Subir un archivo de nuevo reemplaza los datos anteriores de ese partido y feed.
import { S, persist, nextId, logChange, sortRecords } from "./store.js";
import { esc, uniq } from "./util.js";
import { rerender } from "./bus.js";
import { modal } from "./modals.js";
import { readWorkbook, parsePostplay, parseEstaticos, parseAudiencias } from "./parsers.js";

const KINDS = [
  ["newevents", "Postplays", "Segundos por partido y feed, nacional e internacional. Puedes elegir varios a la vez."],
  ["soportes", "Estáticos", "Excel de estáticos de la jornada (publimetas, corngol, valla central…)."],
  ["kantar", "Audiencias Kantar", "Audiencias por partido, canal y público."],
];

export function uploadModal() {
  const files = { newevents: [], soportes: [], kantar: [] };
  const m = modal({
    title: "Subir Excel", wide: true,
    subtitle: "Los datos quedan como borrador: los clientes no los ven hasta que validas la jornada.",
    body: `<div class="drops">${KINDS.map(([k, t, d]) => `
      <label class="drop" data-k="${k}" for="f-${k}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0l-5 5m5-5l5 5M4 20h16"/></svg>
        <b>${t}</b><span>${d}</span>
        <input type="file" id="f-${k}" accept=".xlsx,.xls" multiple>
        <span class="files" id="fl-${k}">Arrastra aquí o pulsa para elegir</span>
      </label>`).join("")}</div><div id="up-report" aria-live="polite"></div>`,
    footer: `<span class="sp"></span><button class="btn" data-close>Cerrar</button><button class="btn primary" id="up-go">Procesar archivos</button>`,
  });
  for (const [k] of KINDS) {
    const inp = m.root.querySelector("#f-" + k), box = m.root.querySelector(`.drop[data-k="${k}"]`), list = m.root.querySelector("#fl-" + k);
    const show = () => { list.textContent = files[k].length ? files[k].map(f => f.name).join(" · ") : "Arrastra aquí o pulsa para elegir"; box.classList.toggle("has", files[k].length > 0); };
    inp.onchange = () => { files[k] = [...inp.files]; show(); };
    box.ondragover = e => { e.preventDefault(); box.classList.add("over"); };
    box.ondragleave = () => box.classList.remove("over");
    box.ondrop = e => { e.preventDefault(); box.classList.remove("over"); files[k] = [...e.dataTransfer.files].filter(f => /\.xlsx?$/i.test(f.name)); show(); };
  }
  const go = m.root.querySelector("#up-go");
  go.onclick = async () => {
    go.disabled = true; go.textContent = "Procesando…";
    const rep = await processUploads(files);
    m.root.querySelector("#up-report").innerHTML = reportHtml(rep);
    go.disabled = false; go.textContent = "Procesar archivos";
    persist(); rerender();
  };
}

export async function processUploads(files) {
  const rep = [];
  const fail = (tipo, f, e) => rep.push({ tipo, archivo: f.name, detalle: "—", ins: 0, issues: ["No se pudo leer el archivo: " + e.message] });
  for (const f of files.newevents) {
    try {
      const p = parsePostplay(f.name, await readWorkbook(f));
      if (p.partido) {
        const j = p.records[0]?.jornada;
        S.records = S.records.filter(r => !(r.partido === p.partido && r.feed === p.feed && r.tipoEntrada !== "Estático" && r.jornada === j));
        S.goles = S.goles.filter(g => !(g.partido === p.partido && g.feed === p.feed));
        p.records.forEach(r => r.id = nextId());
        S.records.push(...p.records); S.goles.push(...p.goles);
        logChange("uploadFiles", f.name);
      }
      rep.push({ tipo: "Postplay", archivo: f.name, detalle: p.partido ? `${p.partido} · ${p.feed}` : "—", ins: p.records.length, extra: p.goles.length ? `${p.goles.length} goles` : "", issues: p.issues });
    } catch (e) { fail("Postplay", f, e); }
  }
  for (const f of files.soportes) {
    try {
      const p = parseEstaticos(f.name, await readWorkbook(f));
      const js = uniq(p.records.map(r => r.jornada));
      S.records = S.records.filter(r => !(r.tipoEntrada === "Estático" && js.includes(r.jornada)));
      p.records.forEach(r => r.id = nextId());
      S.records.push(...p.records); logChange("uploadFiles", f.name);
      rep.push({ tipo: "Estáticos", archivo: f.name, detalle: js.length ? "Jornada " + js.join(", ") : "—", ins: p.records.length, issues: p.issues });
    } catch (e) { fail("Estáticos", f, e); }
  }
  for (const f of files.kantar) {
    try {
      const p = parseAudiencias(f.name, await readWorkbook(f));
      const key = a => [a.jornada, a.partido, a.canal, a.publico].join("|"), ks = new Set(p.rows.map(key));
      S.audiencias = S.audiencias.filter(a => !ks.has(key(a)));
      p.rows.forEach(a => a.id = nextId());
      S.audiencias.push(...p.rows); logChange("uploadFiles", f.name);
      rep.push({ tipo: "Audiencias", archivo: f.name, detalle: uniq(p.rows.map(a => "J" + a.jornada)).join(", "), ins: p.rows.length, issues: p.issues });
    } catch (e) { fail("Audiencias", f, e); }
  }
  sortRecords();
  return rep;
}

function reportHtml(rep) {
  if (!rep.length) return `<div class="notice">Elige al menos un archivo.</div>`;
  const total = rep.reduce((a, r) => a + r.ins, 0), avisos = rep.reduce((a, r) => a + r.issues.length, 0);
  return `<div class="report"><div class="report-head"><b>${rep.length} archivos procesados</b><span>${total} registros insertados</span>${avisos ? `<span class="chip warn">${avisos} avisos</span>` : `<span class="chip ok">Sin avisos</span>`}</div>
    ${rep.map(r => `<div class="report-row"><span class="chip ${r.ins ? "ok" : "bad"}">${r.ins}</span><div><b>${esc(r.archivo)}</b><span>${esc(r.tipo)} · ${esc(r.detalle)} ${esc(r.extra || "")}</span>
      ${r.issues.length ? `<ul>${r.issues.slice(0, 8).map(i => `<li>${esc(i)}</li>`).join("")}${r.issues.length > 8 ? `<li>… y ${r.issues.length - 8} avisos más</li>` : ""}</ul>` : ""}</div></div>`).join("")}</div>`;
}
