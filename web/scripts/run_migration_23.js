'use strict';
/**
 * Migration 23 — Oracle Database MCP Tool Layer for PAF_AGENT_ALERT
 *
 * Creates views, stored procedures, and an analysis log table used by
 * PAF AI Studio when it connects to Oracle Database as an MCP server.
 *
 * Views exposed as MCP tools:
 *   MCP_V_ALERT_DETAIL          — alert + full customer profile
 *   MCP_V_CUSTOMER_PORTFOLIO    — active holdings with return / maturity
 *   MCP_V_PRODUCT_PERFORMANCE   — benchmark comparison data
 *
 * Stored procedures:
 *   MCP_SP_GET_ALERT_CONTEXT    — returns single JSON CLOB for an alert_id
 *   MCP_SP_LOG_ANALYSIS         — audit trail for MCP-generated analyses
 *
 * Audit table:
 *   MCP_ANALYSIS_LOG            — stores every PAF MCP analysis run
 */

require('dotenv').config();
const db = require('../backend/config/database');

async function run() {
  await db.initialize();
  console.log('Migration 23 — Oracle MCP Tool Layer\n');

  /* ── 1. MCP_ANALYSIS_LOG ─────────────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE TABLE MCP_ANALYSIS_LOG (
        LOG_ID       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ALERT_ID     NUMBER        NOT NULL,
        RM_USER_ID   VARCHAR2(100),
        MODEL_USED   VARCHAR2(100) DEFAULT 'PAF_MCP',
        ANALYSIS_CLOB CLOB,
        TOKEN_COUNT  NUMBER,
        DURATION_MS  NUMBER,
        CREATED_AT   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅  Created MCP_ANALYSIS_LOG');
  } catch (e) {
    if (e.message.includes('ORA-00955')) console.log('⏭   MCP_ANALYSIS_LOG already exists');
    else throw e;
  }

  /* ── 2. MCP_V_ALERT_DETAIL ───────────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE VIEW MCP_V_ALERT_DETAIL AS
      SELECT
        a.ALERT_ID,
        a.CUSTOMER_ID,
        a.ALERT_TYPE,
        a.SEVERITY,
        a.TITLE,
        a.MESSAGE,
        a.METRIC_KEY,
        a.METRIC_VALUE,
        a.THRESHOLD,
        a.STATUS,
        TO_CHAR(a.TRIGGERED_AT, 'DD Mon YYYY HH24:MI') AS TRIGGERED_FMT,
        -- Customer profile
        c.FULL_NAME         AS CUSTOMER_NAME,
        c.TIER,
        c.TIER_LABEL,
        c.RISK_PROFILE,
        c.TOTAL_AUM,
        c.MONTHLY_INCOME,
        c.AGE,
        c.GENDER,
        c.EMAIL,
        c.PHONE,
        -- RM info
        u.FULL_NAME         AS RM_NAME,
        u.BRANCH            AS RM_BRANCH
      FROM ALERTS a
      JOIN CUSTOMERS  c ON a.CUSTOMER_ID  = c.CUSTOMER_ID
      LEFT JOIN RM_USERS u ON c.RM_USER_ID = u.USER_ID
    `);
    console.log('✅  Created/replaced MCP_V_ALERT_DETAIL');
  } catch (e) {
    console.error('❌  MCP_V_ALERT_DETAIL:', e.message);
    throw e;
  }

  /* ── 3. MCP_V_CUSTOMER_PORTFOLIO ─────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE VIEW MCP_V_CUSTOMER_PORTFOLIO AS
      SELECT
        cp.CUSTOMER_ID,
        cp.HOLDING_ID,
        cp.PRODUCT_ID,
        cp.PRODUCT_NAME,
        cp.CATEGORY,
        cp.AMOUNT,
        cp.INTEREST_RATE,
        cp.RETURN_PCT,
        cp.STATUS,
        cp.START_DATE,
        cp.MATURITY_DATE,
        ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_TO_MATURITY,
        -- Convenience: Rupiah formatted
        TO_CHAR(cp.AMOUNT, 'FM999,999,999,999') AS AMOUNT_FMT
      FROM CUSTOMER_PRODUCTS cp
      WHERE cp.STATUS = 'Active'
    `);
    console.log('✅  Created/replaced MCP_V_CUSTOMER_PORTFOLIO');
  } catch (e) {
    console.error('❌  MCP_V_CUSTOMER_PORTFOLIO:', e.message);
    throw e;
  }

  /* ── 4. MCP_V_PRODUCT_PERFORMANCE ────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE VIEW MCP_V_PRODUCT_PERFORMANCE AS
      SELECT
        pp.PRODUCT_ID,
        pp.PRODUCT_NAME,
        pp.CATEGORY,
        pp.BENCHMARK_NAME,
        pp.RETURN_1M,
        pp.RETURN_3M,
        pp.RETURN_6M,
        pp.RETURN_1Y,
        pp.BENCH_RETURN_1M,
        pp.BENCH_RETURN_3M,
        pp.BENCH_RETURN_6M,
        pp.BENCH_RETURN_1Y,
        ROUND(pp.RETURN_3M - pp.BENCH_RETURN_3M, 2)  AS ALPHA_3M,
        TO_CHAR(pp.UPDATED_AT, 'DD Mon YYYY')         AS UPDATED_FMT
      FROM PRODUCT_PERFORMANCE pp
    `);
    console.log('✅  Created/replaced MCP_V_PRODUCT_PERFORMANCE');
  } catch (e) {
    if (e.message.includes('ORA-00942')) {
      console.log('⏭   PRODUCT_PERFORMANCE table not found — skipping MCP_V_PRODUCT_PERFORMANCE');
    } else {
      console.error('❌  MCP_V_PRODUCT_PERFORMANCE:', e.message);
    }
  }

  /* ── 5. MCP_SP_GET_ALERT_CONTEXT (returns full JSON context in one call) */
  try {
    await db.execute(`
      CREATE OR REPLACE PROCEDURE MCP_SP_GET_ALERT_CONTEXT(
        p_alert_id  IN  NUMBER,
        p_context   OUT CLOB
      ) AS
        v_alert_head  VARCHAR2(4000);
        v_cust_json   VARCHAR2(1000);
        v_customer_id VARCHAR2(50);
        v_portfolio   VARCHAR2(32767) := '[';
        v_sep         VARCHAR2(1)     := '';
      BEGIN
        -- Build alert header + customer section as VARCHAR2
        SELECT
          '{"alert_id":'  || TO_CHAR(a.ALERT_ID)          ||
          ',"alert_type":"' || NVL(a.ALERT_TYPE,'')        || '"' ||
          ',"severity":"'   || NVL(a.SEVERITY,'')          || '"' ||
          ',"triggered_at":"' || TO_CHAR(a.TRIGGERED_AT,'DD Mon YYYY HH24:MI') || '"' ||
          ',"title":"'    || REPLACE(NVL(a.TITLE,''),'"','\\\"')   || '"' ||
          ',"message":"'  || REPLACE(NVL(SUBSTR(a.MESSAGE,1,500),''),'"','\\\"') || '"' ||
          ',"metric_key":"'   || NVL(a.METRIC_KEY,'')   || '"' ||
          ',"metric_value":"' || NVL(a.METRIC_VALUE,'') || '"' ||
          ',"threshold":"'    || NVL(a.THRESHOLD,'')    || '"',
          c.CUSTOMER_ID,
          '{"name":"'         || REPLACE(NVL(c.FULL_NAME,''),'"','\\\"') || '"' ||
          ',"tier":"'         || NVL(c.TIER,'')         || '"' ||
          ',"risk_profile":"' || NVL(c.RISK_PROFILE,'') || '"' ||
          ',"total_aum":'     || TO_CHAR(NVL(c.TOTAL_AUM,0))  ||
          ',"age":'           || TO_CHAR(NVL(c.AGE,0))        || '}'
        INTO v_alert_head, v_customer_id, v_cust_json
        FROM ALERTS a
        JOIN CUSTOMERS c ON a.CUSTOMER_ID = c.CUSTOMER_ID
        WHERE a.ALERT_ID = p_alert_id;

        -- Build portfolio JSON array (VARCHAR2 — up to 10 holdings)
        FOR h IN (
          SELECT PRODUCT_NAME, CATEGORY, AMOUNT, RETURN_PCT,
                 ROUND(MATURITY_DATE - SYSDATE) AS DAYS_MAT
            FROM CUSTOMER_PRODUCTS
           WHERE CUSTOMER_ID = v_customer_id AND STATUS = 'Active'
           ORDER BY AMOUNT DESC FETCH FIRST 10 ROWS ONLY
        ) LOOP
          v_portfolio := v_portfolio || v_sep ||
            '{"p":"'   || REPLACE(NVL(h.PRODUCT_NAME,''),'"','\\\"') || '"' ||
            ',"cat":"' || NVL(h.CATEGORY,'') || '"' ||
            ',"amt":'  || TO_CHAR(NVL(h.AMOUNT,0))      ||
            ',"ret":'  || TO_CHAR(NVL(h.RETURN_PCT,0))  ||
            ',"mat":'  || TO_CHAR(NVL(h.DAYS_MAT,-1))   || '}';
          v_sep := ',';
        END LOOP;
        v_portfolio := v_portfolio || ']';

        -- Assemble final CLOB: header + customer + portfolio
        p_context :=
          TO_CLOB(v_alert_head)  ||
          ',"customer":'         ||
          TO_CLOB(v_cust_json)   ||
          ',"portfolio":'        ||
          TO_CLOB(v_portfolio)   ||
          '}';

      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          p_context := TO_CLOB('{"error":"Alert not found","alert_id":' || TO_CHAR(p_alert_id) || '}');
        WHEN OTHERS THEN
          p_context := TO_CLOB('{"error":"' || REPLACE(SQLERRM,'"','\\\"') || '"}');
      END MCP_SP_GET_ALERT_CONTEXT;
    `, [], { autoCommit: true });
    console.log('✅  Created/replaced MCP_SP_GET_ALERT_CONTEXT');
  } catch (e) {
    console.error('❌  MCP_SP_GET_ALERT_CONTEXT:', e.message);
  }

  /* ── 6. MCP_SP_LOG_ANALYSIS ──────────────────────────────────────────── */
  try {
    await db.execute(`
      CREATE OR REPLACE PROCEDURE MCP_SP_LOG_ANALYSIS(
        p_alert_id   IN NUMBER,
        p_rm_user_id IN VARCHAR2,
        p_analysis   IN CLOB,
        p_model      IN VARCHAR2 DEFAULT 'PAF_MCP',
        p_duration   IN NUMBER   DEFAULT NULL
      ) AS
      BEGIN
        INSERT INTO MCP_ANALYSIS_LOG
          (ALERT_ID, RM_USER_ID, MODEL_USED, ANALYSIS_CLOB, DURATION_MS)
        VALUES
          (p_alert_id, p_rm_user_id, p_model, p_analysis, p_duration);
        COMMIT;
      EXCEPTION
        WHEN OTHERS THEN NULL; -- Never block the main flow
      END MCP_SP_LOG_ANALYSIS;
    `, [], { autoCommit: true });
    console.log('✅  Created/replaced MCP_SP_LOG_ANALYSIS');
  } catch (e) {
    console.error('❌  MCP_SP_LOG_ANALYSIS:', e.message);
  }

  /* ── 7. Grant SELECT on MCP views to PUBLIC (PAF Studio MCP user) ────── */
  const grantViews = [
    'MCP_V_ALERT_DETAIL',
    'MCP_V_CUSTOMER_PORTFOLIO',
    'MCP_V_PRODUCT_PERFORMANCE',
  ];
  for (const view of grantViews) {
    try {
      await db.execute(`GRANT SELECT ON ${view} TO PUBLIC`);
      console.log(`✅  Granted SELECT on ${view} to PUBLIC`);
    } catch (e) {
      console.log(`⏭   GRANT on ${view}: ${e.message}`);
    }
  }

  /* ── 8. Grant EXECUTE on stored procedures ───────────────────────────── */
  const grantProcs = ['MCP_SP_GET_ALERT_CONTEXT', 'MCP_SP_LOG_ANALYSIS'];
  for (const proc of grantProcs) {
    try {
      await db.execute(`GRANT EXECUTE ON ${proc} TO PUBLIC`);
      console.log(`✅  Granted EXECUTE on ${proc} to PUBLIC`);
    } catch (e) {
      console.log(`⏭   GRANT on ${proc}: ${e.message}`);
    }
  }

  console.log('\n✅  Migration 23 complete — Oracle MCP Tool Layer ready');
  await db.close();
}

run().catch(err => {
  console.error('Migration 23 FAILED:', err);
  process.exit(1);
});
