'use strict';
/**
 * marketDataService.js
 * Fetches live market data from Yahoo Finance, stores in MARKET_DATA,
 * and triggers PROC_PUSH_MARKET_ALERTS.
 */
const https = require('https');
const db    = require('../config/database');

/* ─── symbols to auto-fetch ─────────────────────────────────────── */
const AUTO_SYMBOLS = ['^JKSE', 'USDIDR=X'];

/* ─── helpers ────────────────────────────────────────────────────── */
function _get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RMPlatform/1.0)' },
      timeout: 10000,
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse error: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * Fetch one symbol from Yahoo Finance v8 chart API.
 * Returns { symbol, marketName, price, prevClose, changeAbs, changePct,
 *           dayHigh, dayLow, high52w, low52w } or throws.
 */
async function _fetchYahoo(symbol) {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d&includePrePost=false`;
  const json = await _get(url);

  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const meta   = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.closes ||
                  result.indicators?.quote?.[0]?.close  || []).filter(v => v != null);
  const highs  = (result.indicators?.quote?.[0]?.highs  ||
                  result.indicators?.quote?.[0]?.high   || []).filter(v => v != null);
  const lows   = (result.indicators?.quote?.[0]?.lows   ||
                  result.indicators?.quote?.[0]?.low    || []).filter(v => v != null);

  const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  if (price == null) throw new Error(`No price for ${symbol}`);

  // prevClose: use chartPreviousClose, or second-last OHLCV close
  const prevClose = meta.chartPreviousClose ??
                    meta.previousClose      ??
                    (closes.length >= 2 ? closes[closes.length - 2] : null) ??
                    price;

  const changeAbs = price - prevClose;
  const changePct = prevClose !== 0 ? (changeAbs / prevClose) * 100 : 0;

  // day high/low from OHLCV arrays, fall back to meta
  const todayHigh = highs[highs.length - 1] ?? meta.regularMarketDayHigh ?? null;
  const todayLow  = lows[lows.length  - 1] ?? meta.regularMarketDayLow  ?? null;

  // 52w from meta
  const high52w = meta.fiftyTwoWeekHigh ?? null;
  const low52w  = meta.fiftyTwoWeekLow  ?? null;

  const marketName = meta.shortName || meta.longName ||
                     meta.exchangeName || symbol;

  return { symbol, marketName, price, prevClose, changeAbs, changePct,
           dayHigh: todayHigh, dayLow: todayLow, high52w, low52w };
}

/**
 * Upsert one record into MARKET_DATA.
 */
async function _upsertMarketData(d) {
  await db.execute(
    `MERGE INTO MARKET_DATA t
     USING (SELECT :1 AS SYM FROM DUAL) s ON (t.SYMBOL = s.SYM)
     WHEN MATCHED THEN UPDATE SET
       MARKET_NAME = :2, PRICE = :3, PREV_CLOSE = :4,
       CHANGE_ABS  = :5, CHANGE_PCT = :6,
       DAY_HIGH    = :7, DAY_LOW    = :8,
       HIGH_52W    = :9, LOW_52W    = :10,
       SOURCE = 'yahoo_finance', FETCHED_AT = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (SYMBOL, MARKET_NAME, ASSET_CLASS, PRICE, PREV_CLOSE,
               CHANGE_ABS, CHANGE_PCT, DAY_HIGH, DAY_LOW,
               HIGH_52W, LOW_52W, SOURCE)
       VALUES (:11, :12, 'index', :13, :14, :15, :16, :17, :18, :19, :20, 'yahoo_finance')`,
    [
      d.symbol, d.marketName, d.price, d.prevClose,
      d.changeAbs, d.changePct, d.dayHigh, d.dayLow, d.high52w, d.low52w,
      // NOT MATCHED values
      d.symbol, d.marketName, d.price, d.prevClose,
      d.changeAbs, d.changePct, d.dayHigh, d.dayLow, d.high52w, d.low52w,
    ],
    { autoCommit: true }
  );
}

/* ─── public API ─────────────────────────────────────────────────── */

/**
 * Fetch all AUTO_SYMBOLS from Yahoo Finance and store in MARKET_DATA.
 * Returns array of { symbol, ok, error? }.
 */
async function fetchAndStore() {
  const results = [];
  for (const sym of AUTO_SYMBOLS) {
    try {
      const data = await _fetchYahoo(sym);
      await _upsertMarketData(data);
      results.push({ symbol: sym, ok: true });
    } catch (e) {
      console.error('[marketDataService] fetch error', sym, e.message);
      results.push({ symbol: sym, ok: false, error: e.message });
    }
  }
  return results;
}

/**
 * Get latest snapshot from MARKET_DATA for all symbols (or specific list).
 */
async function getSnapshot(symbols) {
  let sql = `
    SELECT SYMBOL, MARKET_NAME, ASSET_CLASS, PRICE, PREV_CLOSE,
           CHANGE_ABS, CHANGE_PCT, DAY_HIGH, DAY_LOW, HIGH_52W, LOW_52W,
           SOURCE,
           TO_CHAR(FETCHED_AT, 'DD Mon YYYY HH24:MI:SS') AS FETCHED_FMT
      FROM MARKET_DATA
  `;
  const params = [];
  if (symbols && symbols.length > 0) {
    const placeholders = symbols.map((_, i) => `:${i + 1}`).join(', ');
    sql += ` WHERE SYMBOL IN (${placeholders})`;
    params.push(...symbols);
  }
  sql += ' ORDER BY SYMBOL';
  const r = await db.execute(sql, params);
  return r.rows || [];
}

/**
 * Call PROC_PUSH_MARKET_ALERTS to evaluate rules and create customer alerts.
 */
async function runMarketAlerts() {
  await db.execute('BEGIN PROC_PUSH_MARKET_ALERTS; END;');
}

/**
 * Full cycle: fetch → store → run alerts.
 * Returns { fetched, alerts: 'ok'|error }.
 */
async function refreshAll() {
  const fetched = await fetchAndStore();
  let alertsStatus = 'ok';
  try {
    await runMarketAlerts();
  } catch (e) {
    alertsStatus = e.message;
    console.error('[marketDataService] runMarketAlerts error:', e.message);
  }
  return { fetched, alertsStatus };
}

/**
 * Get all market alert rules.
 */
async function getRules() {
  const r = await db.execute(`
    SELECT RULE_ID, RULE_KEY, SYMBOL, RULE_TYPE, THRESHOLD_VALUE,
           SEVERITY_TRIGGER, SEVERITY_HIGH_THRESH,
           AFFECTED_CATEGORIES, ALERT_TITLE_TMPL, ALERT_MSG_TMPL,
           COOLDOWN_HOURS, IS_ACTIVE, UPDATED_BY,
           TO_CHAR(UPDATED_AT, 'DD Mon YYYY HH24:MI') AS UPDATED_FMT
      FROM MARKET_ALERT_RULES
     ORDER BY RULE_ID
  `);
  return r.rows || [];
}

/**
 * Update a market alert rule.
 */
async function updateRule(ruleKey, fields, updatedBy) {
  const allowed = ['THRESHOLD_VALUE', 'SEVERITY_HIGH_THRESH', 'COOLDOWN_HOURS',
                   'IS_ACTIVE', 'SEVERITY_TRIGGER', 'ALERT_TITLE_TMPL', 'ALERT_MSG_TMPL',
                   'AFFECTED_CATEGORIES'];
  const sets  = [];
  const vals  = [];
  let   idx   = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k.toUpperCase())) {
      sets.push(`${k.toUpperCase()} = :${idx++}`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return;
  sets.push(`UPDATED_BY = :${idx++}`, `UPDATED_AT = CURRENT_TIMESTAMP`);
  vals.push(updatedBy, ruleKey);

  const upd = await db.execute(
    `UPDATE MARKET_ALERT_RULES SET ${sets.join(', ')} WHERE RULE_KEY = :${idx}`,
    vals,
    { autoCommit: true }
  );
  return upd.rowsAffected || 0;
}

/**
 * Update BI Rate manually.
 */
async function updateBiRate(newRate, updatedBy) {
  const rate = parseFloat(newRate);
  if (isNaN(rate) || rate < 0 || rate > 30)
    throw new Error('BI Rate harus antara 0 dan 30');

  await db.execute(
    `MERGE INTO MARKET_DATA t
     USING (SELECT 'BI_RATE' AS SYM FROM DUAL) s ON (t.SYMBOL = s.SYM)
     WHEN MATCHED THEN UPDATE SET
       PREV_CLOSE = PRICE,
       CHANGE_ABS = :1 - PRICE,
       CHANGE_PCT = CASE WHEN PRICE > 0 THEN (:2 - PRICE) / PRICE * 100 ELSE 0 END,
       PRICE = :3,
       SOURCE = 'manual',
       FETCHED_AT = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (SYMBOL, MARKET_NAME, ASSET_CLASS, PRICE, PREV_CLOSE,
               CHANGE_ABS, CHANGE_PCT, SOURCE)
       VALUES ('BI_RATE', 'BI Rate', 'rate', :4, :5, 0, 0, 'manual')`,
    [rate, rate, rate, rate, rate],
    { autoCommit: true }
  );
  return rate;
}

module.exports = {
  fetchAndStore,
  getSnapshot,
  runMarketAlerts,
  refreshAll,
  getRules,
  updateRule,
  updateBiRate,
};
