# Métrica Liga

Aplicación web para cargar los Excel de una jornada (postplays, estáticos y audiencias Kantar), valorar la presencia de marca en las retransmisiones y mostrar a cada cliente sus datos.

Estado: **prototipo funcional**. El cálculo está verificado contra la exportación de Analítica de IKLAN de la jornada 1: **3.260.195,01 €** (público +16) y **3.053.518,60 €** (+4), con los mismos importes partido a partido.

## Qué incluye

- **Investigación** (uso interno): «Cargar datos», pestañas Segundos, Audiencias, Goles, Log A., Log C., Equipos, Partidos, Públicos, Canales, Soportes, Analítica y Fórmulas. Todas las tablas tienen búsqueda, filtros, columnas ocultables, edición por fila (crear, modificar, eliminar) y **Descargar Excel** con lo que se está viendo (respeta los filtros).
- **Analítica**: tarjetas de Valoración y GRPs (+16 y +4) y tiempo valorado que **se recalculan con los filtros** de la tabla. Columnas con la misma nomenclatura que Segundos: Ctto. TM, Emitido TM, Emitido TV.
- **Cargar datos**:
  - Postplays (varios a la vez) y Estáticos (un Excel por jornada; se acumulan, repetir una jornada la reemplaza).
  - Audiencias España: consulta a SQL Server entre **fecha inicio y fecha fin**, con botón **Probar conexión**; o el Excel exportado de Kantar (hoja «Programas»), varios a la vez.
  - Audiencias internacionales: Excel + **país**. Se guardan como referencia; la valoración usa solo España.
- **Validar jornada** e **In-Situ**.
- **Vista cliente**: por defecto muestra **la última jornada con datos del cliente**; descarga en Excel del control de presencia y del acumulado.
- **Datos compartidos**: con el servidor, todo el equipo ve y edita los mismos datos (se guardan en el contenedor `api`).

## Arquitectura

```
navegador ──► web (nginx, puerto 4444) ──► /         app (HTML + JS en módulos)
                                       └─► /api/...  api (FastAPI, Python)
                                                       ├─ SQL Server (pymssql, credenciales en .env)
                                                       └─ SQLite en el volumen metrica_data (datos de la app)
```

## Despliegue en Ubuntu con Docker (puerto 4444)

Requisitos: Docker con el plugin Compose.

```bash
git clone https://github.com/fernandogomez0621/Metricas_Liga.git
cd Metricas_Liga
cp .env.example .env
nano .env                       # pon la contraseña real de SQL Server en MSSQL_PASSWORD
docker compose up -d --build
sudo ufw allow 4444/tcp
```

Abre `http://IP_DE_LA_MAQUINA:4444`. En «Cargar datos → Audiencias España → Probar conexión» se comprueba el acceso a SQL Server.

**El archivo `.env` no se sube a GitHub** (está en `.gitignore`): créalo en cada máquina donde despliegues.

Comandos útiles:

```bash
docker compose ps                          # estado (web y api)
docker compose logs -f api                 # registros del servidor (errores de SQL, etc.)
git pull && docker compose up -d --build   # actualizar a la última versión
docker compose down                        # parar (los datos se conservan en el volumen)
docker compose cp api:/data/metrica.db ./copia_metrica.db   # copia de seguridad de los datos
```

Sin Docker, para probar solo la interfaz: `python3 -m http.server 4444 --directory app`. En ese modo no hay API: los datos se guardan en el navegador y la consulta a SQL Server no está disponible.

## Estructura

```
app/                    Interfaz (la sirve nginx)
  index.html, css/app.css
  js/
    app.js              Arranque, menú y navegación
    store.js            Estado y guardado (servidor si existe; si no, navegador)
    api.js              Llamadas a la API
    parsers.js          Lectura de postplays, estáticos, Kantar (Excel y SQL) y tabla de Audiencias
    calc.js             Motor de valoración
    masters.js          Búsquedas en Canales, Soportes y Partidos; alias de nombres
    table.js            Tabla reutilizable (filtros, orden, paginación, Excel)
    upload.js           Ventana «Cargar datos»
    jornadas.js         Validar jornada e In-Situ
    modals.js, exporter.js
    views/internal.js   Pestañas de Investigación
    views/client.js     Vista cliente
    views/formulas.js   Pestaña Fórmulas (LaTeX con KaTeX)
  data/                 Configuración (canales, soportes, públicos, equipos, partidos) y jornada 1 de ejemplo
  vendor/               SheetJS y KaTeX, sin depender de internet
api/                    Servidor: main.py, requirements.txt, Dockerfile
docs/formulas.tex       Metodología de cálculo (compila en Overleaf)
tests/calc.test.mjs     Prueba del cálculo contra los totales de IKLAN
Dockerfile              Imagen web (nginx)
docker-compose.yml      Servicios web + api
nginx.conf, .env.example
```

## Cálculo

```
AM % total = redondeo(AM % hogar × factor del canal, 3)
GRPs       = AM % total × segundos ÷ 20
Valoración = GRPs × coste GRP nacional del canal × coeficiente de tamaño del soporte
```

- Segundos de vallas: **Emitido TV** (*Output Seconds LIVE*) por defecto; se puede cambiar a **Emitido TM** (*Broad TM Time*) en Analítica.
- Solo se valora el feed nacional. Si un partido se emite en dos canales, se valora en ambos.

Prueba automática (requiere Node 18 o superior):

```bash
npm test
```

## Formatos de entrada

| Archivo | Se reconoce por |
|---|---|
| Postplay (nacional o internacional) | Nombre `AAMMDD.Local-Visitante_J<n>_<FEED>_TM_IK.xlsx`; columnas *Hired TV Time*, *Broad TM Time*, *Output Seconds LIVE* (se buscan por título); tablas *GOALS* y *MOMENTUMS* |
| Estáticos | Columnas *Jornada, Partido, Equipo Local, Equipo Visitante, Feed, Soporte, Cliente, Anunciante, Tiempo en segundos*. Las filas vacías o con «PDTE» se saltan con aviso |
| Kantar (Excel) | Hoja con *Título, Descripción (LOCAL-VISITANTE), Cadena, Fecha* y bloques *Ind. 4+* / *Ind. 16+* con *AM(000), AM%, Cuota*. Se usan los bloques «sin invitados». La jornada se toma del nombre (`_J12_`) o del calendario |
| Kantar (SQL Server) | Consulta sobre las vistas EMISW, EMISWT y CADENA_NEW de `AUDIENCIAS_DB` (por defecto GECAIKLAN) |
| Tabla Audiencias | *Jornada, Partido, Canal, Tipo Canal, Público, Cuota Pant. %, AM % Hogar, Aud. Hogar* |

Las audiencias se asignan a un partido del calendario (pestaña Partidos) por los nombres de local y visitante. Si un partido no está en el calendario, aparece un aviso: añádelo en la pestaña Partidos y vuelve a cargar.

## Limitaciones del prototipo

- No hay inicio de sesión: usuarios y registros de acceso están simulados. Cualquiera que abra la página puede editar.
- Si dos personas guardan a la vez, la segunda recibe un aviso para recargar y no pisa los cambios de la primera.
- La consulta de audiencias España necesita que el usuario de SQL Server tenga lectura en LINKNUEVOOK (error 916 si no la tiene).
- `data/demo.json` y `data/masters.json` contienen datos reales de la jornada 1. Si el repositorio es público, quedan visibles.
