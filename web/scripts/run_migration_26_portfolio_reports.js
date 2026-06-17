'use strict';
/**
 * Migration 26 — PORTFOLIO_AI_REPORTS table
 * Stores every AI analysis result for traceability + DOCX report generation.
 */
require('dotenv').config();
const db = require('../backend/config/database');

async function run() {
  await db.initialize();
  console.log('Migration 26 — PORTFOLIO_AI_REPORTS\n');

  /* ── Main table ─────────────────────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE TABLE PORTFOLIO_AI_REPORTS (
        REPORT_ID       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        CUSTOMER_ID     VARCHAR2(20)  NOT NULL,
        RM_USER_ID      VARCHAR2(20)  NOT NULL,
        REPORT_TITLE    VARCHAR2(300),
        ANALYSIS_TEXT   CLOB,
        FORECAST_JSON   CLOB,
        ALERTS_JSON     CLOB,
        CUSTOMER_JSON   CLOB,
        REPORT_STATUS   VARCHAR2(20)  DEFAULT 'SAVED',
        CREATED_AT      TIMESTAMP     DEFAULT SYSTIMESTAMP,
        CONSTRAINT chk_par_status CHECK (REPORT_STATUS IN ('SAVED','DOWNLOADED','ARCHIVED'))
      )
    `);
    console.log('✅  Created PORTFOLIO_AI_REPORTS');
  } catch (e) {
    if (e.message.includes('ORA-00955')) console.log('⏭   PORTFOLIO_AI_REPORTS already exists');
    else { console.error('❌', e.message); throw e; }
  }

  /* ── Indexes ─────────────────────────────────────────────────────────── */
  const idxs = [
    ['idx_par_cust',   'PORTFOLIO_AI_REPORTS(CUSTOMER_ID)'],
    ['idx_par_rm',     'PORTFOLIO_AI_REPORTS(RM_USER_ID)'],
    ['idx_par_status', 'PORTFOLIO_AI_REPORTS(REPORT_STATUS)'],
    ['idx_par_ts',     'PORTFOLIO_AI_REPORTS(CREATED_AT DESC)'],
  ];
  for (const [name, def] of idxs) {
    try {
      await db.execute(`CREATE INDEX ${name} ON ${def}`);
      console.log(`✅  Index ${name}`);
    } catch (e) {
      if (e.message.includes('ORA-00955')) console.log(`⏭   ${name} exists`);
      else console.log(`⚠   ${name}: ${e.message}`);
    }
  }

  /* ── SP_SAVE_PORTFOLIO_ANALYSIS ─────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE PROCEDURE SP_SAVE_PORTFOLIO_ANALYSIS(
        p_customer_id   IN VARCHAR2,
        p_rm_user_id    IN VARCHAR2,
        p_title         IN VARCHAR2,
        p_analysis      IN CLOB,
        p_forecast_json IN CLOB,
        p_alerts_json   IN CLOB,
        p_customer_json IN CLOB,
        p_report_id     OUT NUMBER
      ) AS
      BEGIN
        INSERT INTO PORTFOLIO_AI_REPORTS
          (CUSTOMER_ID, RM_USER_ID, REPORT_TITLE,
           ANALYSIS_TEXT, FORECAST_JSON, ALERTS_JSON, CUSTOMER_JSON,
           REPORT_STATUS, CREATED_AT)
        VALUES
          (p_customer_id, p_rm_user_id, p_title,
           p_analysis, p_forecast_json, p_alerts_json, p_customer_json,
           'SAVED', SYSTIMESTAMP)
        RETURNING REPORT_ID INTO p_report_id;
        COMMIT;
      END;
    `);
    console.log('✅  SP_SAVE_PORTFOLIO_ANALYSIS');
  } catch (e) {
    console.error('❌  SP:', e.message);
  }

  /* ── SP_UPDATE_REPORT_STATUS ────────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE PROCEDURE SP_UPDATE_REPORT_STATUS(
        p_report_id IN NUMBER,
        p_status    IN VARCHAR2
      ) AS
      BEGIN
        UPDATE PORTFOLIO_AI_REPORTS
           SET REPORT_STATUS = p_status
         WHERE REPORT_ID = p_report_id;
        COMMIT;
      END;
    `);
    console.log('✅  SP_UPDATE_REPORT_STATUS');
  } catch (e) {
    console.error('❌  SP:', e.message);
  }

  /* ── V_PORTFOLIO_REPORTS (view for listing) ─────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE VIEW V_PORTFOLIO_REPORTS AS
        SELECT
          r.REPORT_ID,
          r.CUSTOMER_ID,
          r.RM_USER_ID,
          r.REPORT_TITLE,
          r.REPORT_STATUS,
          TO_CHAR(r.CREATED_AT,'DD Mon YYYY HH24:MI') AS CREATED_FMT,
          r.CREATED_AT,
          c.FULL_NAME   AS CUSTOMER_NAME,
          c.TIER,
          c.RISK_PROFILE,
          u.FULL_NAME   AS RM_NAME
        FROM PORTFOLIO_AI_REPORTS r
        LEFT JOIN CUSTOMERS   c ON r.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN RM_USERS    u ON r.RM_USER_ID   = u.USER_ID
    `);
    console.log('✅  V_PORTFOLIO_REPORTS');
  } catch (e) {
    console.error('⚠   V_PORTFOLIO_REPORTS:', e.message);
  }

  /* ── sanity ─────────────────────────────────────────────────────────── */
  const cnt = await db.execute(`SELECT COUNT(*) AS C FROM PORTFOLIO_AI_REPORTS`);
  console.log(`\n📊 PORTFOLIO_AI_REPORTS rows: ${cnt.rows[0].C}`);
  console.log('\n✅  Migration 26 complete');
  await db.close();
}

run().catch(err => {
  console.error('Migration 26 FAILED:', err);
  process.exit(1);
});
