'use strict';
/**
 * productManagementService.js
 * Manages add/remove product requests with an approval workflow.
 *
 * Approval thresholds (override via environment):
 *   PM_ADD_APPROVAL_THRESHOLD    = 500_000_000  (Rp 500M)
 *   PM_REMOVE_APPROVAL_THRESHOLD = 200_000_000  (Rp 200M)
 *
 * Status lifecycle:
 *   DIRECT (small) → immediate execution → EXECUTED
 *   LARGE          → PENDING_APPROVAL → APPROVED/REJECTED → EXECUTED
 */

const db       = require('../config/database');
const oracledb = require('oracledb');
const crypto   = require('crypto');

// Hardcoded env/const fallbacks (used when DB is unavailable)
const ADD_APPROVAL_THRESHOLD_DEFAULT    = parseInt(process.env.PM_ADD_APPROVAL_THRESHOLD    || '500000000', 10);
const REMOVE_APPROVAL_THRESHOLD_DEFAULT = parseInt(process.env.PM_REMOVE_APPROVAL_THRESHOLD || '200000000', 10);

// In-memory cache for DB-sourced thresholds (60-second TTL)
let _threshCache = null;
let _threshExpiry = 0;

async function _getThresholds() {
  if (_threshCache && Date.now() < _threshExpiry) return _threshCache;
  try {
    const r = await db.execute(
      `SELECT SETTING_KEY, SETTING_VALUE FROM SYSTEM_SETTINGS
        WHERE SETTING_KEY IN ('PM_ADD_APPROVAL_THRESHOLD','PM_REMOVE_APPROVAL_THRESHOLD')`,
    );
    const map = {};
    (r.rows || []).forEach(row => { map[row.SETTING_KEY] = parseInt(row.SETTING_VALUE, 10); });
    _threshCache = {
      add:    !isNaN(map.PM_ADD_APPROVAL_THRESHOLD)    ? map.PM_ADD_APPROVAL_THRESHOLD    : ADD_APPROVAL_THRESHOLD_DEFAULT,
      remove: !isNaN(map.PM_REMOVE_APPROVAL_THRESHOLD) ? map.PM_REMOVE_APPROVAL_THRESHOLD : REMOVE_APPROVAL_THRESHOLD_DEFAULT,
    };
    _threshExpiry = Date.now() + 60_000;
  } catch (_) {
    _threshCache  = { add: ADD_APPROVAL_THRESHOLD_DEFAULT, remove: REMOVE_APPROVAL_THRESHOLD_DEFAULT };
    _threshExpiry = Date.now() + 5_000; // retry sooner on DB error
  }
  return _threshCache;
}

function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')).toUpperCase();
}

const EXEC_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false };

// ---------------------------------------------------------------------------
// Threshold check — reads from SYSTEM_SETTINGS (cached 60s, env fallback)
// ---------------------------------------------------------------------------
async function needsApproval(action, amount) {
  const t = await _getThresholds();
  const v = Number(amount || 0);
  if (action === 'ADD')    return v >= t.add;
  if (action === 'REMOVE') return v >= t.remove;
  return false;
}

// ---------------------------------------------------------------------------
// Get customer's active holdings (joined with catalog for interest rate)
// ---------------------------------------------------------------------------
async function getPortfolio(customerId) {
  const rs = await db.execute(
    `SELECT cp.HOLDING_ID, cp.PRODUCT_ID, cp.PRODUCT_NAME, cp.CATEGORY,
            cp.AMOUNT, cp.INTEREST_RATE, cp.STATUS, cp.RETURN_PCT,
            TO_CHAR(cp.START_DATE,    'DD Mon YYYY') AS START_DATE_FMT,
            TO_CHAR(cp.MATURITY_DATE, 'DD Mon YYYY') AS MATURITY_DATE_FMT
       FROM CUSTOMER_PRODUCTS cp
      WHERE cp.CUSTOMER_ID = :1 AND UPPER(cp.STATUS) = 'ACTIVE'
      ORDER BY cp.AMOUNT DESC`,
    [customerId]
  );
  return rs.rows || [];
}

// ---------------------------------------------------------------------------
// Products from catalog NOT already held by the customer
// ---------------------------------------------------------------------------
async function getCatalog(customerId) {
  const rs = await db.execute(
    `SELECT pc.PRODUCT_ID, pc.PRODUCT_NAME, pc.CATEGORY,
            pc.INTEREST_RATE, pc.MIN_AMOUNT, pc.RISK_LEVEL
       FROM PRODUCT_CATALOG pc
      WHERE pc.IS_ACTIVE = 1
        AND pc.PRODUCT_ID NOT IN (
              SELECT cp.PRODUCT_ID
               FROM CUSTOMER_PRODUCTS cp
              WHERE cp.CUSTOMER_ID = :1
                 AND UPPER(cp.STATUS) = 'ACTIVE'
                 AND cp.PRODUCT_ID IS NOT NULL
            )
      ORDER BY pc.CATEGORY, pc.INTEREST_RATE DESC`,
    [customerId]
  );
  return rs.rows || [];
}

// ---------------------------------------------------------------------------
// Get a single holding with customer data (for AI impact warning)
// ---------------------------------------------------------------------------
async function getHoldingWithCustomer(holdingId) {
  const rs = await db.execute(
    `SELECT cp.HOLDING_ID, cp.PRODUCT_ID, cp.PRODUCT_NAME, cp.CATEGORY,
            cp.AMOUNT, cp.INTEREST_RATE, cp.RETURN_PCT,
            c.FULL_NAME, c.RISK_PROFILE, c.TOTAL_AUM, c.TIER, c.CUSTOMER_ID
       FROM CUSTOMER_PRODUCTS cp
       JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
      WHERE cp.HOLDING_ID = :1`,
    [holdingId]
  );
  return rs.rows?.[0] || null;
}

// ---------------------------------------------------------------------------
// Create a product change request.
// DIRECT execution (small amount) → change applied immediately.
// PENDING_APPROVAL (large) → queued for Branch Manager sign-off.
// Returns { requestId, status, needsApproval }
// ---------------------------------------------------------------------------
async function createRequest({ action, customerId, productId, holdingId,
                               productName, productCategory, amount,
                               source, historyId, requestedBy, notes }) {
  const requestId   = newId();
  const reqApproval = await needsApproval(action, Number(amount));
  const initStatus  = reqApproval ? 'PENDING_APPROVAL' : 'PENDING_EXECUTION';

  await db.transaction(async (conn) => {

    // ── Insert request record ─────────────────────────────────────────
    await conn.execute(
      `INSERT INTO PRODUCT_CHANGE_REQUESTS
         (REQUEST_ID, CUSTOMER_ID, HOLDING_ID, PRODUCT_ID, PRODUCT_NAME, PRODUCT_CATEGORY,
          ACTION, STATUS, AMOUNT, SOURCE, HISTORY_ID, REQUESTED_BY, NOTES)
       VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13)`,
      [requestId, customerId, holdingId || null, productId || null,
       productName || null, productCategory || null,
       action, initStatus, Number(amount) || null,
       source || 'MANUAL', historyId || null, requestedBy, notes || null],
      EXEC_OPTS
    );

    if (!reqApproval) {
      // ── Execute immediately ─────────────────────────────────────────
      if (action === 'ADD' && productId) {
        // Fetch product details if missing
        let pName = productName, pCat = productCategory, pRate = null;
        if (!pName || !pCat) {
          const pr = await conn.execute(
            'SELECT PRODUCT_NAME, CATEGORY, INTEREST_RATE FROM PRODUCT_CATALOG WHERE PRODUCT_ID = :1',
            [productId], EXEC_OPTS
          );
          const p = pr.rows?.[0];
          if (p) { pName = p.PRODUCT_NAME; pCat = p.CATEGORY; pRate = p.INTEREST_RATE; }
        }

        // Insert into CUSTOMER_PRODUCTS
        await conn.execute(
          `INSERT INTO CUSTOMER_PRODUCTS
             (CUSTOMER_ID, PRODUCT_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, START_DATE, STATUS)
           VALUES (:1, :2, :3, :4, :5, :6, TRUNC(SYSDATE), 'Active')`,
          [customerId, productId, pName, pCat, Number(amount), pRate || null],
          EXEC_OPTS
        );

        // Get the new HOLDING_ID (visible within same session before commit)
        const hr = await conn.execute(
          `SELECT MAX(HOLDING_ID) AS NEW_ID FROM CUSTOMER_PRODUCTS
            WHERE CUSTOMER_ID = :1 AND PRODUCT_ID = :2 AND UPPER(STATUS) = 'ACTIVE'`,
          [customerId, productId], EXEC_OPTS
        );
        const newHoldingId = hr.rows?.[0]?.NEW_ID;

        // Mark request as EXECUTED
        await conn.execute(
          `UPDATE PRODUCT_CHANGE_REQUESTS
             SET STATUS = 'EXECUTED', HOLDING_ID = :1, UPDATED_AT = CURRENT_TIMESTAMP
           WHERE REQUEST_ID = :2`,
          [newHoldingId || null, requestId], EXEC_OPTS
        );

      } else if (action === 'REMOVE' && holdingId) {
        // Redeem the holding
        await conn.execute(
          `UPDATE CUSTOMER_PRODUCTS
             SET STATUS = 'Redeemed', UPDATED_AT = CURRENT_TIMESTAMP
           WHERE HOLDING_ID = :1`,
          [holdingId], EXEC_OPTS
        );

        // Mark request as EXECUTED
        await conn.execute(
          `UPDATE PRODUCT_CHANGE_REQUESTS
             SET STATUS = 'EXECUTED', UPDATED_AT = CURRENT_TIMESTAMP
           WHERE REQUEST_ID = :1`,
          [requestId], EXEC_OPTS
        );
      }
    }
  });

  return {
    requestId,
    needsApproval: reqApproval,
    status: reqApproval ? 'PENDING_APPROVAL' : 'EXECUTED',
  };
}

// ---------------------------------------------------------------------------
// Approve a pending request — execute the change and mark EXECUTED.
// Only Branch Managers should call this.
// ---------------------------------------------------------------------------
async function approveRequest(requestId, approverId, managerNotes) {
  await db.transaction(async (conn) => {
    // Load the request
    const rr = await conn.execute(
      `SELECT ACTION, CUSTOMER_ID, HOLDING_ID, PRODUCT_ID, PRODUCT_NAME,
              PRODUCT_CATEGORY, AMOUNT, STATUS
         FROM PRODUCT_CHANGE_REQUESTS WHERE REQUEST_ID = :1`,
      [requestId], EXEC_OPTS
    );
    const req = rr.rows?.[0];
    if (!req) throw new Error('Request not found');
    if (req.STATUS !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot approve — request status is '${req.STATUS}'`);
    }

    // Execute the change
    if (req.ACTION === 'ADD' && req.PRODUCT_ID) {
      const pr = await conn.execute(
        'SELECT INTEREST_RATE FROM PRODUCT_CATALOG WHERE PRODUCT_ID = :1',
        [req.PRODUCT_ID], EXEC_OPTS
      );
      const pRate = pr.rows?.[0]?.INTEREST_RATE || null;

      await conn.execute(
        `INSERT INTO CUSTOMER_PRODUCTS
           (CUSTOMER_ID, PRODUCT_ID, PRODUCT_NAME, CATEGORY, AMOUNT, INTEREST_RATE, START_DATE, STATUS)
         VALUES (:1, :2, :3, :4, :5, :6, TRUNC(SYSDATE), 'Active')`,
        [req.CUSTOMER_ID, req.PRODUCT_ID, req.PRODUCT_NAME,
         req.PRODUCT_CATEGORY, req.AMOUNT, pRate],
        EXEC_OPTS
      );
    } else if (req.ACTION === 'REMOVE' && req.HOLDING_ID) {
      await conn.execute(
        `UPDATE CUSTOMER_PRODUCTS
           SET STATUS = 'Redeemed', UPDATED_AT = CURRENT_TIMESTAMP
         WHERE HOLDING_ID = :1`,
        [req.HOLDING_ID], EXEC_OPTS
      );
    }

    // Mark request as EXECUTED
    await conn.execute(
      `UPDATE PRODUCT_CHANGE_REQUESTS
         SET STATUS = 'EXECUTED', APPROVED_BY = :1, MANAGER_NOTES = :2, UPDATED_AT = CURRENT_TIMESTAMP
       WHERE REQUEST_ID = :3`,
      [approverId, managerNotes || null, requestId], EXEC_OPTS
    );
  });
  return true;
}

// ---------------------------------------------------------------------------
// Reject a pending request.
// ---------------------------------------------------------------------------
async function rejectRequest(requestId, approverId, reason, managerNotes) {
  const rs = await db.execute(
    `UPDATE PRODUCT_CHANGE_REQUESTS
       SET STATUS = 'REJECTED', APPROVED_BY = :1, REJECTION_REASON = :2,
           MANAGER_NOTES = :3, UPDATED_AT = CURRENT_TIMESTAMP
     WHERE REQUEST_ID = :4 AND STATUS = 'PENDING_APPROVAL'`,
    [approverId, reason || null, managerNotes || reason || null, requestId],
    { autoCommit: true }
  );
  if ((rs.rowsAffected || 0) === 0) throw new Error('Request not found or not in PENDING_APPROVAL status');
  return true;
}

// ---------------------------------------------------------------------------
// List requests (RM sees own; Manager sees all pending + own).
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  PENDING_EXECUTION: '⏳ Dalam Proses',
  PENDING_APPROVAL:  '⏳ Menunggu Persetujuan',
  APPROVED:          '✅ Disetujui',
  REJECTED:          '❌ Ditolak',
  EXECUTED:          '✅ Dieksekusi',
  CANCELLED:         '🚫 Dibatalkan',
};

async function getRequests({ userId, role, customerId, limit = 30 }) {
  const isManager = (role || '').toLowerCase().includes('manager');
  const binds     = [];
  let   where     = '';
  let   p         = 1;

  if (customerId) {
    where += ` AND pcr.CUSTOMER_ID = :${p++}`;
    binds.push(customerId);
  }

  if (isManager) {
    // Manager: all requests (full visibility for approval management & audit history)
    // No additional WHERE restriction — frontend filter handles status/action filtering
  } else {
    // RM: own requests only
    where += ` AND pcr.REQUESTED_BY = :${p++}`;
    binds.push(userId);
  }

  binds.push(Math.min(limit, 100));

  const rs = await db.execute(
    `SELECT pcr.REQUEST_ID, pcr.CUSTOMER_ID, pcr.PRODUCT_NAME, pcr.PRODUCT_CATEGORY,
            pcr.ACTION, pcr.STATUS, pcr.AMOUNT, pcr.SOURCE, pcr.REQUESTED_BY,
            pcr.APPROVED_BY, pcr.REJECTION_REASON, pcr.MANAGER_NOTES, pcr.NOTES,
            TO_CHAR(pcr.REQUESTED_AT, 'DD Mon YYYY HH24:MI') AS REQ_DATE,
            TO_CHAR(pcr.UPDATED_AT,   'DD Mon YYYY HH24:MI') AS UPDATED_DATE,
            c.FULL_NAME AS CUSTOMER_NAME,
            u.FULL_NAME AS REQUESTED_BY_NAME
       FROM PRODUCT_CHANGE_REQUESTS pcr
       JOIN CUSTOMERS c ON pcr.CUSTOMER_ID = c.CUSTOMER_ID
  LEFT JOIN RM_USERS u ON pcr.REQUESTED_BY = u.USER_ID
      WHERE 1=1 ${where}
      ORDER BY pcr.REQUESTED_AT DESC
      FETCH FIRST :${p} ROWS ONLY`,
    binds
  );

  return (rs.rows || []).map(r => ({
    ...r,
    STATUS_LABEL: STATUS_LABELS[r.STATUS] || r.STATUS,
  }));
}

// ---------------------------------------------------------------------------
// Get a single request by ID (manager scope — no user filtering).
// ---------------------------------------------------------------------------
async function getRequestById(requestId) {
  const rs = await db.execute(
    `SELECT pcr.REQUEST_ID, pcr.CUSTOMER_ID, pcr.PRODUCT_NAME, pcr.PRODUCT_CATEGORY,
            pcr.ACTION, pcr.STATUS, pcr.AMOUNT, pcr.SOURCE, pcr.REQUESTED_BY,
            pcr.APPROVED_BY, pcr.REJECTION_REASON, pcr.MANAGER_NOTES, pcr.NOTES,
            TO_CHAR(pcr.REQUESTED_AT, 'DD Mon YYYY HH24:MI') AS REQ_DATE,
            c.FULL_NAME AS CUSTOMER_NAME,
            u.FULL_NAME AS REQUESTED_BY_NAME
       FROM PRODUCT_CHANGE_REQUESTS pcr
       JOIN CUSTOMERS c ON pcr.CUSTOMER_ID = c.CUSTOMER_ID
  LEFT JOIN RM_USERS u ON pcr.REQUESTED_BY = u.USER_ID
      WHERE pcr.REQUEST_ID = :1`,
    [requestId]
  );
  return rs.rows?.[0] || null;
}

// ---------------------------------------------------------------------------
// Generate an AI-drafted manager approval/rejection note (non-streaming).
// Returns prompt text for the caller to stream via llm.chatStream.
// ---------------------------------------------------------------------------
function buildManagerNotePrompt(req, action) {
  const actionLabel = action === 'APPROVE' ? 'MENYETUJUI' : 'MENOLAK';
  const amt = Number(req.AMOUNT || 0).toLocaleString('id-ID');
  return `
Anda adalah Branch Manager di Bank Danamon. Buatkan catatan resmi yang singkat (3-4 kalimat) untuk ${actionLabel} permintaan berikut:

**Detail Permintaan:**
- Tindakan: ${req.ACTION === 'ADD' ? 'Penambahan Produk' : 'Penghapusan Produk'}
- Produk: ${req.PRODUCT_NAME || '—'} (${req.PRODUCT_CATEGORY || '—'})
- Nasabah: ${req.CUSTOMER_NAME || req.CUSTOMER_ID}
- Nominal: Rp ${amt}
- Diajukan oleh: ${req.REQUESTED_BY_NAME || req.REQUESTED_BY}
- Tanggal pengajuan: ${req.REQ_DATE || '—'}
${req.NOTES ? `- Catatan RM: ${req.NOTES}` : ''}

${action === 'APPROVE'
  ? 'Buat catatan persetujuan yang profesional, mencakup: alasan persetujuan, ekspektasi hasil, dan instruksi pelaksanaan jika ada.'
  : 'Buat catatan penolakan yang profesional, mencakup: alasan penolakan, risiko yang teridentifikasi, dan saran alternatif untuk RM.'
}

Gunakan bahasa Indonesia yang formal dan profesional. Langsung tulis teksnya tanpa header.
  `.trim();
}

// ---------------------------------------------------------------------------
// Generate quarterly profit forecast using LLM.
// Returns forecast data object — does NOT save to DB.
// ---------------------------------------------------------------------------
async function generateForecast(customerId, productId, amount) {
  let llm;
  try {
    llm = require('./llmService');
  } catch (e) {
    throw new Error('LLM service unavailable: ' + e.message);
  }

  // Fetch product + customer data in parallel
  const [productRow, custRow] = await Promise.all([
    db.execute(
      'SELECT PRODUCT_NAME, CATEGORY, INTEREST_RATE, RISK_LEVEL FROM PRODUCT_CATALOG WHERE PRODUCT_ID = :1',
      [productId]
    ).then(r => r.rows?.[0]),
    db.execute(
      'SELECT FULL_NAME, RISK_PROFILE, TIER FROM CUSTOMERS WHERE CUSTOMER_ID = :1',
      [customerId]
    ).then(r => r.rows?.[0]),
  ]);

  if (!productRow) throw new Error(`Product ${productId} not found`);
  if (!custRow)    throw new Error(`Customer ${customerId} not found`);

  const invAmount = Number(amount || 0);
  const rate      = Number(productRow.INTEREST_RATE || 0);
  const now       = new Date();
  const yr        = now.getFullYear();
  const nextYr    = yr + 1;

  const qLabels = [
    `Q1 ${yr} (Jan–Mar)`,
    `Q2 ${yr} (Apr–Jun)`,
    `Q3 ${yr} (Jul–Sep)`,
    `Q4 ${yr} (Okt–Des)`,
  ];

  // If current month > Q1, shift quarters to next period
  const m = now.getMonth(); // 0-based
  if (m >= 3)  qLabels[0] = `Q2 ${yr} (Apr–Jun)`;
  if (m >= 6)  qLabels[1] = `Q3 ${yr} (Jul–Sep)`;
  if (m >= 9)  qLabels[2] = `Q4 ${yr} (Okt–Des)`;
  if (m >= 3)  qLabels[3] = `Q1 ${nextYr} (Jan–Mar)`;

  const prompt = `
Anda adalah analis investasi senior. Buat proyeksi keuntungan quarterly untuk produk investasi berikut.

Detail Produk:
- Produk: ${productRow.PRODUCT_NAME}
- Kategori: ${productRow.CATEGORY}
- Imbal hasil tercatat: ${rate}% per tahun
- Profil risiko produk: ${productRow.RISK_LEVEL || 'medium'}
- Nominal investasi: Rp ${invAmount.toLocaleString('id-ID')}

Profil Nasabah:
- Profil risiko: ${custRow.RISK_PROFILE}
- Tier: ${custRow.TIER}

Proyeksikan return (keuntungan dalam Rupiah) untuk 4 kuartal berikut:
- ${qLabels[0]}
- ${qLabels[1]}
- ${qLabels[2]}
- ${qLabels[3]}

Pertimbangkan kondisi pasar Indonesia saat ini, suku bunga BI, dan tren sektor terkait.

PENTING: Kembalikan HANYA JSON berikut tanpa teks tambahan, tanpa code block:
{"q1_return":ANGKA,"q2_return":ANGKA,"q3_return":ANGKA,"q4_return":ANGKA,"q1_label":"${qLabels[0]}","q2_label":"${qLabels[1]}","q3_label":"${qLabels[2]}","q4_label":"${qLabels[3]}","annual_return":ANGKA,"narrative":"Analisis pasar singkat 2-3 kalimat."}

Semua nilai ANGKA adalah integer Rupiah (contoh: 1875000). annual_return = q1+q2+q3+q4.
  `.trim();

  const responseText = await llm.chat(
    prompt, '', [],
    { temperature: 0.15, maxTokens: 600 }
  );

  // Parse JSON — strip any markdown fencing the LLM might add
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // Fallback: extract first JSON object from text
    const m2 = responseText.match(/\{[\s\S]*\}/);
    if (!m2) {
      // LLM failed to return JSON — compute simple projections ourselves
      const qReturn = Math.round(invAmount * (rate / 100) / 4);
      parsed = {
        q1_return: qReturn, q2_return: qReturn, q3_return: qReturn, q4_return: qReturn,
        q1_label: qLabels[0], q2_label: qLabels[1], q3_label: qLabels[2], q4_label: qLabels[3],
        annual_return: qReturn * 4,
        narrative: `Proyeksi berdasarkan imbal hasil ${rate}% p.a. (flat quarterly).`,
      };
    } else {
      parsed = JSON.parse(m2[0]);
    }
  }

  return {
    q1_return:    Number(parsed.q1_return    || 0),
    q2_return:    Number(parsed.q2_return    || 0),
    q3_return:    Number(parsed.q3_return    || 0),
    q4_return:    Number(parsed.q4_return    || 0),
    q1_label:     parsed.q1_label || qLabels[0],
    q2_label:     parsed.q2_label || qLabels[1],
    q3_label:     parsed.q3_label || qLabels[2],
    q4_label:     parsed.q4_label || qLabels[3],
    annual_return: Number(parsed.annual_return || 0),
    narrative:    String(parsed.narrative || ''),
    product_name: productRow.PRODUCT_NAME,
  };
}

// ---------------------------------------------------------------------------
// Portfolio-level quarterly forecast — full algorithm (#1–#7, #5, #6, #9):
//   #1  Monthly compound for Reksa Dana
//   #2  Maturity-date cutoff for Deposito
//   #3  PPh Final 20% on Deposito → net_cumulative
//   #4  Actual-day proration (not fixed q/4)
//   #5  Authoritative rate from PRODUCT_CATALOG for Reksa Dana
//   #6  Scenario band (optimistic / base / pessimistic) per Reksa Dana sub-type
//   #7  Maturity date ISO for chart marker
//   #9  Post-maturity reinvestment line (auto-rollover assumption)
// ---------------------------------------------------------------------------
async function getPortfolioForecast(customerId) {
  // #5 — JOIN PRODUCT_CATALOG for authoritative rate on Reksa Dana
  const rs = await db.execute(
    `SELECT cp.HOLDING_ID, cp.PRODUCT_ID, cp.PRODUCT_NAME, cp.CATEGORY,
            cp.AMOUNT, cp.INTEREST_RATE, cp.RETURN_PCT, cp.STATUS,
            cp.START_DATE, cp.MATURITY_DATE,
            NVL(pc.INTEREST_RATE, 0) AS CATALOG_RATE,
            NVL(pc.RISK_LEVEL, 'medium') AS RISK_LEVEL
       FROM CUSTOMER_PRODUCTS cp
       LEFT JOIN PRODUCT_CATALOG pc ON cp.PRODUCT_ID = pc.PRODUCT_ID
      WHERE cp.CUSTOMER_ID = :1 AND UPPER(cp.STATUS) = 'ACTIVE'
      ORDER BY cp.AMOUNT DESC`,
    [customerId]
  );
  const holdings = rs.rows || [];
  if (!holdings.length) return { quarters: [], quarterEnds: [], products: [], total: [], total_net: [] };

  const now = new Date(); now.setHours(0,0,0,0);
  const MS_DAY = 86400000, AVG_DAYS_MO = 30.4375;

  // Category predicates
  const isDeposito = cat => /deposito/i.test(cat || '');
  const isMF       = cat => /reksa\s*dana/i.test(cat || '');
  const isEquityMF = cat => /reksa\s*dana\s*saham|equity/i.test(cat || '');
  const isBondMF   = cat => /reksa\s*dana\s*pend/i.test(cat || '');
  const isMonyMktMF= cat => /reksa\s*dana\s*pasar/i.test(cat || '');

  // #6 — Scenario band multipliers per Reksa Dana sub-type
  const BAND = {
    equity:   { hi: 1.40, lo: 0.50 },   // Saham: wide range
    bond:     { hi: 1.15, lo: 0.85 },   // Pendapatan Tetap: narrow
    moneyMkt: { hi: 1.05, lo: 0.95 },   // Pasar Uang: very stable
    mfOther:  { hi: 1.25, lo: 0.70 },   // Other MF
  };

  // Build 4 quarter-end dates
  const quarterEndDates = [], qLabels = [];
  for (let i = 1; i <= 4; i++) {
    const d = new Date(now); d.setMonth(d.getMonth() + i * 3);
    quarterEndDates.push(d);
    qLabels.push(`Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`);
  }

  const products = holdings.map(h => {
    const amount   = Number(h.AMOUNT || 0);
    const category = h.CATEGORY || '';
    const dep      = isDeposito(category);
    const mf       = isMF(category);
    const equity   = isEquityMF(category);
    const bond     = isBondMF(category);
    const moneyMkt = isMonyMktMF(category);

    // #5 — Use PRODUCT_CATALOG rate for Reksa Dana when holding rate is missing/zero
    const holdingRate = Number(h.INTEREST_RATE || h.RETURN_PCT || 0);
    const catalogRate = Number(h.CATALOG_RATE  || 0);
    const rate = (mf && holdingRate === 0 && catalogRate > 0) ? catalogRate : holdingRate;

    const toDate      = v => (v instanceof Date ? v : (v ? new Date(v) : null));
    const matDate     = toDate(h.MATURITY_DATE);
    const taxRate     = dep ? 0.20 : 0;
    const monthlyRate = rate / 100 / 12;

    // Base cumulative (#1 compound + #2 maturity cap + #3 PPh + #4 proration)
    const cumulative = [], net_cumulative = [];
    quarterEndDates.forEach(qEnd => {
      const effectiveEnd = (dep && matDate && matDate < qEnd) ? matDate : qEnd;
      const daysFromNow  = Math.max(0, (effectiveEnd.getTime() - now.getTime()) / MS_DAY);
      const gross = Math.max(0, mf
        ? Math.round(amount * (Math.pow(1 + monthlyRate, daysFromNow / AVG_DAYS_MO) - 1))
        : Math.round(amount * (rate / 100) * (daysFromNow / 365)));
      cumulative.push(gross);
      net_cumulative.push(Math.round(gross * (1 - taxRate)));
    });

    // #6 — Scenario bands (Reksa Dana only)
    const bandMul = equity ? BAND.equity : bond ? BAND.bond : moneyMkt ? BAND.moneyMkt : mf ? BAND.mfOther : null;
    const cumulative_high = bandMul ? cumulative.map(v => Math.round(v * bandMul.hi)) : null;
    const cumulative_low  = bandMul ? cumulative.map(v => Math.round(v * bandMul.lo)) : null;

    // #9 — Post-maturity reinvestment for Deposito (auto-rollover, full days/365)
    const reinvest_cumulative = (dep && matDate) ? quarterEndDates.map(qEnd => {
      const days = Math.max(0, (qEnd.getTime() - now.getTime()) / MS_DAY);
      return Math.round(amount * (rate / 100) * (days / 365));
    }) : null;

    return {
      holdingId: h.HOLDING_ID,
      name:      h.PRODUCT_NAME || 'Produk',
      category,  amount, rate, taxRate,
      riskLevel:           h.RISK_LEVEL || 'medium',
      maturityDate:        matDate ? matDate.toISOString().slice(0,10) : null,
      isDeposito: dep, isMF: mf, isEquity: equity, isBond: bond, isMoneyMkt: moneyMkt,
      cumulative, net_cumulative,
      cumulative_high, cumulative_low,
      reinvest_cumulative,
      hasScenario: !!bandMul,
      hasReinvest: dep && !!matDate,
    };
  });

  const total     = [0,1,2,3].map(qi => products.reduce((s,p) => s+(p.cumulative[qi]||0), 0));
  const total_net = [0,1,2,3].map(qi => products.reduce((s,p) => s+(p.net_cumulative[qi]||0), 0));

  return {
    quarters: qLabels,
    quarterEnds: quarterEndDates.map(d => d.toISOString().slice(0,10)),
    products, total, total_net,
  };
}

// ---------------------------------------------------------------------------
// Save a forecast to PRODUCT_FORECASTS table.
// ---------------------------------------------------------------------------
async function saveForecast(requestId, customerId, productId, data) {
  const model = process.env.OCI_GENAI_LLM_MODEL || 'cohere.command-r-plus';
  await db.execute(
    `INSERT INTO PRODUCT_FORECASTS
       (REQUEST_ID, CUSTOMER_ID, PRODUCT_ID,
        Q1_RETURN, Q2_RETURN, Q3_RETURN, Q4_RETURN,
        Q1_LABEL, Q2_LABEL, Q3_LABEL, Q4_LABEL,
        ANNUAL_RETURN, NARRATIVE, MODEL_USED)
     VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14)`,
    [
      requestId, customerId || null, productId || null,
      data.q1_return, data.q2_return, data.q3_return, data.q4_return,
      data.q1_label,  data.q2_label,  data.q3_label,  data.q4_label,
      data.annual_return,
      { val: data.narrative || '', type: oracledb.CLOB },
      model,
    ],
    { autoCommit: true }
  );
}

// ---------------------------------------------------------------------------
// Get a saved forecast by requestId.
// ---------------------------------------------------------------------------
async function getForecast(requestId) {
  const rs = await db.execute(
    `SELECT * FROM PRODUCT_FORECASTS
      WHERE REQUEST_ID = :1
      ORDER BY CREATED_AT DESC
      FETCH FIRST 1 ROW ONLY`,
    [requestId]
  );
  return rs.rows?.[0] || null;
}

module.exports = {
  getPortfolio,
  getCatalog,
  getHoldingWithCustomer,
  needsApproval,
  createRequest,
  approveRequest,
  rejectRequest,
  getRequests,
  getRequestById,
  generateForecast,
  getPortfolioForecast,
  saveForecast,
  getForecast,
  buildManagerNotePrompt,
};
