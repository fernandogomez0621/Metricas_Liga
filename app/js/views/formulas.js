// Pestaña "Fórmulas": metodología de cálculo escrita en LaTeX y renderizada con KaTeX (salida MathML).
// El mismo contenido está en docs/formulas.tex.
import { S } from "../store.js";
import { esc, nf2, nf3, toast } from "../util.js";
import { analitica, SPOT_SECONDS } from "../calc.js";

const tex = (src, display = true) => {
  try { return window.katex.renderToString(src, { displayMode: display, output: "mathml", throwOnError: false }); }
  catch (e) { return `<code>${esc(src)}</code>`; }
};

const VARS = [
  ["s", "Segundos de la presencia. Vallas: <b>Emitido TV</b> (<i>Output Seconds LIVE</i>) o <b>Emitido TM</b> (<i>Broad TM Time</i>), según la configuración. Momentums: duración. Estáticos: <i>Tiempo en segundos</i>."],
  ["AM_h", "AM % hogar de Kantar para el partido, el canal y el público (+16 o +4)."],
  ["A_h", "Audiencia hogar de Kantar."],
  ["F", "Factor total del canal (tabla Canales, <i>F. Total</i>): 3,2 en pago y 1,22 en abierto."],
  ["C", "Coste de un GRP en el canal (tabla Canales, <i>C. GRP Nacional</i>)."],
  ["k", "Coeficiente de tamaño del soporte (tabla Soportes). Valla UTV = 0,25."],
];

const STEPS = [
  ["AM % total", String.raw`AM_t = \operatorname{redondeo}\!\left(AM_h \cdot F,\ 3\right)`],
  ["Audiencia total", String.raw`A_t = A_h \cdot F`],
  ["GRPs", String.raw`GRP = AM_t \cdot \dfrac{s}{${SPOT_SECONDS}}`],
  ["Valoración económica (€)", String.raw`V = GRP \cdot C \cdot k`],
  ["Fórmula completa", String.raw`V = \operatorname{redondeo}\!\left(AM_h \cdot F,\ 3\right) \cdot \dfrac{s}{${SPOT_SECONDS}} \cdot C \cdot k`],
];

export const LATEX_SOURCE = String.raw`% Métrica Liga · cálculo de la valoración de presencias
\begin{align}
AM_t &= \operatorname{redondeo}\left(AM_h \cdot F,\ 3\right) \\
A_t  &= A_h \cdot F \\
GRP  &= AM_t \cdot \frac{s}{${SPOT_SECONDS}} \\
V    &= GRP \cdot C \cdot k
\end{align}
% s: segundos (Emitido TV por defecto) · AM_h, A_h: Kantar (hogar)
% F: factor del canal · C: coste GRP nacional · k: coeficiente del soporte
% Solo feed NACIONAL; si un partido se emite en dos canales, se valora en ambos.`;

function example() {
  const A = analitica().filter(r => r.val16 != null);
  const r = A.find(x => x.anunciante === "HAIER" && x.partido === "ALA - GET" && x.tipoEntrada === "Segundos") || A[0];
  if (!r) return `<p class="caption">Sube postplays y audiencias para ver un ejemplo con datos reales.</p>`;
  // números en formato español dentro de LaTeX: la coma decimal va entre llaves para que no añada espacio
  const t = s => String(s).replace(/,/g, "{,}");
  const n3 = v => t(nf3.format(v)), n2 = v => t(nf2.format(v)), raw = v => t(String(v).replace(".", ","));
  const n4 = v => t(new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 }).format(v));
  const cost = t(new Intl.NumberFormat("es-ES").format(r.costeN));
  return `<p class="caption">${esc(r.anunciante)} · ${esc(r.partido)} · jornada ${r.jornada} · feed ${esc(r.feed)} · ${esc(r.soporte)} · ${esc(r.canal)} · público +16 · Emitido ${S.config.emitido}</p>
    ${tex(String.raw`s = ${r.sg},\quad AM_h = ${n3(r.amH16)},\quad F = ${raw(r.fTotal)},\quad C = ${cost},\quad k = ${raw(r.coef)}`)}
    ${tex(String.raw`\begin{aligned}AM_t &= \operatorname{redondeo}(${n3(r.amH16)} \cdot ${raw(r.fTotal)},\ 3) = ${n3(r.amT16)} \\
      GRP &= ${n3(r.amT16)} \cdot \tfrac{${r.sg}}{${SPOT_SECONDS}} = ${n4(r.grp16)} \\
      V &= ${n4(r.grp16)} \cdot ${cost} \cdot ${raw(r.coef)} = ${n2(r.val16)}\ \text{€}\end{aligned}`)}`;
}

export function renderFormulas(main) {
  main.innerHTML = `
  <div class="pagehead"><div><h2>Fórmulas</h2><p>Cómo se calcula la valoración. Verificado contra la exportación de IKLAN de la jornada 1: 3.260.195,01 € (+16) y 3.053.518,60 € (+4).</p></div></div>
  <div class="formula-grid">
    <section class="card">
      <header class="card-h"><span class="tag blue">Cálculo</span><h3>Paso a paso</h3></header>
      <div class="math-list">${STEPS.map(([l, t], i) => `<div class="math-row ${i === STEPS.length - 1 ? "total" : ""}"><span>${i < STEPS.length - 1 ? i + 1 : "="}</span><b>${l}</b><div class="math">${tex(t)}</div></div>`).join("")}</div>
    </section>
    <section class="card">
      <header class="card-h"><span class="tag green">Variables</span><h3>De dónde sale cada dato</h3></header>
      <dl class="vars">${VARS.map(([v, d]) => `<dt>${tex(v, false)}</dt><dd>${d}</dd>`).join("")}</dl>
    </section>
    <section class="card">
      <header class="card-h"><span class="tag amber">Reglas</span><h3>Qué se valora</h3></header>
      <ul class="rules">
        <li>Solo se valora el <b>feed nacional</b>: Kantar mide audiencias en España. Los feeds internacionales registran segundos sin valoración.</li>
        <li>Se calcula para dos públicos: <b>+16</b> y <b>+4</b>.</li>
        <li>Si un partido se emite en <b>dos canales</b>, cada presencia se valora en ambos y se suma.</li>
        <li>El divisor ${SPOT_SECONDS} convierte segundos en anuncios estándar de ${SPOT_SECONDS} segundos.</li>
        <li>Las vallas se valoran hoy con <b>Emitido ${S.config.emitido}</b>. Se cambia en Analítica.</li>
      </ul>
    </section>
    <section class="card">
      <header class="card-h"><span class="tag coral">Ejemplo</span><h3>Con los datos cargados</h3></header>
      <div class="example">${example()}</div>
    </section>
    <section class="card span-all">
      <header class="card-h"><span class="tag violet">LaTeX</span><h3>Código fuente</h3><button class="btn subtle" id="copy-tex">Copiar LaTeX</button></header>
      <pre class="tex-src" id="tex-src">${esc(LATEX_SOURCE)}</pre>
    </section>
  </div>`;
  main.querySelector("#copy-tex").onclick = async () => {
    try { await navigator.clipboard.writeText(LATEX_SOURCE); toast("LaTeX copiado"); }
    catch (e) { const r = document.createRange(); r.selectNodeContents(main.querySelector("#tex-src")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selecciona y copia con Ctrl+C"); }
  };
}
