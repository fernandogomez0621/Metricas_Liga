"""Métrica Liga · API

- GET  /api/health              → el servidor responde
- GET  /api/db/test             → prueba la conexión a SQL Server (credenciales en .env)
- POST /api/audiencias/espana   → audiencias Kantar España entre dos fechas (consulta de Daniel)
- GET  /api/state               → datos de la app (compartidos por todo el equipo)
- PUT  /api/state               → guarda los datos (control de versión para no pisar cambios)
"""
import datetime as dt
import decimal
import json
import os
import sqlite3
import threading
import time

import pymssql
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

DB = {
    "server": os.getenv("MSSQL_SERVER", ""),
    "port": int(os.getenv("MSSQL_PORT", "1433")),
    "user": os.getenv("MSSQL_USER", ""),
    "password": os.getenv("MSSQL_PASSWORD", ""),
    "database": os.getenv("MSSQL_DATABASE", "IAGECA"),
}
AUDIENCIAS_DB = os.getenv("AUDIENCIAS_DB", "GECAIKLAN")   # base donde están las vistas EMISW, EMISWT y CADENA_NEW
DATA_DIR = os.getenv("DATA_DIR", "/data")
STATE_DB = os.path.join(DATA_DIR, "metrica.db")

app = FastAPI(title="Métrica Liga API")
_lock = threading.Lock()


# ------------------------------------------------------------------ SQL Server
def connect():
    if not DB["server"] or not DB["user"]:
        raise RuntimeError("Faltan MSSQL_SERVER / MSSQL_USER en el archivo .env")
    return pymssql.connect(server=DB["server"], port=DB["port"], user=DB["user"], password=DB["password"],
                           database=DB["database"], charset="utf8", login_timeout=10, timeout=120)


def err(e: Exception) -> str:
    """Mensaje de error legible (pymssql devuelve bytes con el detalle repetido)."""
    parts, flat = [], []
    def walk(x):
        if isinstance(x, (tuple, list)):
            for y in x: walk(y)
        else:
            flat.append(x)
    walk(getattr(e, "args", ()) or (str(e),))
    for a in flat:
        if isinstance(a, bytes):
            a = a.decode("utf-8", "replace")
        if isinstance(a, int):
            continue
        for line in str(a).splitlines():
            line = line.strip()
            if line and line not in parts and not line.startswith("DB-Lib error message"):
                parts.append(line)
    return " · ".join(parts) or e.__class__.__name__


def plain(v):
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return v


@app.get("/api/health")
def health():
    return {"ok": True, "db_configurado": bool(DB["server"] and DB["user"]), "database": DB["database"]}


@app.get("/api/db/test")
def db_test():
    t0 = time.time()
    try:
        with connect() as conn:
            cur = conn.cursor(as_dict=True)
            cur.execute(
                "SELECT @@SERVERNAME AS servidor, DB_NAME() AS base, SUSER_NAME() AS usuario, "
                "HAS_DBACCESS(%s) AS acceso_aud, HAS_DBACCESS('LINKNUEVOOK') AS acceso_link",
                (AUDIENCIAS_DB,),
            )
            r = cur.fetchone()
        return {"ok": True, "server": r["servidor"] or DB["server"], "database": r["base"], "usuario": r["usuario"],
                "audiencias_db": AUDIENCIAS_DB, "acceso_audiencias_db": r["acceso_aud"] == 1,
                "acceso_linknuevook": r["acceso_link"] == 1, "ms": round((time.time() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001 — se devuelve el mensaje al usuario
        return {"ok": False, "error": err(e), "server": DB["server"], "database": DB["database"]}


AUDIENCIAS_SQL = """
select 'Liga' as competicion,
  categoria = case when CHARINDEX(N'LIGA ESPAÑOLA /', A.nombre)>0 then N'1ª División'
                   when CHARINDEX(N'LIGA ESPAÑOLA 2 D /', A.nombre)>0 then N'2ª División'
                   when CHARINDEX(N'LIGA ESPAÑOLA FEMENINO /', A.nombre)>0 then 'Femenina' else '' end,
  A.fecha,
  SUBSTRING(A.Nombre, CHARINDEX('/', A.nombre)+2, LEN(A.nombre) - 4) as partido,
  TRIM(SUBSTRING(SUBSTRING(A.Nombre, CHARINDEX('/', A.nombre)+2, LEN(A.nombre) - 4), 0,
       CHARINDEX('-', SUBSTRING(A.Nombre, CHARINDEX('/', A.nombre)+2, LEN(A.nombre) - 4)))) as local,
  TRIM(SUBSTRING(SUBSTRING(A.Nombre, CHARINDEX('/', A.nombre)+2, LEN(A.nombre) - 4),
       CHARINDEX('-', SUBSTRING(A.Nombre, CHARINDEX('/', A.nombre)+2, LEN(A.nombre) - 4))+2,
       LEN(SUBSTRING(A.Nombre, CHARINDEX('/', A.nombre)+2, LEN(A.nombre) - 4)))) as visitante,
  B.nombre as cadena,
  ROUND(C.share, 3) as [Ind. 4+ Cuota], ROUND(C.miles, 3) as [Ind. 4+ AM(000)], ROUND(C.rating, 3) as [Ind. 4+ AM%%],
  ROUND(D.share, 3) as [Ind. 16+ Cuota], ROUND(D.miles, 3) as [Ind. 16+ AM(000)], ROUND(D.rating, 3) as [Ind. 16+ AM%%]
from {db}.dbo.emisw A
inner join {db}.dbo.CADENA_NEW B on A.cadena = B.codigo
inner join (select * from {db}.dbo.emiswt where Nivel1='0' and Nivel2='0') C on A.fecha=C.Fecha and A.Ambito=C.Ambito and A.Numemis=C.Numemis
inner join (select * from {db}.dbo.emiswt where Nivel1='6' and Nivel2='8') D on A.fecha=D.Fecha and A.Ambito=D.Ambito and A.Numemis=D.Numemis
where A.ambito='00' and A.fecha >= %s and A.fecha <= %s
  and A.nombre like N'FUTBOL:LIGA ESPAÑOLA%%' and A.nombre not like '%%(D)%%' and A.nombre not like '%%RESUMEN%%'
"""


class Rango(BaseModel):
    desde: dt.date
    hasta: dt.date


@app.post("/api/audiencias/espana")
def audiencias_espana(r: Rango):
    if r.desde > r.hasta:
        raise HTTPException(400, "La fecha inicio debe ser anterior o igual a la fecha fin")
    db = "[" + AUDIENCIAS_DB.replace("]", "") + "]"
    try:
        with connect() as conn:
            cur = conn.cursor(as_dict=True)
            # fechas en formato AAAAMMDD: SQL Server las interpreta igual con cualquier idioma
            cur.execute(AUDIENCIAS_SQL.format(db=db), (r.desde.strftime("%Y%m%d"), r.hasta.strftime("%Y%m%d")))
            rows = [{k: plain(v) for k, v in row.items()} for row in cur.fetchall()]
        return {"ok": True, "rows": rows}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": err(e)}


# ------------------------------------------------------------------ datos compartidos de la app
def state_conn():
    os.makedirs(DATA_DIR, exist_ok=True)
    c = sqlite3.connect(STATE_DB)
    c.execute("create table if not exists state (id integer primary key check (id = 1), version integer not null, data text not null, updated_at text not null)")
    return c


@app.get("/api/state")
def get_state():
    with _lock, state_conn() as c:
        row = c.execute("select version, data, updated_at from state where id = 1").fetchone()
    if not row:
        return {"version": 0, "state": None}
    return {"version": row[0], "state": json.loads(row[1]), "updated_at": row[2]}


@app.put("/api/state")
async def put_state(request: Request):
    body = await request.json()
    if not isinstance(body, dict) or not isinstance(body.get("state"), dict):
        raise HTTPException(400, "Formato no válido")
    sent = int(body.get("version") or 0)
    data = json.dumps(body["state"], ensure_ascii=False)
    now = dt.datetime.now().isoformat(timespec="seconds")
    with _lock, state_conn() as c:
        row = c.execute("select version from state where id = 1").fetchone()
        current = row[0] if row else 0
        if sent != current:
            return JSONResponse({"detail": "Otra persona guardó cambios antes", "version": current}, status_code=409)
        c.execute("insert into state (id, version, data, updated_at) values (1, ?, ?, ?) "
                  "on conflict(id) do update set version = excluded.version, data = excluded.data, updated_at = excluded.updated_at",
                  (current + 1, data, now))
    return {"ok": True, "version": current + 1, "updated_at": now}
