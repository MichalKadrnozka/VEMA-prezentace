# ---------- build frontendu ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime s LibreOffice a FFmpeg ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    OUTPUT_DIR=/tmp/vema-output

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-impress \
      libreoffice-writer \
      ffmpeg \
      poppler-utils \
      fonts-liberation \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY data/content.seed.json ./data/content.seed.json

RUN mkdir -p /data /tmp/vema-output
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "server/index.js"]
