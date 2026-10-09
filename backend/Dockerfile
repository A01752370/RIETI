# Imagen del API RIETI para ECS Fargate (ARM64/Graviton).
# La imagen base se baja de la copia oficial en ECR Public (Docker Official Images),
# no de Docker Hub: Docker Hub limita las descargas anónimas y el despliegue falló con 429.

#
# El contexto de construcción es la RAÍZ del repositorio (docker build -f backend/Dockerfile .):
# la imagen incluye la web compilada (web/dist), que el mismo backend sirve.

# --- Web (React + Vite) ---
FROM public.ecr.aws/docker/library/node:24-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
# La verificación de tipos corre en CI (web.yml); aquí solo se compila.
RUN npx vite build

# --- API (NestJS) ---
FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --ignore-scripts
COPY backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DB_SSL_CA=/etc/ssl/rds/global-bundle.pem
WORKDIR /app

# CAs de Amazon RDS para verificar el certificado TLS de la BD.
ADD --chmod=444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds/global-bundle.pem

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=web --chown=node:node /web/dist ./web

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main"]
