// Ventanas modales y formulario genérico de alta / edición / borrado.
import { esc, toast } from "./util.js";
import { persist } from "./store.js";
import { rerender } from "./bus.js";

export function modal({ title, subtitle, body, footer, wide }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="scrim" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal ${wide ? "wide" : ""}">
      <header><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
        <button class="icon-btn" data-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
      <div class="body">${body}</div>
      <footer>${footer || `<span class="sp"></span><button class="btn" data-close>Cerrar</button>`}</footer>
    </div></div>`;
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
  root.querySelector(".scrim").onclick = e => { if (e.target.classList.contains("scrim")) close(); };
  root.querySelector("[data-close]").focus();
  return { root: root.querySelector(".modal"), close };
}

/** Botón de borrado en dos pasos (el visor no permite confirm()). */
export function armDelete(btn, fn) {
  const label = btn.textContent;
  btn.onclick = () => {
    if (btn.classList.contains("armed")) return fn();
    btn.classList.add("armed"); btn.textContent = "Pulsa otra vez para confirmar";
    setTimeout(() => { btn.classList.remove("armed"); btn.textContent = label; }, 3500);
  };
}

/** fields: [{k, l, type: text|number|select|textarea, opts, wide}] */
export function formModal(title, fields, obj, onSave, onDelete) {
  const html = fields.map(x => {
    const id = "fm-" + x.k, v = obj[x.k] ?? "";
    const ctrl = x.type === "select"
      ? `<select id="${id}">${(x.opts || []).map(o => `<option ${String(o) === String(v) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : x.type === "textarea" ? `<textarea id="${id}" rows="3">${esc(v)}</textarea>`
      : `<input id="${id}" type="${x.type === "number" ? "number" : "text"}" ${x.type === "number" ? 'step="any" inputmode="decimal"' : ""} value="${esc(v)}">`;
    return `<div class="field ${x.wide ? "wide" : ""}"><label for="${id}">${esc(x.l)}</label>${ctrl}</div>`;
  }).join("");
  const m = modal({ title, body: `<form class="form" id="fm">${html}</form>`,
    footer: `${onDelete ? '<button class="btn danger" id="fm-del" type="button">Eliminar</button>' : ""}<span class="sp"></span>
      <button class="btn" data-close type="button">Cancelar</button><button class="btn primary" id="fm-ok" type="button">Guardar y finalizar</button>` });
  const read = () => {
    const o = { ...obj };
    for (const x of fields) {
      let v = m.root.querySelector("#fm-" + x.k).value;
      o[x.k] = v === "" ? null : (x.type === "number" ? +v : v);
    }
    return o;
  };
  m.root.querySelector("#fm").onsubmit = e => e.preventDefault();
  m.root.querySelector("#fm-ok").onclick = () => { onSave(read()); m.close(); persist(); rerender(); toast("Cambios guardados"); };
  if (onDelete) armDelete(m.root.querySelector("#fm-del"), () => { onDelete(); m.close(); persist(); rerender(); toast("Registro eliminado"); });
}
