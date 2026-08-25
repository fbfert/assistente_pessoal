FROM node:22-bookworm-slim

# better-sqlite3 compila binário nativo — sem estas ferramentas o npm ci falha.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# O estado que não pode ser perdido: o banco e a sessão pareada do WhatsApp.
# Perder /data/auth significa parear de novo, presencialmente com o chip.
ENV DB_PATH=/data/tars.sqlite \
    WHATSAPP_AUTH_DIR=/data/auth \
    TZ=America/Sao_Paulo \
    NODE_ENV=production

VOLUME ["/data"]

CMD ["node", "src/index.js"]
