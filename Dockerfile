# ---- build: compile the Vite app to static files ----
FROM node:22-alpine AS build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- runtime: nginx serves dist/ and proxies /api/ ----
FROM nginx:stable

# Rendered into /etc/nginx/conf.d/ by the image's entrypoint (envsubst) at start.
ENV APISERVER_ADDR=apiserver:8000 \
    MONITORING_CIDR=127.0.0.1/32 \
    NGINX_ENVSUBST_FILTER="^(APISERVER_ADDR|MONITORING_CIDR)$"

RUN rm -f /etc/nginx/conf.d/default.conf \
 && touch /var/log/nginx/access.json \
 && chown nginx:nginx /var/log/nginx/access.json
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf.d/store.conf /etc/nginx/templates/store.conf.template
COPY --from=build /web/dist /usr/share/nginx/html

EXPOSE 80
