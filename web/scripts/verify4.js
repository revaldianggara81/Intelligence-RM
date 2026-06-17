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
    await new Promise(r => setTimeout(r, 4000));

    // Check customer list
    const custInfo = await page.evaluate(() => {
      const scroll = document.getElementById('custListScroll');
      const rows = document.querySelectorAll('.cust-row');
      return {
        scrollFound: !!scroll,
        rowCount: rows.length,
        firstRowId: rows[0] ? rows[0].id : null,
        firstRowText: rows[0] ? rows[0].textContent.trim().substring(0, 50) : null,
      };
    });
    console.log('[Customers]', JSON.stringify(custInfo));

    if (custInfo.rowCount === 0) {
      console.log('[!] No customer rows found, waiting more...');
      await new Promise(r => setTimeout(r, 4000));
      const retryInfo = await page.evaluate(() => {
        const rows = document.querySelectorAll('.cust-row');
        return { rowCount: rows.length, firstId: rows[0]?.id };
      });
      console.log('[Retry]', JSON.stringify(retryInfo));
    }

    // Click first customer row
    await page.evaluate(() => {
      const row = document.querySelector('.cust-row');
      if (row) row.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    // Check C360 brochure links
    const c360Links = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.brochure-link'));
      const rows = Array.from(document.querySelectorAll('.dr')).slice(0, 5).map(d => d.outerHTML.substring(0, 200));
      return {
        count: links.length,
        links: links.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })).slice(0, 8),
        sampleRows: rows,
      };
    });
    console.log('[C360 Brochure Links]', JSON.stringify(c360Links, null, 2));

    await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/verify_after_select.png'), fullPage: false });

    // Run Maturity Analysis
    const runBtn1 = await page.$('#runBtn1');
    if (runBtn1) {
      await runBtn1.click();
      console.log('[S1] Clicked runBtn1');

      // Wait for output
      let done = false;
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const len = await page.evaluate(() => {
          const b = document.getElementById('s1outBody');
          return b ? b.textContent.length : 0;
        });
        if (len > 200) { done = true; console.log(`\n[S1] Got ${len} chars`); break; }
        process.stdout.write('.');
      }

      if (done) {
        // Wait for injectFactsheetLinks (called in onAnalysisDone with 250ms delay)
        await new Promise(r => setTimeout(r, 3000));

        const s1 = await page.evaluate(() => {
          const body = document.getElementById('s1outBody');
          if (!body) return null;
          const bar = body.querySelector('.factsheet-ref-bar');
          const allLinks = body.querySelectorAll('a.brochure-link');
          return {
            factsheetDone: body.dataset.factsheetDone || null,
            textLen: body.textContent.length,
            textSample: body.textContent.substring(0, 500),
            barFound: !!bar,
            barText: bar ? bar.textContent.trim().substring(0, 100) : null,
            linkCount: allLinks.length,
            links: Array.from(allLinks).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
          };
        });
        console.log('\n[S1 Maturity Result]', JSON.stringify(s1, null, 2));
        await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/verify_s1_result.png'), fullPage: false });
      }
    } else {
      console.log('[!] runBtn1 not found');
    }

    // Run Recommendation
    const runBtn2a = await page.$('#runBtn2a');
    if (runBtn2a) {
      await runBtn2a.click();
      console.log('[S2a] Clicked runBtn2a');

      let done = false;
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const len = await page.evaluate(() => {
          const b = document.getElementById('s2aoutBody');
          return b ? b.textContent.length : 0;
        });
        if (len > 200) { done = true; console.log(`\n[S2a] Got ${len} chars`); break; }
        process.stdout.write('.');
      }

      if (done) {
        await new Promise(r => setTimeout(r, 3000));
        const s2 = await page.evaluate(() => {
          const body = document.getElementById('s2aoutBody');
          if (!body) return null;
          const bar = body.querySelector('.factsheet-ref-bar');
          const allLinks = body.querySelectorAll('a.brochure-link');
          return {
            factsheetDone: body.dataset.factsheetDone || null,
            textLen: body.textContent.length,
            textSample: body.textContent.substring(0, 500),
            barFound: !!bar,
            barText: bar ? bar.textContent.trim().substring(0, 100) : null,
            linkCount: allLinks.length,
            links: Array.from(allLinks).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
          };
        });
        console.log('\n[S2a Reco Result]', JSON.stringify(s2, null, 2));
        await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/verify_s2a_result.png'), fullPage: false });
      }
    } else {
      console.log('[!] runBtn2a not found');
    }

  } catch(e) {
    console.error('[ERROR]', e.message);
    console.error(e.stack);
  }

  await browser.close();
  console.log('\n[✓] Done');
})();
