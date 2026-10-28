// Tabla reutilizable: búsqueda, filtro por columna, orden, columnas visibles, paginación,
// totales, clic en fila y exportación a Excel.
import { esc, isNum, byNum, uniq, nf0, int } from "./util.js";
import { canExport, exportXlsx } from "./exporter.js";

const state = {};
const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

/**
 * cfg = { id, rows(), cols:[{k,l,num,sum,hide,nofilter,fmt(v,r),html(v,r),v(r)}],
 *         onRow(row), add(), totals, file, empty }
 */
export function table(el, cfg) {
  const st = state[cfg.id] ||= { q: "", f: {}, sort: null, page: 0, size: 25, hidden: new Set(cfg.cols.filter(c => c.hide).map(c => c.k)), open: false };
  const cols = cfg.cols.filter(c => !st.hidden.has(c.k));
  const all = cfg.rows();
  const val = (r, c) => c.v ? c.v(r) : r[c.k];
  const txt = (r, c) => { const v = val(r, c); return c.fmt ? c.fmt(v, r) : (v ?? ""); };

  let rows = all.filter(r => {
    for (const [k, v] of Object.entries(st.f)) { if (v === "") continue; const c = cfg.cols.find(x => x.k === k); if (String(val(r, c) ?? "") !== v) return false; }
    if (!st.q) return true;
    const q = st.q.toLowerCase();
    return cfg.cols.some(c => String(txt(r, c)).toLowerCase().includes(q));
  });
  if (st.sort) {
    const c = cfg.cols.find(x => x.k === st.sort.k), d = st.sort.d;
    rows = [...rows].sort((a, b) => { const x = val(a, c), y = val(b, c); return isNum(x) || isNum(y) ? d * byNum(x, y) : d * String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true }); });
  }
  const size = st.size === "all" ? (rows.length || 1) : st.size;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  st.page = Math.min(st.page, pages - 1);
  const view = rows.slice(st.page * size, st.page * size + size);
  const distinct = c => uniq(all.map(r => val(r, c)).filter(v => v != null && v !== "").map(String)).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const sums = cfg.totals ? Object.fromEntries(cols.filter(c => c.sum).map(c => [c.k, rows.reduce((a, r) => a + (isNum(val(r, c)) ? val(r, c) : 0), 0)])) : null;
  const activeFilters = Object.values(st.f).filter(v => v).length;

  el.innerHTML = `
  <div class="tbar">
    <div class="search">${icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3")}<input type="search" id="q-${cfg.id}" placeholder="Buscar" value="${esc(st.q)}" aria-label="Buscar"></div>
    ${activeFilters ? `<button class="btn subtle" data-act="clear">Quitar ${activeFilters} filtro${activeFilters > 1 ? "s" : ""}</button>` : ""}
    <span class="grow"></span>
    <div class="colpick"><button class="btn" data-act="cols" aria-expanded="${st.open}">${icon("M4 6h16M4 12h16M4 18h16")}Columnas</button>
      ${st.open ? `<div class="colpick-panel">${cfg.cols.map(c => `<label><input type="checkbox" data-col="${c.k}" ${st.hidden.has(c.k) ? "" : "checked"}>${esc(c.l)}</label>`).join("")}</div>` : ""}</div>
    ${cfg.add ? `<button class="btn" data-act="add">${icon("M12 5v14M5 12h14")}Añadir</button>` : ""}
    ${canExport() ? `<button class="btn" data-act="xlsx">${icon("M12 4v12m0 0l-5-5m5 5l5-5M4 20h16")}Exportar Excel</button>` : ""}
  </div>
  <div class="tscroll"><table class="grid">
    <thead><tr>${cols.map(c => `<th class="${c.num ? "num" : ""}" data-sort="${c.k}" aria-sort="${st.sort && st.sort.k === c.k ? (st.sort.d > 0 ? "ascending" : "descending") : "none"}">${esc(c.l)}<span class="s">${st.sort && st.sort.k === c.k ? (st.sort.d > 0 ? "↑" : "↓") : ""}</span></th>`).join("")}</tr>
    <tr class="filters">${cols.map(c => {
      if (c.nofilter) return "<th></th>";
      const d = distinct(c); if (d.length > 300) return "<th></th>";
      return `<th><select data-f="${c.k}" aria-label="Filtrar ${esc(c.l)}" class="${st.f[c.k] ? "on" : ""}"><option value="">Todos</option>${d.map(v => `<option ${st.f[c.k] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></th>`;
    }).join("")}</tr></thead>
    <tbody>${view.length ? view.map((r, i) => `<tr class="${cfg.onRow ? "click" : ""}" data-i="${st.page * size + i}">${cols.map(c => `<td class="${c.num ? "num" : ""}">${c.html ? c.html(val(r, c), r) : esc(txt(r, c))}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${cols.length}">${esc(cfg.empty || "Sin registros. Sube los Excel de la jornada con «Subir Excel».")}</td></tr>`}</tbody>
    ${sums && rows.length ? `<tfoot><tr>${cols.map((c, i) => `<td class="${c.num ? "num" : ""}">${i === 0 ? "Total" : (c.sum ? esc(c.fmt ? c.fmt(sums[c.k]) : int(sums[c.k])) : "")}</td>`).join("")}</tr></tfoot>` : ""}
  </table></div>
  <div class="tfoot">
    <label for="sz-${cfg.id}" class="pagesize">Filas por página <select id="sz-${cfg.id}">${[16, 25, 50, 100, "all"].map(n => `<option value="${n}" ${String(st.size) === String(n) ? "selected" : ""}>${n === "all" ? "Todas" : n}</option>`).join("")}</select></label>
    <span>${rows.length ? st.page * size + 1 : 0}–${Math.min(rows.length, st.page * size + size)} de ${nf0.format(rows.length)}${rows.length !== all.length ? ` · filtrado de ${nf0.format(all.length)}` : ""}</span>
    <div class="pager">${pager(st.page, pages)}</div>
  </div>`;

  const again = () => table(el, cfg);
  el.querySelector(`#sz-${cfg.id}`).onchange = e => { st.size = e.target.value === "all" ? "all" : +e.target.value; st.page = 0; again(); };
  const q = el.querySelector(`#q-${cfg.id}`);
  q.oninput = e => { st.q = e.target.value; st.page = 0; clearTimeout(q._t); q._t = setTimeout(() => { again(); const n = el.querySelector(`#q-${cfg.id}`); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); };
  el.querySelectorAll("[data-f]").forEach(s => s.onchange = e => { st.f[s.dataset.f] = e.target.value; st.page = 0; again(); });
  el.querySelectorAll("th[data-sort]").forEach(th => th.onclick = () => { const k = th.dataset.sort; st.sort = st.sort && st.sort.k === k ? (st.sort.d > 0 ? { k, d: -1 } : null) : { k, d: 1 }; again(); });
  el.querySelectorAll(".pager button[data-p]").forEach(b => b.onclick = () => { st.page = +b.dataset.p; again(); });
  el.querySelector('[data-act="cols"]').onclick = () => { st.open = !st.open; again(); };
  el.querySelectorAll("[data-col]").forEach(c => c.onchange = () => { c.checked ? st.hidden.delete(c.dataset.col) : st.hidden.add(c.dataset.col); again(); });
  el.querySelector('[data-act="clear"]')?.addEventListener("click", () => { st.f = {}; again(); });
  el.querySelector('[data-act="add"]')?.addEventListener("click", () => cfg.add());
  el.querySelector('[data-act="xlsx"]')?.addEventListener("click", () => exportXlsx(cfg.file || cfg.id, cols, rows, val));
  if (cfg.onRow) el.querySelectorAll("tbody tr[data-i]").forEach(tr => {
    const go = e => { e.preventDefault(); cfg.onRow(rows[+tr.dataset.i]); };
    tr.onclick = go; tr.oncontextmenu = go;
  });
}

function pager(p, n) {
  if (n <= 1) return "";
  const set = uniq([0, p - 1, p, p + 1, n - 1].filter(i => i >= 0 && i < n)).sort((a, b) => a - b);
  let h = `<button data-p="${Math.max(0, p - 1)}" ${p === 0 ? "disabled" : ""} aria-label="Página anterior">‹</button>`, last = -1;
  for (const i of set) { if (i - last > 1) h += `<span class="gap">…</span>`; h += `<button data-p="${i}" ${i === p ? 'aria-current="true"' : ""}>${i + 1}</button>`; last = i; }
  return h + `<button data-p="${Math.min(n - 1, p + 1)}" ${p === n - 1 ? "disabled" : ""} aria-label="Página siguiente">›</button>`;
}
