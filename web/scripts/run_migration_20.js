'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql) => {
    try { await db.execute(sql); console.log('[✓]', label); }
    catch(e) {
      if (/ORA-00955|ORA-01430|ORA-02261/.test(e.message))
        console.log('[~]', label, '(already exists)');
      else console.error('[✗]', label, e.message);
    }
  };

  // ── 1. RM_TASKS ───────────────────────────────────────────────────────────
  await run('CREATE RM_TASKS',
    `CREATE TABLE RM_TASKS (
      TASK_ID      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      RM_USER_ID   VARCHAR2(50)   NOT NULL,
      CUSTOMER_ID  VARCHAR2(20),
      ALERT_ID     NUMBER,
      TASK_TYPE    VARCHAR2(30)   DEFAULT 'follow_up',
      TITLE        VARCHAR2(300)  NOT NULL,
      DESCRIPTION  VARCHAR2(2000),
      DUE_DATE     DATE,
      PRIORITY     VARCHAR2(10)   DEFAULT 'medium',
      STATUS       VARCHAR2(20)   DEFAULT 'open',
      CREATED_AT   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
    )`);

  await run('IDX RM_TASKS RM_USER',
    `CREATE INDEX IDX_RMTASKS_USER ON RM_TASKS(RM_USER_ID, STATUS)`);
  await run('IDX RM_TASKS CUSTOMER',
    `CREATE INDEX IDX_RMTASKS_CUST ON RM_TASKS(CUSTOMER_ID)`);
  await run('IDX RM_TASKS ALERT',
    `CREATE INDEX IDX_RMTASKS_ALERT ON RM_TASKS(ALERT_ID)`);

  // ── 2. ALERT_ACTIONS ──────────────────────────────────────────────────────
  await run('CREATE ALERT_ACTIONS',
    `CREATE TABLE ALERT_ACTIONS (
      ACTION_ID     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ALERT_ID      NUMBER         NOT NULL,
      ACTION_TYPE   VARCHAR2(30)   NOT NULL,
      CUSTOMER_ID   VARCHAR2(20),
      RM_USER_ID    VARCHAR2(50),
      REFERENCE_ID  VARCHAR2(50),
      REFERENCE_TYPE VARCHAR2(30),
      NOTES         VARCHAR2(1000),
      CREATED_AT    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

  await run('IDX ALERT_ACTIONS ALERT',
    `CREATE INDEX IDX_AALERT_ID ON ALERT_ACTIONS(ALERT_ID, CREATED_AT DESC)`);

  await db.close();
  console.log('[✓] Migration 20 complete — RM_TASKS, ALERT_ACTIONS ready');
})();
