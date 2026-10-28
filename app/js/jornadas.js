// Validación de jornadas (qué ven los clientes) y asistencia in situ.
import { S, persist, logChange } from "./store.js";
import { esc, byNum, uniq, toast } from "./util.js";
import { rerender } from "./bus.js";
import { modal } from "./modals.js";
import { feedGroup } from "./masters.js";

const COPA = ["DIECISEISAVOS - IDA", "DIECISEISAVOS - VUELTA", "OCTAVOS - IDA", "OCTAVOS - VUELTA", "CUARTOS - IDA", "CUARTOS - VUELTA", "SEMIFINALES - IDA", "SEMIFINALES - VUELTA", "FINAL"];

export function validarModal() {
  let grp = "NACIONAL";
  const draw = () => {
    const v = new Set(S.validadas[grp]);
    const loaded = new Set(S.records.filter(r => feedGroup(r.feed) === grp).map(r => r.jornada));
    return `<div class="seg-control" role="group" aria-label="Feed">
        <button data-g="NACIONAL" aria-pressed="${grp === "NACIONAL"}">Nacional</button><button data-g="INTERNACIONAL" aria-pressed="${grp === "INTERNACIONAL"}">Internacional</button></div>
      <div class="section-label">Jornadas de liga <span>Marcadas: visibles para clientes · con punto: tienen datos</span></div>
      <div class="checks">${Array.from({ length: 38 }, (_, i) => i + 1).map(j => `<label class="${v.has(j) ? "on" : ""}"><input type="checkbox" data-j="${j}" ${v.has(j) ? "checked" : ""}>${j}${loaded.has(j) ? '<i class="dot" title="Con datos"></i>' : ""}</label>`).join("")}</div>
      <div class="section-label">Fases de copa</div>
      <div class="checks copa">${COPA.map(c => `<label class="${v.has(c) ? "on" : ""}"><input type="checkbox" data-j="${esc(c)}" ${v.has(c) ? "checked" : ""}>${c}</label>`).join("")}</div>`;
  };
  const m = modal({ title: "Validar jornada", subtitle: "Mientras una jornada no esté validada, los clientes no ven sus datos.", body: `<div id="vb">${draw()}</div>` });
  const wire = () => {
    const vb = m.root.querySelector("#vb");
    vb.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { grp = b.dataset.g; vb.innerHTML = draw(); wire(); });
    vb.querySelectorAll("[data-j]").forEach(c => c.onchange = () => {
      const j = isNaN(+c.dataset.j) ? c.dataset.j : +c.dataset.j, set = new Set(S.validadas[grp]);
      c.checked ? set.add(j) : set.delete(j);
      S.validadas[grp] = [...set]; c.parentElement.classList.toggle("on", c.checked);
      logChange("validarJornada", `${grp} · ${j} · ${c.checked ? "validada" : "retirada"}`);
      persist(); rerender();
      toast(c.checked ? `Jornada ${j} publicada para clientes` : `Jornada ${j} retirada`);
    });
  };
  wire();
}

export function insituModal() {
  const js = uniq(S.masters.partidos.map(p => p.jornada)).sort(byNum);
  let j = uniq(S.records.map(r => r.jornada)).sort(byNum)[0] || 1;
  const draw = () => {
    const ps = S.masters.partidos.filter(p => p.jornada === j);
    return `<div class="field" style="max-width:180px"><label for="isj">Jornada</label><select id="isj">${js.map(x => `<option ${x === j ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    <div class="tscroll"><table class="grid"><thead><tr><th>Local</th><th>Visitante</th><th class="num">Asistencia LED</th><th class="num">Asistencia estáticos</th></tr></thead><tbody>
    ${ps.map(p => { const v = S.insitu[j + "|" + p.partido] || {}; return `<tr><td>${esc(p.local)}</td><td>${esc(p.visitante)}</td>
      <td class="num"><input class="num-input" aria-label="LED ${esc(p.partido)}" type="number" min="0" data-p="${esc(p.partido)}" data-t="led" value="${v.led ?? ""}"></td>
      <td class="num"><input class="num-input" aria-label="Estáticos ${esc(p.partido)}" type="number" min="0" data-p="${esc(p.partido)}" data-t="est" value="${v.est ?? ""}"></td></tr>`; }).join("")}
    </tbody></table></div>`;
  };
  const m = modal({ title: "Asistencia in situ", subtitle: "Las asistencias están en la web oficial de LaLiga, dentro de cada partido.", body: `<div id="isb">${draw()}</div>`,
    footer: `<span class="sp"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="is-ok">Guardar y finalizar</button>` });
  const wire = () => { m.root.querySelector("#isj").onchange = e => { j = +e.target.value; m.root.querySelector("#isb").innerHTML = draw(); wire(); }; };
  wire();
  m.root.querySelector("#is-ok").onclick = () => {
    m.root.querySelectorAll("[data-p]").forEach(i => { (S.insitu[j + "|" + i.dataset.p] ||= {})[i.dataset.t] = i.value === "" ? null : +i.value; });
    logChange("insitu", "Jornada " + j); persist(); m.close(); rerender(); toast("Asistencias guardadas");
  };
}
