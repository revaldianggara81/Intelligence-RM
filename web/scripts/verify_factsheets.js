'use strict';
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  try {
    // Login
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    await page.type('#loginUser', 'anisa');
    await page.type('#loginPass', 'danamon2026');
    await page.click('button.login-btn');
    await new Promise(r => setTimeout(r, 3000));
    console.log('[✓] Logged in');

    // Check Customer 360 holdings
    const c360 = await page.evaluate(() => {
      const links = document.querySelectorAll('a.brochure-link');
      return Array.from(links).map(a => ({ text: a.textContent.trim(), href: a.href }));
    });
    console.log('[C360] Brochure links on page load:', JSON.stringify(c360.slice(0, 5)));

    // Run Maturity Reminder (click s1runBtn or similar)
    const runBtnExists = await page.evaluate(() => {
      const btn = document.getElementById('s1runBtn');
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('[S1] Run button found:', runBtnExists);

    if (runBtnExists) {
      // Wait for SSE to complete (up to 30s)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const done = await page.evaluate(() => {
          const body = document.getElementById('s1outBody');
          return body && body.textContent.length > 50;
        });
        if (done) break;
        process.stdout.write('.');
      }
      console.log('\n[S1] Output rendered');

      // Wait extra for injectFactsheetLinks
      await new Promise(r => setTimeout(r, 2000));

      const maturityResult = await page.evaluate(() => {
        const body = document.getElementById('s1outBody');
        if (!body) return { error: 'no body', text: '' };
        const bar = body.querySelector('.factsheet-ref-bar');
        const links = body.querySelectorAll('a.brochure-link');
        const text = body.textContent.substring(0, 300);
        return {
          barFound: !!bar,
          barHtml: bar ? bar.innerHTML.substring(0, 300) : null,
          linkCount: links.length,
          links: Array.from(links).map(a => a.textContent.trim()),
          textSnippet: text,
        };
      });
      console.log('[S1 Maturity Result]', JSON.stringify(maturityResult, null, 2));
    }

    // Navigate to Recommendation tab and run
    const s2Exists = await page.evaluate(() => {
      // Try clicking the recommendation tab
      const tabs = document.querySelectorAll('[data-tab], .tab-btn, nav a');
      for (const t of tabs) {
        if (t.textContent.includes('Reko') || t.textContent.includes('Recommendation')) {
          t.click(); return true;
        }
      }
      return false;
    });
    console.log('[S2] Tab found:', s2Exists);

    if (s2Exists) {
      await new Promise(r => setTimeout(r, 1000));
      const runS2 = await page.evaluate(() => {
        const btn = document.getElementById('s2arunBtn') || document.getElementById('s2runBtn');
        if (btn) { btn.click(); return true; }
        return false;
      });
      console.log('[S2] Run btn:', runS2);

      if (runS2) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const done = await page.evaluate(() => {
            const body = document.getElementById('s2aoutBody');
            return body && body.textContent.length > 50;
          });
          if (done) break;
        }
        await new Promise(r => setTimeout(r, 2000));

        const recoResult = await page.evaluate(() => {
          const body = document.getElementById('s2aoutBody');
          if (!body) return { error: 'no body' };
          const bar = body.querySelector('.factsheet-ref-bar');
          const links = body.querySelectorAll('a.brochure-link');
          return {
            barFound: !!bar,
            linkCount: links.length,
            links: Array.from(links).map(a => a.textContent.trim()),
            textSnippet: body.textContent.substring(0, 300),
          };
        });
        console.log('[S2 Reco Result]', JSON.stringify(recoResult, null, 2));
      }
    }

  } catch(e) {
    console.error('[ERROR]', e.message);
  }

  await browser.close();
  console.log('[✓] Done');
})();
