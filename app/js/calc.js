// Motor de valoración. Verificado contra IKLAN: jornada 1 = 3.260.195,01 € (+16) y 3.053.518,60 € (+4).
//
//   AM % total  = redondeo(AM % hogar × F.Total del canal, 3)
//   Aud. total  = Aud. hogar × F.Total del canal
//   GRPs        = AM % total × segundos ÷ 20
//   Valoración  = GRPs × C.GRP nacional del canal × coeficiente de tamaño del soporte
//
// Solo se valora el feed NACIONAL (Kantar mide España). Si un partido se emite en dos
// canales, cada presencia se valora en ambos.
import { S } from "./store.js";
import { isNum, round3 } from "./util.js";
import { soporteOf, canalOf } from "./masters.js";

export const SPOT_SECONDS = 20;
export const PUBLICOS = [16, 4];

/** Segundos que se valoran según la configuración (Emitido TV o Emitido TM). */
export const secondsUsed = r =>
  (r.tipoEntrada === "Segundos" && S.config.emitido === "TM") ? r.emitidoTM : (isNum(r.emitidoTV) ? r.emitidoTV : r.emitidoTM);

function audienceIndex() {
  const ix = {};
  for (const a of S.audiencias) {
    const k = a.jornada + "|" + a.partido;
    ((ix[k] ||= {})[a.canal] ||= {})[a.publico] = a;
  }
  return ix;
}

/** Devuelve una fila por presencia y canal con audiencias, GRPs y valoración. */
export function analitica() {
  const ix = audienceIndex(), out = [];
  for (const r of S.records) {
    const sg = secondsUsed(r), sop = soporteOf(r.soporte), coef = sop ? sop.coef : null;
    const byCanal = r.feed === "NACIONAL" ? ix[r.jornada + "|" + r.partido] : null;
    const base = { ...r, sg, coef };
    if (!byCanal) { out.push(base); continue; }
    for (const [canal, pubs] of Object.entries(byCanal)) {
      const c = canalOf(canal), row = { ...base, canal };
      if (c && coef != null) {
        row.costeN = c.cgrpN; row.costeR = c.cgrpR; row.fTotal = c.fTotal;
        for (const p of PUBLICOS) {
          const a = pubs[p]; if (!a) continue;
          const amT = round3(a.amHogar * c.fTotal), grp = amT * sg / SPOT_SECONDS;
          Object.assign(row, {
            ["amH" + p]: a.amHogar, ["audH" + p]: a.audHogar, ["amT" + p]: amT, ["audT" + p]: a.audHogar * c.fTotal,
            ["grpH" + p]: a.amHogar * sg / SPOT_SECONDS, ["grp" + p]: grp, ["val" + p]: grp * c.cgrpN * coef, ["cuota" + p]: a.cuota,
          });
        }
      }
      out.push(row);
    }
  }
  return out;
}
