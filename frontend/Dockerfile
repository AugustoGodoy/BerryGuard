# ── Stage 1: Build Angular ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build:prod

# ── Stage 2: Serve com nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove configuração padrão
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf

# O novo builder do Angular 17+ coloca os arquivos em dist/{name}/browser/
COPY --from=builder /app/dist/berryguard/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
