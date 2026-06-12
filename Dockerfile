# Imagen oficial de Playwright: trae Chromium y todas las deps de sistema.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Instalar deps primero para cachear capa
COPY package*.json ./
RUN npm install --omit=dev

# Codigo
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Usuario no-root que ya viene en la imagen
USER pwuser

CMD ["node", "server.js"]
