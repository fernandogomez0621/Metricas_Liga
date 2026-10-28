// Utilidades sin estado: normalización de texto, formatos numéricos y fechas.

export const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const clean = v => { if (typeof v === "string") { v = v.replace(/ /g, " ").trim(); return v || null } return v ?? null };
export const isNum = v => typeof v === "number" && isFinite(v);
export const round3 = x => Math.round((x + Number.EPSILON) * 1000) / 1000;
export const uniq = a => [...new Set(a)];
export const byNum = (a, b) => (a ?? -1e18) - (b ?? -1e18);
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
export const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nf3 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const eur = v => isNum(v) ? nf2.format(v) + " €" : "";
export const int = v => isNum(v) ? nf0.format(v) : (v ?? "");
export const dec2 = v => isNum(v) ? nf2.format(v) : "";
export const dec3 = v => isNum(v) ? nf3.format(v) : "";

/** Segundos → "1h 02m 05s" */
export function mmss(s) {
  if (!isNum(s)) return "";
  const neg = s < 0; s = Math.abs(Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (neg ? "−" : "") + (h ? h + "h " : "") + String(m).padStart(2, "0") + "m " + String(x).padStart(2, "0") + "s";
}

export function now() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return { dia: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
}

export function sortedValues(a) {
  return uniq(a.filter(v => v != null && v !== "")).sort((x, y) => isNum(x) && isNum(y) ? x - y : String(x).localeCompare(String(y), "es", { numeric: true }));
}

export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
