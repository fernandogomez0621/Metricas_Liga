// Arranque y marco de la aplicación: menú lateral, barra superior, pestañas y navegación.
import { S, initStore, persist, resetDemo, resetEmpty, logAccess, storeMode } from "./store.js";
import { esc, nf0, toast } from "./util.js";
import { setRender, caps } from "./bus.js";
import { modal, armDelete } from "./modals.js";
import { uploadModal } from "./upload.js";
import { validarModal, insituModal } from "./jornadas.js";
import { TABS, tabCounts, renderInternal } from "./views/internal.js";
import { renderClient, viewAsOptions, resetClientFilters } from "./views/client.js";
import { renderArchivos } from "./views/archivos.js";
import { analitica } from "./calc.js";

const ui = { mode: "int", tab: "segundos", viewAs: "" };
const $ = s => document.querySelector(s);

function render() {
  document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-current", b.dataset.mode === ui.mode ? "page" : "false"));
  $("#int-actions").hidden = ui.mode === "cli";
  $("#cli-actions").hidden = ui.mode !== "cli";
  $("#page-title").textContent = { int: "Investigación publicitaria", files: "Manejo de archivos", cli: "Vista cliente" }[ui.mode];
  const tabs = $("#tablist");
  if (ui.mode === "files") {
    tabs.hidden = true;
    renderArchivos($("#main"));
  } else if (ui.mode === "int") {
    const n = tabCounts();
    tabs.hidden = false;
    tabs.innerHTML = TABS.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${ui.tab === k}" data-tab="${k}">${l}${n[k] != null ? `<span class="n">${nf0.format(n[k])}</span>` : ""}</button>`).join("");
    tabs.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; try { location.hash = ui.tab; } catch (e) { } render(); });
    renderInternal($("#main"), ui.tab);
  } else {
    tabs.hidden = true;
    $("#viewas").innerHTML = viewAsOptions(ui.viewAs);
    renderClient($("#main"), ui.viewAs);
  }
}
setRender(render);

function optionsModal() {
  const m = modal({ title: "Opciones del prototipo", body: `
    <p>${storeMode() === "server"
      ? "Los datos se guardan en el servidor y los comparte todo el equipo: lo que cambies aquí lo verán los demás al recargar."
      : "Sin servidor: los datos se guardan solo en este navegador. Otra persona empieza con los datos de ejemplo de la jornada 1."}</p>
    <div class="row-actions"><button class="btn" id="o-demo">Restablecer datos de ejemplo</button><button class="btn danger" id="o-empty">Vaciar todo</button></div>
    ${storeMode() === "server" ? `<p class="caption">«Restablecer» y «Vaciar» afectan a los datos de todo el equipo.</p>` : ""}
    <div class="formula"><b>Cómo se valora</b><span>AM % total = AM % hogar × factor del canal (3 decimales)</span><span>GRPs = AM % total × segundos ÷ 20</span>
      <span>Valoración = GRPs × coste GRP del canal × coeficiente de tamaño del soporte</span><span>Solo se valora el feed nacional. Si un partido se emite en dos canales, se valora en ambos.</span></div>` });
  m.root.querySelector("#o-demo").onclick = () => { resetDemo(); m.close(); render(); toast("Datos de ejemplo cargados"); };
  armDelete(m.root.querySelector("#o-empty"), () => { resetEmpty(); m.close(); render(); toast("Datos vaciados"); });
}

function wire() {
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    ui.mode = b.dataset.mode;
    try { location.hash = ui.mode === "files" ? "archivos" : ui.mode === "int" ? ui.tab : ""; } catch (e) { }
    if (ui.mode === "cli") { logAccess(ui.viewAs ? ui.viewAs.slice(3) : "Vista previa"); persist(); }
    render();
  });
  $("#viewas").onchange = e => { ui.viewAs = e.target.value; resetClientFilters(); logAccess(ui.viewAs ? ui.viewAs.slice(3) : "Vista previa"); persist(); render(); };
  $("#b-upload").onclick = uploadModal;
  $("#b-validar").onclick = validarModal;
  $("#b-insitu").onclick = insituModal;
  $("#b-options").onclick = optionsModal;
}

async function start() {
  wire();
  try { await initStore(); }
  catch (e) { $("#main").innerHTML = `<div class="notice">No se pudieron cargar los datos base (${esc(e.message)}). Recarga la página.</div>`; return; }
  try { const h = location.hash.slice(1); if (TABS.some(t => t[0] === h)) ui.tab = h; if (h === "archivos") ui.mode = "files"; } catch (e) { }
  render();
  try { caps.downloads = window.claude?.use ? await window.claude.use("downloads") : null; } catch (e) { caps.downloads = null; }
  if (caps.downloads) render();
}
start();

// Acceso para pruebas automáticas.
window.__metrica = { get state() { return S; }, analitica, render };
