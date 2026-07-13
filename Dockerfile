# Frontend: build Vite app and serve with nginx.

FROM mirror.gcr.io/library/node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts ./
COPY src ./src

# Baked into the SPA at build time. Defaults to a relative path so the local
# docker-compose setup keeps proxying /api through nginx unchanged. On Render
# (separate services) this is overridden with the backend's public API URL.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM mirror.gcr.io/library/nginx:1.27-alpine

# Port nginx listens on. Defaults to 80 for local docker-compose; Render
# overrides this with its injected PORT (e.g. 10000) at runtime. The nginx
# entrypoint renders templates/*.template into conf.d with envsubst.
ENV PORT=80

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
