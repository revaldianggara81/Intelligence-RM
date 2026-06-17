'use strict';
require('dotenv').config();
const db = require('../backend/config/database');

(async () => {
  await db.initialize();

  const run = async (label, sql) => {
    try { await db.execute(sql); console.log('[✓]', label); }
    catch(e) {
      if (/ORA-00955|ORA-01430|ORA-02261|ORA-02291/.test(e.message))
        console.log('[~]', label, '(already exists)');
      else console.error('[✗]', label, e.message);
    }
  };

  // ── 1. NOTIFICATIONS — in-app notification inbox per RM ───────────────────
  await run('CREATE NOTIFICATIONS', `CREATE TABLE NOTIFICATIONS (
    NOTIF_ID      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    RM_USER_ID    VARCHAR2(50)    NOT NULL,
    NOTIF_TYPE    VARCHAR2(50)    NOT NULL,
    TITLE         VARCHAR2(200)   NOT NULL,
    MESSAGE       VARCHAR2(2000),
    SEVERITY      VARCHAR2(20)    DEFAULT 'low',
    CUSTOMER_ID   VARCHAR2(50),
    ALERT_ID      NUMBER,
    IS_READ       NUMBER(1)       DEFAULT 0,
    CREATED_AT    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_NOTIF_ALERT FOREIGN KEY (ALERT_ID) REFERENCES ALERTS(ALERT_ID) ON DELETE SET NULL
  )`);

  await run('IDX_NOTIF_RM_READ',
    `CREATE INDEX IDX_NOTIF_RM_READ ON NOTIFICATIONS (RM_USER_ID, IS_READ, CREATED_AT DESC)`);
  await run('IDX_NOTIF_ALERT_ID',
    `CREATE INDEX IDX_NOTIF_ALERT_ID ON NOTIFICATIONS (ALERT_ID)`);

  // ── 2. NOTIFICATION_PREFS — per-RM notification preferences ───────────────
  await run('CREATE NOTIFICATION_PREFS', `CREATE TABLE NOTIFICATION_PREFS (
    PREF_ID           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    RM_USER_ID        VARCHAR2(50)   NOT NULL UNIQUE,
    IN_APP_ENABLED    NUMBER(1)      DEFAULT 1,
    EMAIL_ENABLED     NUMBER(1)      DEFAULT 0,
    EMAIL_ADDRESS     VARCHAR2(200),
    DIGEST_FREQ       VARCHAR2(20)   DEFAULT 'immediate',
    OCI_NOTIF_ENABLED NUMBER(1)      DEFAULT 0,
    UPDATED_AT        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── 3. Seed default prefs for all existing RM users ───────────────────────
  try {
    const usersR = await db.execute(`SELECT USER_ID, EMAIL FROM RM_USERS WHERE IS_ACTIVE = 1`);
    const users = usersR.rows || [];
    for (const u of users) {
      try {
        await db.execute(
          `MERGE INTO NOTIFICATION_PREFS t
           USING (SELECT :1 AS RM_USER_ID FROM DUAL) s
           ON (t.RM_USER_ID = s.RM_USER_ID)
           WHEN NOT MATCHED THEN
             INSERT (RM_USER_ID, IN_APP_ENABLED, EMAIL_ENABLED, EMAIL_ADDRESS, DIGEST_FREQ)
             VALUES (:2, 1, 0, :3, 'immediate')`,
          [u.USER_ID, u.USER_ID, u.EMAIL || null]
        );
        console.log(`[✓] Default prefs for ${u.USER_ID}`);
      } catch(e) { console.warn('[~] Prefs seed:', e.message); }
    }
  } catch(e) { console.warn('[~] Prefs seed skipped:', e.message); }

  // ── 4. Back-fill NOTIFICATIONS from existing open ALERTS ──────────────────
  console.log('[…] Back-filling notifications from existing ALERTS...');
  try {
    const r = await db.execute(
      `INSERT INTO NOTIFICATIONS (RM_USER_ID, NOTIF_TYPE, TITLE, MESSAGE, SEVERITY, CUSTOMER_ID, ALERT_ID)
       SELECT c.RM_USER_ID, a.ALERT_TYPE, a.TITLE, a.MESSAGE, a.SEVERITY, a.CUSTOMER_ID, a.ALERT_ID
         FROM ALERTS a
         JOIN CUSTOMERS c ON c.CUSTOMER_ID = a.CUSTOMER_ID
        WHERE a.STATUS = 'Open'
          AND NOT EXISTS (
            SELECT 1 FROM NOTIFICATIONS n WHERE n.ALERT_ID = a.ALERT_ID
          )`
    );
    await db.execute(`COMMIT`);
    console.log('[✓] Back-fill complete');
  } catch(e) {
    console.warn('[~] Back-fill:', e.message);
  }

  // Check counts
  const cntR = await db.execute(`SELECT COUNT(*) AS CNT FROM NOTIFICATIONS`);
  console.log(`[ℹ] NOTIFICATIONS rows: ${cntR.rows?.[0]?.CNT}`);

  await db.close();
  console.log('[✓] Migration 15 complete');
})();
