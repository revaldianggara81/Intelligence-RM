'use strict';
/**
 * Migration: CUSTOMER_AI_INSIGHTS — stores AI-generated market intelligence per customer.
 * Run: node run_market_insight_migration.js
 */
require('dotenv').config();
const db = require('./backend/config/database');

async function run() {
  console.log('[Migration] Initializing DB pool...');
  await db.initialize();
  console.log('[Migration] Pool ready.\n');

  try {
    await db.execute('DROP TABLE CUSTOMER_AI_INSIGHTS CASCADE CONSTRAINTS');
    console.log('[Migration] CUSTOMER_AI_INSIGHTS dropped.');
  } catch (_) {
    console.log('[Migration] Creating fresh CUSTOMER_AI_INSIGHTS...');
  }

  await db.execute(`
    CREATE TABLE CUSTOMER_AI_INSIGHTS (
      INSIGHT_ID      NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      CUSTOMER_ID     VARCHAR2(50)    NOT NULL,
      INSIGHT_TYPE    VARCHAR2(30)    DEFAULT 'MARKET_INTELLIGENCE',
      INSIGHT_TEXT    CLOB            NOT NULL,
      MARKET_CONTEXT  CLOB,
      MODEL_USED      VARCHAR2(100),
      GENERATED_AT    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      CREATED_BY      VARCHAR2(50),
      CONSTRAINT cai_cust_fk FOREIGN KEY (CUSTOMER_ID)
        REFERENCES CUSTOMERS(CUSTOMER_ID) ON DELETE CASCADE
    )
  `);
  console.log('[Migration] Table CUSTOMER_AI_INSIGHTS created.');

  await db.execute(
    'CREATE INDEX idx_cai_cust_gen ON CUSTOMER_AI_INSIGHTS(CUSTOMER_ID, GENERATED_AT)'
  );
  console.log('[Migration] Index idx_cai_cust_gen created.');

  console.log('\n[Migration] Done. Table is ready — insights will be generated on first customer load.');
  await db.close();
  process.exit(0);
}

run().catch(e => {
  console.error('[Migration] FATAL:', e.message);
  process.exit(1);
});
