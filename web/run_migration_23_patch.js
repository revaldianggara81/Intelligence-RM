require('dotenv').config();
const db = require('./backend/config/database');

db.initialize().then(async () => {
  const types = [
    ['kyc_expiry', 'KYC Expiry', '🪪', 'Alert ketika KYC nasabah akan/sudah kadaluarsa', 1, 8],
    ['campaign',   'Campaign',   '📣', 'Alert terkait eligibility kampanye pemasaran',    1, 9],
  ];

  for (const [type, label, icon, desc, active, order] of types) {
    await db.execute(
      `MERGE INTO ALERT_TYPE_CATALOGUE dst USING DUAL ON (dst.ALERT_TYPE = :1)
       WHEN MATCHED THEN UPDATE SET LABEL=:2, ICON=:3, DESCRIPTION=:4, IS_ACTIVE=:5, SORT_ORDER=:6
       WHEN NOT MATCHED THEN INSERT (ALERT_TYPE,LABEL,ICON,DESCRIPTION,IS_ACTIVE,SORT_ORDER) VALUES (:7,:8,:9,:10,:11,:12)`,
      [type, label, icon, desc, active, order, type, label, icon, desc, active, order],
      { autoCommit: true }
    );
    console.log('Upserted:', type);
  }

  // Verify
  const result = await db.execute(
    `SELECT ALERT_TYPE, LABEL, ICON, SORT_ORDER FROM ALERT_TYPE_CATALOGUE ORDER BY SORT_ORDER`
  );
  console.log('\n--- ALERT_TYPE_CATALOGUE (final) ---');
  for (const row of result.rows) {
    console.log(`  [${row[3]}] ${row[2]}  ${row[0]} — ${row[1]}`);
  }

  await db.close();
  console.log('\nDone.');
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
