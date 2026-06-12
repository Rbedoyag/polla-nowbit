# golpredictor-scraper

Microservicio HTTP que scrapea la tabla de posiciones de una polla en golpredictor.com usando Playwright (Chromium headless). Pensado para ser llamado desde n8n u otros workflows.

## Endpoint

```
GET /polla/posiciones
Headers: x-api-key: <API_KEY>
```

Respuesta:

```json
{
  "ok": true,
  "total": 21,
  "ms": 6432,
  "posiciones": [
    { "posicion": "1", "usuario": "usuario1", "nombre": "Nombre Apellido", "puntos": "10", "inscripcion": "10 Jun - 09:48" },
    ...
  ]
}
```

Health check: `GET /health` (sin auth).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GOLPREDICTOR_USER` | sí | Usuario del sitio |
| `GOLPREDICTOR_PASS` | sí | Contraseña |
| `API_KEY` | sí | Token para proteger el endpoint |
| `POLLA_NAME` | no | Nombre del link de la polla (default: `Polla NowBit`) |
| `PORT` | no | default `3000` |
| `HEADLESS` | no | `false` para depurar localmente con UI |
| `SCRAPE_TIMEOUT_MS` | no | default `45000` |

## Deploy en Easypanel

1. **Crear servicio**: en tu proyecto, *Create Service → App*.
2. **Source**: elige *Dockerfile* y apunta al repo (push estos archivos a GitHub) o sube el código por *Upload*.
3. **Build**: Easypanel detecta el `Dockerfile` automáticamente. La imagen base es pesada (~1.5GB con Chromium), el primer build tarda algunos minutos.
4. **Environment**: agrega las variables del cuadro de arriba. Para `API_KEY` usa algo como:
   ```bash
   openssl rand -hex 32
   ```
5. **Ports**: expón `3000`. Easypanel le pone un dominio HTTPS automático tipo `https://golpredictor-scraper.<tu-dominio>.easypanel.host`.
6. **Resources**: Chromium come RAM. Asigna **mínimo 1GB**, recomendado 2GB. CPU 0.5 está bien.
7. **Health check** (opcional): path `/health`, intervalo 30s.
8. **Deploy** y revisa los logs: debes ver `golpredictor-scraper escuchando en :3000`.

## Probar

```bash
curl -H "x-api-key: TU_API_KEY" \
  https://tu-servicio.easypanel.host/polla/posiciones
```

Primera llamada: ~6-10s (incluye lanzamiento de Chromium). Siguientes: ~3-5s (browser reutilizado).

## Desarrollo local

```bash
cp .env.example .env
# editar .env
npm install
npx playwright install chromium
npm run dev
```

## Notas

- El browser se lanza una vez y se reutiliza entre requests (con `context` aislado por request). Si se cae, la siguiente request lo relanza.
- Si golpredictor cambia el HTML (IDs `ctl00_ContentPlaceInner_*`), hay que ajustar los selectores en `server.js`.
- Para depurar: pon `HEADLESS=false` localmente y ve el navegador en acción.
