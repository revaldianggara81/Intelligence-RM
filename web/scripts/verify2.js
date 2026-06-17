'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

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

    // Take screenshot to see current state
    await page.screenshot({ path: path.join(__dirname, '../docs/screenshots/verify_state.png'), fullPage: false });
    console.log('[✓] Screenshot saved');

    // Get page structure
    const structure = await page.evaluate(() => {
      const app = document.getElementById('app') || document.querySelector('.app-shell');
      const loginPage = document.getElementById('loginPage');
      const nav = document.querySelector('nav, .nav, .sidebar');
      const buttons = Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => ({ id: b.id, class: b.className, text: b.textContent.trim().substring(0, 40) }));
      const links = Array.from(document.querySelectorAll('a.brochure-link')).map(a => a.href);
      return {
        loginHidden: loginPage ? loginPage.style.display : 'unknown',
        appVisible: app ? app.style.display : 'unknown',
        navClasses: nav ? nav.className : 'none',
        buttons,
        brochureLinks: links.length,
        sampleLinks: links.slice(0, 5),
      };
    });
    console.log('Page structure:', JSON.stringify(structure, null, 2));

    // Check what IDs exist for the module run buttons
    const moduleIds = await page.evaluate(() => {
      const ids = ['s1runBtn', 's2arunBtn', 's2boutrunBtn', 's3runBtn', 'maturityRunBtn', 'recoRunBtn'];
      const found = {};
      ids.forEach(id => { found[id] = !!document.getElementById(id); });

      // Also find all buttons with 'run' in id/class
      const runBtns = Array.from(document.querySelectorAll('button[id*="run"], button[class*="run"]'))
        .map(b => ({ id: b.id, class: b.className, text: b.textContent.trim().substring(0, 30) }));

      return { found, runBtns };
    });
    console.log('Module IDs:', JSON.stringify(moduleIds, null, 2));

  } catch(e) {
    console.error('[ERROR]', e.message, e.stack);
  }

  await browser.close();
})();
