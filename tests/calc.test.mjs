// Prueba del motor de cálculo contra los totales de IKLAN (jornada 1).
// Uso: node tests/calc.test.mjs   (o: npm test)
import { readFileSync } from "node:fs";
import { S } from "../app/js/store.js";
import { analitica } from "../app/js/calc.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const masters = read("../app/data/masters.json");
const demo = read("../app/data/demo.json");

Object.assign(S, { config: { emitido: "TV" }, validadas: { NACIONAL: [], INTERNACIONAL: [] }, ...demo, masters });

const EXPECTED = {
  total16: 3260195.01, total4: 3053518.60, filasValoradas: 440,
  porPartido16: { "ALA - GET": 421116.69, "ATM - MCF": 708394.43, "CEL - OSA": 171731.78, "ESP - LEV": 304540.75,
    "RAC - VIL": 369522.54, "SEV - RAY": 332618.66, "VAL - BET": 952270.15 },
};

const A = analitica().filter(r => r.jornada === 1);
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const round2 = x => Math.round(x * 100) / 100;
let fails = 0;
const check = (name, got, want) => {
  const ok = Math.abs(got - want) < 0.01;
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};

check("Valoración +16 jornada 1", round2(sum(A, "val16")), EXPECTED.total16);
check("Valoración +4 jornada 1", round2(sum(A, "val4")), EXPECTED.total4);
check("Filas valoradas", A.filter(r => r.val16 != null).length, EXPECTED.filasValoradas);
for (const [p, v] of Object.entries(EXPECTED.porPartido16)) check(`+16 ${p}`, round2(sum(A.filter(r => r.partido === p), "val16")), v);

// Ejemplo documentado en docs/formulas.tex: HAIER, ALA-GET, 55 s, DAZN LaLiga, UTV
const haier = A.find(r => r.anunciante === "HAIER" && r.partido === "ALA - GET" && r.tipoEntrada === "Segundos");
check("Ejemplo HAIER (€ +16)", round2(haier.val16), 2005.48);

console.log(fails ? `\n${fails} comprobaciones fallidas` : "\nTodo correcto");
process.exit(fails ? 1 : 0);
