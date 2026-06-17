'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql) => {
    try { await db.execute(sql, [], { autoCommit: true }); console.log('[✓]', label); }
    catch (e) {
      if (/ORA-00955|ORA-01430|ORA-02261/.test(e.message))
        console.log('[~]', label, '(already exists)');
      else console.error('[✗]', label, e.message);
    }
  };

  // ── RM_ALERT_SUBSCRIPTIONS ───────────────────────────────────────────────
  // One row per (RM_USER_ID, ALERT_TYPE).
  // CUSTOMER_SEGMENTS: 'ALL' or comma-separated TIER values, e.g. 'PRIORITAS,PRIVILEGE'
  // IS_ACTIVE: 1 = receive alerts, 0 = muted for this alert type
  // SEVERITY_FILTER: NULL = all severities, 'high' = high only
  await run('CREATE RM_ALERT_SUBSCRIPTIONS',
    `CREATE TABLE RM_ALERT_SUBSCRIPTIONS (
      SUB_ID            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      RM_USER_ID        VARCHAR2(50)   NOT NULL,
      ALERT_TYPE        VARCHAR2(50)   NOT NULL,
      IS_ACTIVE         NUMBER(1)      DEFAULT 1  NOT NULL,
      CUSTOMER_SEGMENTS VARCHAR2(500)  DEFAULT 'ALL' NOT NULL,
      SEVERITY_FILTER   VARCHAR2(10),
      CREATED_AT        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT UQ_RM_ALERT_SUB UNIQUE (RM_USER_ID, ALERT_TYPE)
    )`);

  await run('IDX RM_ALERT_SUBSCRIPTIONS RM_TYPE',
    `CREATE INDEX IDX_RMAS_RM_TYPE ON RM_ALERT_SUBSCRIPTIONS(RM_USER_ID, ALERT_TYPE)`);

  await db.close();
  console.log('[✓] Migration 21 complete — RM_ALERT_SUBSCRIPTIONS ready');
})();
