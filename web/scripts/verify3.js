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
    await new Promise(r => setTimeout(r, 3000));

    // Select first customer from list
    const custSelected = await page.evaluate(() => {
      const custItems = document.querySelectorAll('.cust-item, .customer-item, [data-custid], .cl-item');
      if (custItems.length > 0) {
        custItems[0].click();
        return { count: custItems.length, firstText: custItems[0].textContent.trim().substring(0, 50) };
      }
      return { count: 0, firstText: null };
    });
    console.log('[Customers]', JSON.stringify(custSelected));
    await new Promise(r => setTimeout(r, 3000));

    // Check C360 brochure links
    const c360Links = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.brochure-link'));
      return { count: links.length, links: links.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })) };
    });
    console.log('[C360 links]', JSON.stringify(c360Links));

    // Take screenshot
    await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/verify_c360.png'), fullPage: false });
    console.log('[✓] C360 screenshot saved');

    // Click Maturity Run button
    await page.click('#runBtn1');
    console.log('[S1] Clicked runBtn1');

    // Wait for output (up to 45s)
    let s1Done = false;
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await page.evaluate(() => {
        const body = document.getElementById('s1outBody');
        return body ? body.textContent.length : 0;
      });
      if (st > 200) { s1Done = true; break; }
      process.stdout.write(`[${i}]`);
    }
    console.log('\n[S1] Output ready:', s1Done);

    // Wait extra for injectFactsheetLinks (250ms delay in onAnalysisDone)
    await new Promise(r => setTimeout(r, 3000));

    const s1Result = await page.evaluate(() => {
      const body = document.getElementById('s1outBody');
      if (!body) return { error: 'no s1outBody' };
      const bar = body.querySelector('.factsheet-ref-bar');
      const links = body.querySelectorAll('a.brochure-link');
      return {
        textLen: body.textContent.length,
        textSnippet: body.textContent.substring(0, 400),
        barFound: !!bar,
        barHtml: bar ? bar.outerHTML.substring(0, 400) : null,
        linkCount: links.length,
        links: Array.from(links).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
        factsheetDone: body.dataset.factsheetDone,
      };
    });
    console.log('[S1 Maturity]', JSON.stringify(s1Result, null, 2));

    await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/verify_s1.png'), fullPage: false });

    // Click Recommendation Run button
    await page.click('#runBtn2a');
    console.log('[S2a] Clicked runBtn2a');

    let s2Done = false;
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await page.evaluate(() => {
        const body = document.getElementById('s2aoutBody');
        return body ? body.textContent.length : 0;
      });
      if (st > 200) { s2Done = true; break; }
      process.stdout.write(`[${i}]`);
    }
    console.log('\n[S2a] Output ready:', s2Done);
    await new Promise(r => setTimeout(r, 3000));

    const s2Result = await page.evaluate(() => {
      const body = document.getElementById('s2aoutBody');
      if (!body) return { error: 'no s2aoutBody' };
      const bar = body.querySelector('.factsheet-ref-bar');
      const links = body.querySelectorAll('a.brochure-link');
      return {
        textLen: body.textContent.length,
        textSnippet: body.textContent.substring(0, 400),
        barFound: !!bar,
        barHtml: bar ? bar.outerHTML.substring(0, 400) : null,
        linkCount: links.length,
        links: Array.from(links).map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
        factsheetDone: body.dataset.factsheetDone,
      };
    });
    console.log('[S2a Reco]', JSON.stringify(s2Result, null, 2));

  } catch(e) {
    console.error('[ERROR]', e.message);
    console.error(e.stack);
  }

  await browser.close();
  console.log('[✓] Done');
})();
