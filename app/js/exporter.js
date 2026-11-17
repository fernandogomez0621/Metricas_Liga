// Exportación a Excel con SheetJS.
// - En un navegador normal (servidor propio): descarga directa con XLSX.writeFile.
// - Dentro del visor de artefactos de Claude: usa la capacidad "downloads" del visor.
import { caps } from "./bus.js";
import { toast } from "./util.js";

const insideArtifactViewer = () => !!window.claude?.use;
export const canExport = () => !!window.XLSX;

/** cols: [{l, k}] · rows: objetos · val(row, col) → valor */
export async function exportXlsx(name, cols, rows, val) {
  const XLSX = window.XLSX;
  if (!XLSX) return toast("No se pudo cargar el generador de Excel");
  if (!rows.length) return toast("No hay filas para descargar con estos filtros");
  const data = rows.map(r => Object.fromEntries(cols.map(c => [c.l, val(r, c) ?? ""])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Datos");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${name}_${stamp}.xlsx`;

  if (!insideArtifactViewer()) {
    XLSX.writeFile(wb, filename);
    return toast(`Descargado ${filename} (${rows.length} filas)`);
  }
  if (!caps.downloads) return toast("La descarga no está disponible en esta vista");
  try {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    await caps.downloads.save({ filename, data: new Uint8Array(buf) });
    toast("Excel guardado");
  } catch (e) {
    if (e && e.code === "declined") return;
    toast(e && e.code === "rate_limited" ? "Ya hay una descarga pendiente de confirmar" : "No se pudo exportar en esta vista");
  }
}
