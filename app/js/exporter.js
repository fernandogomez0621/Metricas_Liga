// Exportación a Excel con SheetJS + capacidad "downloads" del visor.
import { caps } from "./bus.js";
import { toast } from "./util.js";

export const canExport = () => !!caps.downloads;

/** cols: [{l, k}] · rows: objetos · val(row, col) → valor */
export async function exportXlsx(name, cols, rows, val) {
  if (!caps.downloads) return;
  const XLSX = window.XLSX;
  const data = rows.map(r => Object.fromEntries(cols.map(c => [c.l, val(r, c) ?? ""])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Datos");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  try {
    await caps.downloads.save({ filename: `${name}_${stamp}.xlsx`, data: new Uint8Array(buf) });
    toast("Excel guardado");
  } catch (e) {
    if (e && e.code === "declined") return;
    toast(e && e.code === "rate_limited" ? "Ya hay una descarga pendiente de confirmar" : "No se pudo exportar en esta vista");
  }
}
