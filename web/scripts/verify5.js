'use strict';
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    // Login
    await page.evaluate(() => {
      document.getElementById('loginUser').value = 'anisa';
      document.getElementById('loginPass').value = 'danamon2026';
    });
    await page.click('button.login-btn');

    // Wait up to 20s for customer rows to load
    console.log('[S1] Waiting for customer list...');
    let custLoaded = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const count = await page.evaluate(() => document.querySelectorAll('.cust-row').length);
      if (count > 0) { custLoaded = true; console.log(`[S1] ${count} customers loaded in ${i+1}s`); break; }
      process.stdout.write('.');
    }
    console.log('');

    if (!custLoaded) {
      console.log('[!] Customer list never loaded — testing injectFactsheetLinks directly');

      // Direct unit test: inject sample AI text into the output container and call injectFactsheetLinks
      const directTest = await page.evaluate(() => {
        // Check if injectFactsheetLinks is available
        if (typeof injectFactsheetLinks !== 'function') return { error: 'injectFactsheetLinks not found' };

        // Create a test container
        const container = document.createElement('div');
        container.id = 'test-inject-container';
        container.innerHTML = `<p>Nasabah memiliki <strong>Deposito Berjangka</strong> Rp 500jt jatuh tempo Juni 2026.</p>
<p>Rekomendasi: Renewal ke <strong>Reksa Dana Pendapatan Tetap</strong> atau <strong>Obligasi Negara</strong> (SBN).</p>
<p>Juga pertimbangkan <strong>Asuransi Jiwa Unit Link</strong> untuk proteksi.</p>`;
        document.body.appendChild(container);

        injectFactsheetLinks(container);

        const bar = container.querySelector('.factsheet-ref-bar');
        const links = container.querySelectorAll('a.brochure-link');
        const result = {
          barFound: !!bar,
          barText: bar ? bar.textContent.trim() : null,
          linkCount: links.length,
          links: Array.from(links).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
          factsheetDone: container.dataset.factsheetDone,
        };

        document.body.removeChild(container);
        return result;
      });
      console.log('[Direct Test]', JSON.stringify(directTest, null, 2));
      return;
    }

    // Select first customer
    await page.evaluate(() => document.querySelector('.cust-row').click());
    await new Promise(r => setTimeout(r, 3000));

    const c360 = await page.evaluate(() => {
      const links = document.querySelectorAll('a.brochure-link');
      return { count: links.length, links: Array.from(links).slice(0,5).map(a=>({ text:a.textContent.trim(), href:a.getAttribute('href') })) };
    });
    console.log('[C360]', JSON.stringify(c360));

    // Use evaluate to directly test injectFactsheetLinks in browser
    const directTest = await page.evaluate(() => {
      if (typeof injectFactsheetLinks !== 'function') return { error: 'injectFactsheetLinks not found' };

      const container = document.createElement('div');
      container.innerHTML = `<p>Nasabah memiliki <strong>Deposito Berjangka</strong> Rp 500jt jatuh tempo Juni 2026.</p>
<p>Rekomendasi: Renewal ke <strong>Reksa Dana Pendapatan Tetap</strong> atau <strong>Obligasi Negara</strong>.</p>
<p>Pertimbangkan juga <strong>Unit Link</strong> untuk proteksi jiwa.</p>`;
      document.body.appendChild(container);
      injectFactsheetLinks(container);

      const bar = container.querySelector('.factsheet-ref-bar');
      const links = container.querySelectorAll('a.brochure-link');
      const result = {
        barFound: !!bar,
        linkCount: links.length,
        links: Array.from(links).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
      };
      document.body.removeChild(container);
      return result;
    });
    console.log('[Direct injectFactsheetLinks Test]', JSON.stringify(directTest, null, 2));

  } catch(e) {
    console.error('[ERROR]', e.message);
  }

  await browser.close();
  console.log('[✓] Done');
})();
