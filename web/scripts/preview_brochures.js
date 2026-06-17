'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs   = require('fs');

const OUT = path.join(__dirname, '../docs/product-brochures/preview');
fs.mkdirSync(OUT, { recursive: true });

const files = [
  'PROD004_Reksa_Dana_Saham_Bluechip.html',
  'PROD002_Deposito_Prioritas_12_Bulan.html',
  'PROD006_Asuransi_Jiwa_Unit_Link.html',
  'index.html',
];

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });

  for (const f of files) {
    const fp  = path.resolve(__dirname, '../docs/product-brochures/html', f);
    const url = 'file:///' + fp.replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    const out = path.join(OUT, f.replace('.html', '.png'));
    await page.screenshot({ path: out, fullPage: true });
    console.log('[✓]', f);
  }
  await browser.close();
})();
