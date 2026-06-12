// server.js
// Microservicio scraping golpredictor con Playwright.
// Endpoint protegido por API key, devuelve JSON con posiciones de la Polla.

import express from 'express';
import { chromium } from 'playwright';

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const GP_USER = process.env.GOLPREDICTOR_USER || '';
const GP_PASS = process.env.GOLPREDICTOR_PASS || '';
const POLLA_NAME = process.env.POLLA_NAME || 'Polla NowBit';
const HEADLESS = process.env.HEADLESS !== 'false';
const SCRAPE_TIMEOUT_MS = parseInt(process.env.SCRAPE_TIMEOUT_MS || '45000', 10);

if (!API_KEY || !GP_USER || !GP_PASS) {
  console.error('Faltan variables: API_KEY, GOLPREDICTOR_USER, GOLPREDICTOR_PASS');
  process.exit(1);
}

const app = express();
app.use(express.json());

// --- middleware de auth ---
function requireApiKey(req, res, next) {
  const key = req.get('x-api-key') || req.query.api_key;
  if (key !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// --- browser singleton: arranque lento, requests rapidos ---
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

// --- scraping ---
async function scrapePosiciones() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(SCRAPE_TIMEOUT_MS);

  try {
    // 1. Login
    await page.goto('https://www.golpredictor.com/login.aspx', { waitUntil: 'domcontentloaded' });
    await page.fill('#ctl00_ContentPlaceInner_txtUserName', GP_USER);
    await page.fill('#ctl00_ContentPlaceInner_txtPassword', GP_PASS);

    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('#ctl00_ContentPlaceInner_btnLogin'),
    ]);

    // Verificar sesion: debemos ver gvPollas (lista de grupos) en Mi Cuenta
    await page.waitForSelector('#ctl00_ContentPlaceInner_gvPollas', { timeout: 15000 });

    // 2. Entrar a la Polla NowBit (postback)
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click(`#ctl00_ContentPlaceInner_gvPollas a:has-text("${POLLA_NAME}")`),
    ]);

    // 3. Activar pestana Posiciones si no esta activa
    const gvPuntosVisible = await page.$('#ctl00_ContentPlaceInner_gvPuntos');
    if (!gvPuntosVisible) {
      const posTab = await page.$('a:has-text("Posiciones")');
      if (posTab) {
        await Promise.all([
          page.waitForLoadState('domcontentloaded').catch(() => {}),
          posTab.click(),
        ]);
      }
    }
    await page.waitForSelector('#ctl00_ContentPlaceInner_gvPuntos tr', { timeout: 15000 });

    // 4. Extraer tabla
    const rows = await page.$$eval('#ctl00_ContentPlaceInner_gvPuntos tr', (trs) =>
      trs
        .map((tr) => {
          const tds = tr.querySelectorAll('td');
          if (tds.length < 5) return null;
          const posicion = tds[0].textContent.trim();
          if (!/^\d+$/.test(posicion)) return null;
          return {
            posicion,
            usuario: tds[1].textContent.trim(),
            nombre: tds[2].textContent.replace(/\s+/g, ' ').trim(),
            puntos: tds[3].textContent.trim(),
            inscripcion: tds[4].textContent.trim(),
          };
        })
        .filter(Boolean),
    );

    return rows;
  } finally {
    await context.close().catch(() => {});
  }
}

// --- rutas ---
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/polla/posiciones', requireApiKey, async (_req, res) => {
  const t0 = Date.now();
  try {
    const rows = await scrapePosiciones();
    const ms = Date.now() - t0;
    console.log(`[scrape ok] ${rows.length} filas en ${ms}ms`);
    res.json({ ok: true, total: rows.length, ms, posiciones: rows });
  } catch (err) {
    console.error('[scrape error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- shutdown limpio ---
async function shutdown() {
  console.log('Cerrando...');
  try {
    if (browserPromise) {
      const b = await browserPromise;
      await b.close();
    }
  } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(PORT, () => console.log(`golpredictor-scraper escuchando en :${PORT}`));
