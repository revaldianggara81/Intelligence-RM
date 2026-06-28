'use strict';
const db    = require('../config/database');
const embed = require('./embeddingService');
const goalSvc = require('./goalService');

/** List customers for an RM with summary stats */
async function listByRM(rmUserId) {
  const sql2 = `
    SELECT
      c.CUSTOMER_ID, c.FULL_NAME, c.INITIALS, c.AVATAR_COLOR,
      c.AGE, c.GENDER, c.RISK_PROFILE, c.TIER, c.TIER_LABEL,
      c.MONTHLY_INCOME, c.TOTAL_AUM, c.KYC_STATUS, c.KYC_EXPIRY,
      c.EMAIL, c.PHONE, c.NOTES, c.UPDATED_AT,
      NVL((SELECT COUNT(*) FROM ALERTS a
            WHERE a.CUSTOMER_ID = c.CUSTOMER_ID AND a.STATUS = 'Open'),0) AS OPEN_ALERTS,
      NVL((SELECT COUNT(*) FROM CUSTOMER_PRODUCTS cp
            WHERE cp.CUSTOMER_ID = c.CUSTOMER_ID AND UPPER(cp.STATUS) = 'ACTIVE'),0) AS PRODUCT_COUNT
    FROM CUSTOMERS c
    WHERE c.RM_USER_ID = :1
    ORDER BY c.TOTAL_AUM DESC NULLS LAST
  `;
  const result = await db.execute(sql2, [rmUserId]);
  return result.rows || [];
}

/** Get full customer profile (360 view) */
async function getById(customerId) {
  // Customer base info
  const custResult = await db.execute(
    `SELECT c.*,
            u.FULL_NAME AS RM_NAME, u.EMAIL AS RM_EMAIL
       FROM CUSTOMERS c
       LEFT JOIN RM_USERS u ON c.RM_USER_ID = u.USER_ID
      WHERE c.CUSTOMER_ID = :1`,
    [customerId]
  );
  if (!custResult.rows || custResult.rows.length === 0) return null;
  const customer = custResult.rows[0];

  // Holdings (Active only)
  const holdResult = await db.execute(
    `SELECT cp.*, pc.DESCRIPTION AS PRODUCT_DESC, pc.FEATURES
       FROM CUSTOMER_PRODUCTS cp
       LEFT JOIN PRODUCT_CATALOG pc ON cp.PRODUCT_ID = pc.PRODUCT_ID
      WHERE cp.CUSTOMER_ID = :1 AND UPPER(cp.STATUS) = 'ACTIVE'
      ORDER BY cp.AMOUNT DESC`,
    [customerId]
  );
  customer.HOLDINGS = holdResult.rows || [];

  // Alerts (open only)
  const alertResult = await db.execute(
    `SELECT * FROM ALERTS
      WHERE CUSTOMER_ID = :1 AND STATUS = 'Open'
      ORDER BY TRIGGERED_AT DESC`,
    [customerId]
  );
  customer.ALERTS = alertResult.rows || [];

  // Recent meeting notes (last 5)
  const notesResult = await db.execute(
    `SELECT mn.*, u.FULL_NAME AS RM_NAME
       FROM MEETING_NOTES mn
       LEFT JOIN RM_USERS u ON mn.RM_USER_ID = u.USER_ID
      WHERE mn.CUSTOMER_ID = :1
      ORDER BY mn.MEETING_DATE DESC
      FETCH FIRST 5 ROWS ONLY`,
    [customerId]
  );
  customer.MEETING_NOTES = notesResult.rows || [];

  // Campaign eligibility
  const campResult = await db.execute(
    `SELECT ce.*, c.NAME AS CAMPAIGN_NAME, c.TYPE AS CAMPAIGN_TYPE, c.END_DATE
       FROM CAMPAIGN_ELIGIBILITY ce
       JOIN CAMPAIGNS c ON ce.CAMPAIGN_ID = c.CAMPAIGN_ID
      WHERE ce.CUSTOMER_ID = :1 AND c.STATUS = 'ACTIVE'
      ORDER BY ce.SCANNED_AT DESC`,
    [customerId]
  );
  customer.CAMPAIGNS = campResult.rows || [];

  // Financial goals
  customer.GOALS = await goalSvc.getCustomerGoals(customerId);

  // Income sources (for C360 profile card)
  try {
    const incResult = await db.execute(
      `SELECT INCOME_ID, SOURCE_NAME, SOURCE_TYPE, AMOUNT, UNIT_COUNT, ICON, SORT_ORDER
         FROM CUSTOMER_INCOME_SOURCES
        WHERE CUSTOMER_ID = :1 AND IS_ACTIVE = 1
        ORDER BY SORT_ORDER`,
      [customerId]
    );
    customer.INCOME_SOURCES = incResult.rows || [];
  } catch (_) { customer.INCOME_SOURCES = []; }

  // Credit card (primary card for C360 summary)
  try {
    const ccResult = await db.execute(
      `SELECT CARD_ID, CARD_NUMBER_MASKED, CARD_TYPE, CARD_BRAND,
              CREDIT_LIMIT, OUTSTANDING, MIN_PAYMENT,
              PAYMENT_STATUS, MISSED_MONTH,
              TO_CHAR(LAST_PAYMENT_DATE,'DD Mon YYYY') AS LAST_PAYMENT_FMT,
              DUE_DATE,
              TO_CHAR(ISSUED_DATE,'DD Mon YYYY') AS ISSUED_DATE_FMT
         FROM CREDIT_CARDS
        WHERE CUSTOMER_ID = :1 AND IS_ACTIVE = 1
        ORDER BY ISSUED_DATE DESC
        FETCH FIRST 5 ROWS ONLY`,
      [customerId]
    );
    customer.CREDIT_CARDS = ccResult.rows || [];
    customer.CREDIT_CARD = customer.CREDIT_CARDS[0] || null;
  } catch (_) {
    customer.CREDIT_CARDS = [];
    customer.CREDIT_CARD = null;
  }

  // Credit card payment history (all active cards for this customer)
  try {
    const ccPayResult = await db.execute(
      `SELECT p.PAYMENT_ID, p.CARD_ID, p.CUSTOMER_ID,
              cc.CARD_NUMBER_MASKED, cc.CARD_BRAND,
              p.STATEMENT_MONTH,
              TO_CHAR(p.DUE_DATE,'DD Mon YYYY') AS DUE_DATE_FMT,
              TO_CHAR(p.PAYMENT_DATE,'DD Mon YYYY') AS PAYMENT_DATE_FMT,
              p.AMOUNT_DUE, p.MIN_PAYMENT, p.PAID_AMOUNT,
              p.PAYMENT_STATUS, p.PAYMENT_CHANNEL, p.LATE_FEE
         FROM CREDIT_CARD_PAYMENTS p
         JOIN CREDIT_CARDS cc ON cc.CARD_ID = p.CARD_ID
        WHERE p.CUSTOMER_ID = :1
        ORDER BY p.DUE_DATE DESC`,
      [customerId]
    );
    customer.CREDIT_CARD_PAYMENTS = ccPayResult.rows || [];
  } catch (_) { customer.CREDIT_CARD_PAYMENTS = []; }

  // Deposit payment schedule for active deposito holdings
  try {
    const depPayResult = await db.execute(
      `SELECT PAYMENT_ID, CUSTOMER_ID, HOLDING_ID, PRODUCT_NAME,
              PAYMENT_TYPE,
              TO_CHAR(PAYMENT_DATE,'DD Mon YYYY') AS PAYMENT_DATE_FMT,
              PRINCIPAL_AMOUNT, INTEREST_AMOUNT, PAYMENT_AMOUNT,
              PAYMENT_STATUS, PAYMENT_CHANNEL, NOTES
         FROM DEPOSIT_PAYMENT_SCHEDULE
        WHERE CUSTOMER_ID = :1
        ORDER BY PAYMENT_DATE DESC, PAYMENT_ID DESC`,
      [customerId]
    );
    customer.DEPOSIT_PAYMENTS = depPayResult.rows || [];
  } catch (_) { customer.DEPOSIT_PAYMENTS = []; }

  // Personal assets
  try {
    const assetResult = await db.execute(
      `SELECT ASSET_ID, CUSTOMER_ID, ASSET_TYPE, ASSET_NAME, LOCATION,
              OWNERSHIP_STATUS, ESTIMATED_VALUE, ACQUISITION_YEAR,
              IS_COLLATERAL, NOTES
         FROM CUSTOMER_ASSETS
        WHERE CUSTOMER_ID = :1 AND IS_ACTIVE = 1
        ORDER BY
          CASE ASSET_TYPE WHEN 'HOUSE' THEN 1 WHEN 'APARTMENT' THEN 2 WHEN 'CAR' THEN 3 ELSE 4 END,
          ESTIMATED_VALUE DESC`,
      [customerId]
    );
    customer.ASSETS = assetResult.rows || [];
    customer.ASSET_SUMMARY = customer.ASSETS.reduce((acc, a) => {
      const type = a.ASSET_TYPE || 'OTHER';
      const value = Number(a.ESTIMATED_VALUE || 0);
      acc.TOTAL_VALUE += value;
      acc.COUNT += 1;
      acc.BY_TYPE[type] = (acc.BY_TYPE[type] || 0) + value;
      return acc;
    }, { TOTAL_VALUE: 0, COUNT: 0, BY_TYPE: {} });
  } catch (_) {
    customer.ASSETS = [];
    customer.ASSET_SUMMARY = { TOTAL_VALUE: 0, COUNT: 0, BY_TYPE: {} };
  }

  // Deposito summary (earliest maturity of active deposito holdings)
  const depositoHoldings = (customer.HOLDINGS || []).filter(h =>
    (h.CATEGORY || '').toUpperCase() === 'DEPOSITO' &&
    (h.STATUS  || '').toUpperCase() === 'ACTIVE'
  );
  if (depositoHoldings.length > 0) {
    const sorted = depositoHoldings
      .filter(h => h.MATURITY_DATE)
      .sort((a, b) => new Date(a.MATURITY_DATE) - new Date(b.MATURITY_DATE));
    customer.DEPOSITO_SUMMARY = {
      TOTAL_BALANCE: depositoHoldings.reduce((s, h) => s + (h.AMOUNT || 0), 0),
      EARLIEST_MATURITY: sorted[0]?.MATURITY_DATE || null,
      EARLIEST_MATURITY_NAME: sorted[0]?.PRODUCT_NAME || null,
      COUNT: depositoHoldings.length,
    };
  } else {
    customer.DEPOSITO_SUMMARY = null;
  }

  return customer;
}

/** Search customers by name or email */
async function search(query, rmUserId) {
  const likeQ = `%${query.toUpperCase()}%`;
  const result = await db.execute(
    `SELECT CUSTOMER_ID, FULL_NAME, INITIALS, AVATAR_COLOR, TIER, TIER_LABEL, TOTAL_AUM, RISK_PROFILE
       FROM CUSTOMERS
      WHERE RM_USER_ID = :1
        AND (UPPER(FULL_NAME) LIKE :2 OR UPPER(EMAIL) LIKE :2)
      ORDER BY FULL_NAME
      FETCH FIRST 10 ROWS ONLY`,
    [rmUserId, likeQ]
  );
  return result.rows || [];
}

/** Add a meeting note for a customer.
 *  noteData.noteCategory: 'MEETING' (default) | 'PERSONAL'
 */
async function addMeetingNote(customerId, rmUserId, noteData) {
  const { meetingDate, noteType, summary, topics, productsDiscussed, followUp, noteCategory } = noteData;
  await db.execute(
    `INSERT INTO MEETING_NOTES
       (CUSTOMER_ID, RM_USER_ID, MEETING_DATE, NOTE_TYPE, SUMMARY, TOPICS, PRODUCTS_DISCUSSED, FOLLOW_UP, NOTE_CATEGORY)
     VALUES (:1, :2, TO_DATE(:3,'YYYY-MM-DD'), :4, :5, :6, :7, :8, :9)`,
    [
      customerId, rmUserId,
      meetingDate || new Date().toISOString().slice(0,10),
      noteType || (noteCategory === 'PERSONAL' ? 'personal_assessment' : 'meeting'),
      summary,
      JSON.stringify(topics || []),
      JSON.stringify(productsDiscussed || []),
      followUp || null,
      noteCategory || 'MEETING',
    ]
  );
}

/** Get all notes for a customer (newest first), optionally filtered by category.
 *  category: 'MEETING' | 'PERSONAL' | null (all)
 */
async function getNotes(customerId, rmUserId, { category = null, limit = 50 } = {}) {
  const binds = [customerId];
  let catClause = '';
  if (category) {
    catClause = ' AND mn.NOTE_CATEGORY = :2';
    binds.push(category);
  }
  binds.push(Math.min(limit, 100));
  const p = binds.length;
  const rs = await db.execute(
    `SELECT mn.NOTE_ID, mn.CUSTOMER_ID, mn.RM_USER_ID, mn.NOTE_CATEGORY,
            mn.NOTE_TYPE, mn.SUMMARY, mn.TOPICS, mn.PRODUCTS_DISCUSSED, mn.FOLLOW_UP,
            TO_CHAR(mn.MEETING_DATE, 'DD Mon YYYY') AS MEETING_DATE_FMT,
            TO_CHAR(mn.CREATED_AT,  'DD Mon YYYY HH24:MI') AS CREATED_AT_FMT,
            u.FULL_NAME AS RM_NAME
       FROM MEETING_NOTES mn
       LEFT JOIN RM_USERS u ON mn.RM_USER_ID = u.USER_ID
      WHERE mn.CUSTOMER_ID = :1${catClause}
      ORDER BY mn.CREATED_AT DESC
      FETCH FIRST :${p} ROWS ONLY`,
    binds
  );
  return (rs.rows || []).map(r => ({
    ...r,
    TOPICS:             tryParse(r.TOPICS, []),
    PRODUCTS_DISCUSSED: tryParse(r.PRODUCTS_DISCUSSED, []),
  }));
}

function tryParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

/** Get RM dashboard summary */
async function getDashboardSummary(rmUserId) {
  const customerCountResult = await db.execute(
    `SELECT COUNT(*) AS CNT FROM CUSTOMERS WHERE RM_USER_ID = :1`,
    [rmUserId]
  );
  const totalAumResult = await db.execute(
    `SELECT NVL(SUM(TOTAL_AUM),0) AS TOTAL FROM CUSTOMERS WHERE RM_USER_ID = :1`,
    [rmUserId]
  );
  const alertCountResult = await db.execute(
    `SELECT COUNT(*) AS CNT FROM ALERTS a
      JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
     WHERE c.RM_USER_ID = :1 AND a.STATUS = 'Open'`,
    [rmUserId]
  );
  const maturingResult = await db.execute(
    `SELECT COUNT(*) AS CNT
      FROM CUSTOMER_PRODUCTS cp
      JOIN CUSTOMERS c ON cp.CUSTOMER_ID = c.CUSTOMER_ID
      WHERE c.RM_USER_ID = :1
        AND UPPER(cp.STATUS) = 'ACTIVE'
        AND cp.MATURITY_DATE IS NOT NULL
        AND cp.MATURITY_DATE - SYSDATE <= 60
        AND cp.MATURITY_DATE >= SYSDATE`,
    [rmUserId]
  );
  const tierBreakResult = await db.execute(
    `SELECT TIER, COUNT(*) AS CNT
       FROM CUSTOMERS
      WHERE RM_USER_ID = :1
      GROUP BY TIER`,
    [rmUserId]
  );

  const tierBreakdown = {};
  (tierBreakResult.rows || []).forEach(r => {
    tierBreakdown[r.TIER] = r.CNT;
  });

  return {
    customerCount:   customerCountResult.rows[0]?.CNT || 0,
    totalAum:        totalAumResult.rows[0]?.TOTAL || 0,
    openAlerts:      alertCountResult.rows[0]?.CNT || 0,
    maturingIn60Days: maturingResult.rows[0]?.CNT || 0,
    tierBreakdown,
  };
}

/**
 * Re-generate the CUSTOMER_EMBEDDINGS 'profile' row for a customer whose
 * data was changed directly in the CUSTOMERS table.
 * Call this after any direct UPDATE on CUSTOMERS so RAG responses stay fresh.
 */
async function reembed(customerId) {
  const result = await db.execute(
    `SELECT * FROM CUSTOMERS WHERE CUSTOMER_ID = :1`, [customerId]
  );
  const cust = result.rows?.[0];
  if (!cust) throw new Error('Customer not found: ' + customerId);

  const text   = buildProfileText(cust);
  const vector = await embed.embedDocument(text);
  const vecStr = embed.vectorToString(vector);

  // Update existing profile embedding row
  const upd = await db.execute(
    `UPDATE CUSTOMER_EMBEDDINGS
        SET CONTENT = :1, EMBEDDING = TO_VECTOR(:2, 1536, FLOAT32)
      WHERE CUSTOMER_ID = :3 AND CONTENT_TYPE = 'profile'`,
    [text, vecStr, customerId]
  );

  // Insert if no existing row
  if ((upd.rowsAffected || 0) === 0) {
    await db.execute(
      `INSERT INTO CUSTOMER_EMBEDDINGS (CUSTOMER_ID, CONTENT_TYPE, CONTENT, EMBEDDING)
       VALUES (:1, 'profile', :2, TO_VECTOR(:3, 1536, FLOAT32))`,
      [customerId, text, vecStr]
    );
  }

  return { customerId, content: text };
}

/** Build the same profile text used by seedDb.js for vector embeddings */
function buildProfileText(cust) {
  return [
    `Nasabah: ${cust.FULL_NAME}`,
    `Usia: ${cust.AGE} tahun, ${cust.GENDER}`,
    `Tier: ${cust.TIER_LABEL || cust.TIER}`,
    `Profil Risiko: ${cust.RISK_PROFILE}`,
    `Total AUM: Rp ${Number(cust.TOTAL_AUM || 0).toLocaleString('id-ID')}`,
    `Pendapatan Bulanan: Rp ${Number(cust.MONTHLY_INCOME || 0).toLocaleString('id-ID')}`,
    `KYC Status: ${cust.KYC_STATUS}`,
    `Email: ${cust.EMAIL || '-'}`,
    `Telepon: ${cust.PHONE || '-'}`,
    `Catatan: ${cust.NOTES || '-'}`,
  ].join('\n');
}

module.exports = { listByRM, getById, search, addMeetingNote, getNotes, getDashboardSummary, reembed };
