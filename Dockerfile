# The dashboard for Coolify (or any Docker host): build the static site, then serve it with nginx on port 80.
# The data files in data/ are part of the repo, so the image shows the data of the commit it was built from.

# 1. Build the static export (out/)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Served at the root of its domain by default; set a path such as /bpr only if the site sits under one.
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=${NEXT_BASE_PATH}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2. Serve it
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
