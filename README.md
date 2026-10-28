# Métrica Liga

Aplicación web para cargar los Excel de una jornada (postplays, estáticos y audiencias Kantar), valorar la presencia de marca en las retransmisiones y mostrar a cada cliente sus datos.

Estado: **prototipo funcional**. El cálculo está verificado contra la exportación de Analítica de IKLAN de la jornada 1: **3.260.195,01 €** (público +16) y **3.053.518,60 €** (+4), con los mismos importes partido a partido.

## Qué incluye

- **Investigación** (uso interno): subida de Excel, pestañas Segundos, Audiencias, Goles, Log A., Log C., Equipos, Partidos, Públicos, Canales, Soportes, Analítica y Fórmulas. Todas las tablas tienen búsqueda, filtros, columnas ocultables, edición por fila y exportación a Excel.
- **Validar jornada** e **In-Situ** (asistencia LED y estáticos).
- **Vista cliente**: control de presencia por jornada, acumulado y control de tiempo; selector «Ver como» para ver lo mismo que un anunciante o un club.
- **Fórmulas**: metodología en LaTeX dentro de la app y en [`docs/formulas.tex`](docs/formulas.tex) ([PDF](docs/formulas.pdf)).

## Despliegue en Ubuntu con Docker (puerto 4444)

Requisitos: Docker con el plugin Compose.

```bash
# 1. Instalar Docker (si no está instalado)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # cierra sesión y vuelve a entrar para usar docker sin sudo

# 2. Clonar y arrancar
git clone https://github.com/fernandogomez0621/Metricas_Liga.git
cd Metricas_Liga
docker compose up -d --build

# 3. Abrir el puerto si el firewall está activo
sudo ufw allow 4444/tcp
```

Abre `http://IP_DE_LA_MAQUINA:4444`.

Comandos útiles:

```bash
docker compose ps                 # estado
docker compose logs -f            # registros
git pull && docker compose up -d --build   # actualizar a la última versión
docker compose down               # parar
```

Sin Docker, para probar en local: `python3 -m http.server 4444 --directory app` y abre `http://localhost:4444`. Abrir `index.html` con doble clic no funciona porque los módulos JavaScript necesitan un servidor.

## Estructura

```
app/                    Lo que sirve nginx
  index.html
  css/app.css
  js/
    app.js              Arranque, menú y navegación
    store.js            Estado y persistencia (único módulo a cambiar para usar un servidor)
    parsers.js          Lectura de postplays, estáticos y audiencias
    calc.js             Motor de valoración
    masters.js          Búsquedas en Canales, Soportes y Partidos; alias de nombres
    table.js            Tabla reutilizable (filtros, orden, paginación, exportar)
    upload.js           Ventana «Subir Excel»
    jornadas.js         Validar jornada e In-Situ
    modals.js           Ventanas y formularios
    exporter.js         Exportación a Excel
    views/internal.js   Pestañas de Investigación
    views/client.js     Vista cliente
    views/formulas.js   Pestaña Fórmulas (LaTeX con KaTeX)
  data/masters.json     Tablas de configuración: canales, soportes, públicos, equipos, partidos
  data/demo.json        Jornada 1 de ejemplo
  vendor/               SheetJS (lectura/escritura de Excel) y KaTeX, sin depender de internet
docs/formulas.tex       Metodología de cálculo (compila en Overleaf)
tests/calc.test.mjs     Prueba del cálculo contra los totales de IKLAN
Dockerfile, docker-compose.yml, nginx.conf
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
| Estáticos | Columnas *Jornada, Partido, Equipo Local, Equipo Visitante, Feed, Soporte, Cliente, Anunciante, Tiempo en segundos* |
| Audiencias | Formato de la tabla Audiencias: *Jornada, Partido, Canal, Tipo Canal, Público, Cuota Pant. %, AM % Hogar, Aud. Hogar* |

Pendiente: leer directamente el Excel original de Kantar (hace falta un ejemplo de ese archivo).

## Limitaciones del prototipo

- Los datos se guardan en el navegador de cada usuario (localStorage). Otra persona u otro navegador empieza con los datos de ejemplo. Para trabajar en equipo hace falta un backend con base de datos.
- No hay inicio de sesión: usuarios y registros de acceso están simulados.
- `data/demo.json` y `data/masters.json` contienen datos reales de la jornada 1. Si el repositorio es público, quedan visibles; conviene que sea privado o sustituir esos datos.
