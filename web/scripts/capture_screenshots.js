'use strict';
/**
 * Capture screenshots of all modules for PowerPoint documentation
 * Run: node scripts/capture_screenshots.js
 */
const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');

const BASE_URL   = 'http://localhost:3000';
const OUT_DIR    = path.join(__dirname, '../docs/screenshots');
const CREDENTIALS = { username: 'anisa', password: 'danamon2026' };

fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitAndShot(page, filename, waitMs = 1200) {
  await delay(waitMs);
  const outPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('[✓]', filename);
  return outPath;
}

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await delay(600);
  // Fill username
  await page.evaluate((creds) => {
    const u = document.querySelector('#loginUsername, input[name="username"], input[placeholder*="username" i], input[id*="user" i]');
    const p = document.querySelector('#loginPassword, input[name="password"], input[type="password"]');
    if (u) { u.value = creds.username; u.dispatchEvent(new Event('input', {bubbles:true})); }
    if (p) { p.value = creds.password; p.dispatchEvent(new Event('input', {bubbles:true})); }
  }, CREDENTIALS);
  await delay(300);
  // Click Sign In
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign In') || b.textContent.includes('Login'));
    if (btn) btn.click();
  });
  await delay(2000);
  console.log('[login] done');
}

async function navigate(page, view, waitMs = 1500) {
  await page.evaluate((v) => {
    if (typeof navigate === 'function') navigate(v);
  }, view);
  await delay(waitMs);
}

async function scrollDown(page, amount = 600) {
  await page.evaluate((a) => window.scrollBy(0, a), amount);
  await delay(400);
}

async function scrollTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(300);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  try {
    // ─── 01. Login Page ───────────────────────────────────────────
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await delay(800);
    await waitAndShot(page, '01_login.png', 400);

    // ─── Login ────────────────────────────────────────────────────
    await login(page);

    // ─── 02. RM Dashboard ─────────────────────────────────────────
    await navigate(page, 'dashboard', 1800);
    await scrollTop(page);
    await waitAndShot(page, '02_dashboard.png', 600);

    // ─── 02b. Dashboard scrolled (quick links, stats) ─────────────
    await scrollDown(page, 500);
    await waitAndShot(page, '02b_dashboard_scroll.png', 400);
    await scrollTop(page);

    // ─── 03. Customer 360 — List ──────────────────────────────────
    await navigate(page, 'customers', 2000);
    await scrollTop(page);
    await waitAndShot(page, '03_customer360_list.png', 600);

    // ─── 03b. Customer 360 — Individual Profile ───────────────────
    await page.evaluate(() => {
      // Click first customer in the list
      const firstCust = document.querySelector('.cust-card, .customer-item, [onclick*="showCust"]');
      if (firstCust) firstCust.click();
    });
    await delay(2500);
    await scrollTop(page);
    await waitAndShot(page, '03b_customer360_profile.png', 500);

    // ─── 03c. Customer 360 — AI Summary (scroll down) ─────────────
    await scrollDown(page, 300);
    await waitAndShot(page, '03c_customer360_ai_summary.png', 400);

    // ─── 03d. Customer 360 — Market Intelligence (scroll more) ────
    await scrollDown(page, 500);
    await waitAndShot(page, '03d_customer360_market_intel.png', 400);

    // ─── 03e. Customer 360 — Sub-modules (scroll more) ────────────
    await scrollDown(page, 600);
    await waitAndShot(page, '03e_customer360_submodules.png', 400);
    await scrollTop(page);

    // ─── 04. Calendar ─────────────────────────────────────────────
    await navigate(page, 'calendar', 1800);
    await scrollTop(page);
    await waitAndShot(page, '04_calendar.png', 600);

    // ─── 05. Maturity Reminder ────────────────────────────────────
    await navigate(page, 'maturity', 1800);
    await scrollTop(page);
    await waitAndShot(page, '05_maturity_reminder.png', 600);

    // ─── 05b. Maturity — run analysis & result ────────────────────
    await page.evaluate(() => {
      const btn = document.querySelector('#runBtn1, [onclick*="runScenario1"], [onclick*="runMaturity"]');
      if (btn) btn.click();
    });
    await delay(4000);
    await scrollTop(page);
    await waitAndShot(page, '05b_maturity_result.png', 500);
    await scrollDown(page, 500);
    await waitAndShot(page, '05c_maturity_result_detail.png', 400);
    await scrollTop(page);

    // ─── 06. Product Recommendations ─────────────────────────────
    await navigate(page, 'recommendations', 1800);
    await scrollTop(page);
    await waitAndShot(page, '06_product_reco.png', 600);

    // ─── 06b. Reco — run analysis ─────────────────────────────────
    await page.evaluate(() => {
      const btn = document.querySelector('#runBtn2a, [onclick*="runScenario2a"], [onclick*="runReco"]');
      if (btn) btn.click();
    });
    await delay(4000);
    await scrollTop(page);
    await waitAndShot(page, '06b_product_reco_result.png', 500);
    await scrollTop(page);

    // ─── 07. Campaign Management ──────────────────────────────────
    await navigate(page, 'campaigns', 1800);
    await scrollTop(page);
    await waitAndShot(page, '07_campaign_mgmt.png', 600);

    // ─── 07b. Campaign Scan ───────────────────────────────────────
    await page.evaluate(() => {
      const btn = document.querySelector('#runBtn2b, [onclick*="runScenario2b"], [onclick*="runCampaign"]');
      if (btn) btn.click();
    });
    await delay(4000);
    await scrollTop(page);
    await waitAndShot(page, '07b_campaign_scan_result.png', 500);
    await scrollTop(page);

    // ─── 08. Portfolio Alerts ─────────────────────────────────────
    await navigate(page, 'alerts', 2000);
    await scrollTop(page);
    await waitAndShot(page, '08_portfolio_alerts.png', 600);
    await scrollDown(page, 400);
    await waitAndShot(page, '08b_portfolio_alerts_detail.png', 400);
    await scrollTop(page);

    // ─── 09. AI Copilot ───────────────────────────────────────────
    await navigate(page, 'copilot', 1800);
    await scrollTop(page);
    await waitAndShot(page, '09_ai_copilot.png', 600);

    // ─── 09b. AI Copilot — send a sample message ──────────────────
    await page.evaluate(() => {
      const inp = document.querySelector('#copilotInput, textarea[id*="copilot"], input[id*="copilot"]');
      if (inp) {
        inp.value = 'Tampilkan ringkasan portfolio nasabah prioritas';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await waitAndShot(page, '09b_ai_copilot_input.png', 300);

    // ─── 10. Executive Dashboard ──────────────────────────────────
    await navigate(page, 'executive', 3000);
    await scrollTop(page);
    await waitAndShot(page, '10_executive_dashboard.png', 1000);
    await scrollDown(page, 500);
    await waitAndShot(page, '10b_executive_dashboard_scroll.png', 500);
    await scrollTop(page);

    // ─── 11. Compliance ───────────────────────────────────────────
    await navigate(page, 'compliance', 1800);
    await scrollTop(page);
    await waitAndShot(page, '11_compliance.png', 600);

    // ─── 12. Admin Console ────────────────────────────────────────
    await navigate(page, 'admin', 1800);
    await scrollTop(page);
    await waitAndShot(page, '12_admin_console.png', 600);
    await scrollDown(page, 400);
    await waitAndShot(page, '12b_admin_console_detail.png', 400);

    console.log('\n[✓] All screenshots captured to:', OUT_DIR);
    console.log('[✓] Files:', fs.readdirSync(OUT_DIR).join(', '));

  } catch (err) {
    console.error('[ERROR]', err.message);
    await page.screenshot({ path: path.join(OUT_DIR, 'error_state.png') });
  }

  await browser.close();
})();
