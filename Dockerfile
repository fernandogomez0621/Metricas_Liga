# Métrica Liga · imagen de producción
# La app es estática (HTML + JS en módulos); nginx la sirve dentro del contenedor en el puerto 80.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY app/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
