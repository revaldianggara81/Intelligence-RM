'use strict';
/**
 * scripts/seedDb.js
 * Insert seed data AND generate vector embeddings for all RAG tables.
 *
 * Fix: uses ONE persistent connection (via a helper wrapper) for all DML,
 * avoiding NJS-040 pool exhaustion.
 *
 * Usage: node scripts/seedDb.js
 */
require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const oracledb = require('oracledb');
const { embedDocument, vectorToString } = require('../backend/services/embeddingService');

const SEED_FILE = path.join(__dirname, '../backend/db/seed.sql');

// Shared single connection — set after pool creation
let _conn = null;

/** Execute a statement on the single shared connection */
async function exec(sql, binds = []) {
  return _conn.execute(sql, binds, { autoCommit: true });
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Intelligence RM Platform — Seed + Embed     ║');
  console.log('╚══════════════════════════════════════════════╝');

  // ── 1. Configure and create pool (1 connection only) ──────────────
  oracledb.autoCommit    = true;
  oracledb.outFormat     = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];

  const walletDir = path.resolve(process.env.DB_WALLET_DIR || './wallet');
  await oracledb.createPool({
    user:           process.env.DB_USER     || 'ADMIN',
    password:       process.env.DB_PASSWORD,
    connectString:  process.env.DB_CONNECT_STRING,
    configDir:      walletDir,
    walletLocation: walletDir,
    walletPassword: process.env.DB_WALLET_PASSWORD || undefined,
    poolMin:        1,
    poolMax:        1,
    poolIncrement:  0,
    queueTimeout:   120000,
    poolAlias:      'seedPool',
  });
  console.log('[DB] Pool initialized (1 connection)\n');

  // ── 2. Acquire the single connection ──────────────────────────────
  _conn = await oracledb.getConnection('seedPool');

  // ── 3. Run SQL seed file ──────────────────────────────────────────
  console.log('[1/3] Inserting seed data from seed.sql...');
  const rawSql = fs.readFileSync(SEED_FILE, 'utf8');

  const statements = rawSql
    .split(';')
    .map(s =>
      s.split('\n')
       .filter(l => { const t = l.trim(); return t.length > 0 && !t.startsWith('--'); })
       .join('\n')
       .trim()
    )
    .filter(s => s.length > 0);

  let inserted = 0;
  let skipped  = 0;

  for (const stmt of statements) {
    if (/^COMMIT/i.test(stmt)) continue; // autoCommit handles this

    // Skip placeholder MARKET_CONTEXT_EMBEDDINGS rows (real vectors generated below)
    if (stmt.includes('TO_VECTOR') && stmt.includes('placeholder-seed')) {
      skipped++;
      continue;
    }

    try {
      await exec(stmt);
      inserted++;
    } catch (err) {
      if (err.errorNum === 1 || err.errorNum === 2291) {
        // ORA-00001 unique constraint / ORA-02291 FK violation → already seeded
        skipped++;
      } else {
        console.warn(`  WARN (${err.errorNum}): ${err.message?.substring(0, 120)}`);
      }
    }
  }
  console.log(`  ✓ ${inserted} rows inserted, ${skipped} skipped\n`);

  // ── 4. Customer embeddings ────────────────────────────────────────
  console.log('[2a/3] Generating customer embeddings...');
  const custRows = (await exec(
    `SELECT c.*,
            NVL((SELECT LISTAGG(cp.PRODUCT_NAME||' ('||cp.CATEGORY||') Rp'||cp.AMOUNT,', ')
                          WITHIN GROUP (ORDER BY cp.AMOUNT DESC)
                   FROM CUSTOMER_PRODUCTS cp
                  WHERE cp.CUSTOMER_ID = c.CUSTOMER_ID AND cp.STATUS='Active' AND ROWNUM <= 5),'') AS PRODUCTS_TEXT
       FROM CUSTOMERS c`
  )).rows || [];

  for (const cust of custRows) {
    await upsertEmbed('CUSTOMER_EMBEDDINGS',
      { CUSTOMER_ID: cust.CUSTOMER_ID, CONTENT_TYPE: 'profile' },
      `CUSTOMER_ID = :1 AND CONTENT_TYPE = :2`,
      [cust.CUSTOMER_ID, 'profile'],
      buildCustomerProfileText(cust),
      [cust.CUSTOMER_ID, 'profile']
    );
    if (cust.PRODUCTS_TEXT) {
      await upsertEmbed('CUSTOMER_EMBEDDINGS',
        { CUSTOMER_ID: cust.CUSTOMER_ID, CONTENT_TYPE: 'products' },
        `CUSTOMER_ID = :1 AND CONTENT_TYPE = :2`,
        [cust.CUSTOMER_ID, 'products'],
        `Produk nasabah ${cust.FULL_NAME}: ${cust.PRODUCTS_TEXT}`,
        [cust.CUSTOMER_ID, 'products']
      );
    }
    process.stdout.write(`  ✓ ${cust.FULL_NAME}\n`);
  }

  // ── 5. Meeting notes embeddings ───────────────────────────────────
  console.log('\n[2b/3] Generating meeting notes embeddings...');
  const noteRows = (await exec(
    `SELECT NOTE_ID, CUSTOMER_ID, NOTE_TYPE, MEETING_DATE, SUMMARY, FOLLOW_UP FROM MEETING_NOTES`
  )).rows || [];

  for (const note of noteRows) {
    const text = [
      `[${note.NOTE_TYPE} - ${note.MEETING_DATE}]`,
      note.SUMMARY,
      note.FOLLOW_UP ? `Follow-up: ${note.FOLLOW_UP}` : '',
    ].filter(Boolean).join('\n');

    try {
      const vec    = await embedDocument(text);
      const vecStr = vectorToString(vec);
      const model  = process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0';
      await exec(`DELETE FROM MEETING_NOTES_EMBEDDINGS WHERE NOTE_ID = :1`, [note.NOTE_ID]);
      await exec(
        `INSERT INTO MEETING_NOTES_EMBEDDINGS (NOTE_ID, CUSTOMER_ID, CONTENT, EMBEDDING, MODEL_USED)
         VALUES (:1, :2, :3, TO_VECTOR(:4, 1024, FLOAT32), :5)`,
        [note.NOTE_ID, note.CUSTOMER_ID, text, vecStr, model]
      );
      process.stdout.write(`  ✓ Note ${note.NOTE_ID}\n`);
    } catch (err) {
      console.warn(`  WARN note ${note.NOTE_ID}: ${err.message}`);
    }
  }

  // ── 6. Product catalog embeddings ────────────────────────────────
  console.log('\n[2c/3] Generating product catalog embeddings...');
  const prodRows = (await exec(
    `SELECT PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION,
            INTEREST_RATE, MIN_AMOUNT, TENURE_MONTHS, RISK_LEVEL, FEATURES
       FROM PRODUCT_CATALOG WHERE IS_ACTIVE = 1`
  )).rows || [];

  for (const prod of prodRows) {
    try {
      const text   = buildProductText(prod);
      const vec    = await embedDocument(text);
      const vecStr = vectorToString(vec);
      const model  = process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0';
      await exec(`DELETE FROM PRODUCT_EMBEDDINGS WHERE PRODUCT_ID = :1`, [prod.PRODUCT_ID]);
      await exec(
        `INSERT INTO PRODUCT_EMBEDDINGS (PRODUCT_ID, CONTENT, EMBEDDING, MODEL_USED)
         VALUES (:1, :2, TO_VECTOR(:3, 1024, FLOAT32), :4)`,
        [prod.PRODUCT_ID, text, vecStr, model]
      );
      process.stdout.write(`  ✓ ${prod.PRODUCT_NAME}\n`);
    } catch (err) {
      console.warn(`  WARN product ${prod.PRODUCT_ID}: ${err.message}`);
    }
  }

  // ── 7. Market context embeddings (insert fresh rows) ─────────────
  console.log('\n[2d/3] Generating market context embeddings...');
  const mktRows = (await exec(
    `SELECT EMBED_ID, TITLE, CONTENT FROM MARKET_CONTEXT_EMBEDDINGS WHERE MODEL_USED = 'placeholder-seed'`
  )).rows || [];

  if (mktRows.length === 0) {
    // Insert the market context rows from scratch if not present
    const mktData = [
      {
        title: 'IHSG Koreksi 3.2% — Tekanan Eksternal Global',
        date:  `DATE '2026-05-15'`,
        content: 'IHSG mengalami koreksi signifikan sebesar 3.2% pada Mei 2026 dipicu oleh kekhawatiran resesi global dan kenaikan Fed Funds Rate AS. Sektor saham teknologi dan consumer goods terdampak paling besar. Investor asing mencatat net sell Rp 4.2 triliun dalam sebulan terakhir. Analis memperkirakan IHSG akan bergerak sideways di kisaran 7,000-7,400 hingga akhir Q2 2026. Rekomendasikan nasabah untuk hold posisi dan tidak panik jual. Diversifikasi ke obligasi atau deposito dapat menjadi strategi defensif yang tepat.',
      },
      {
        title: 'BI Rate Ditahan 6.25% — Sinyal Positif Obligasi',
        date:  `DATE '2026-04-20'`,
        content: 'Bank Indonesia mempertahankan BI Rate di level 6.25% pada Rapat Dewan Gubernur April 2026. Keputusan ini memberikan sinyal positif untuk pasar obligasi karena mengurangi tekanan kenaikan yield. Obligasi negara tenor 10 tahun diprediksi akan memberikan return total 7-8% hingga akhir 2026. Rekomendasikan nasabah konservatif untuk meningkatkan alokasi obligasi negara sebagai anchor portofolio.',
      },
      {
        title: 'Reksa Dana Saham Underperform — Strategi Rebalancing',
        date:  `DATE '2026-03-10'`,
        content: 'Mayoritas reksa dana saham Indonesia mencatat return negatif YTD 2026 dengan rata-rata -6.5% hingga Maret 2026. Manajer investasi menyarankan strategi rebalancing dengan menambah posisi di reksa dana pendapatan tetap atau obligasi. Nasabah dengan profil risiko agresif yang mengalami kerugian di atas 10% disarankan untuk melakukan average down secara bertahap. Horizon investasi minimal 3-5 tahun untuk saham.',
      },
      {
        title: 'Deposito Perbankan — Tren Rate & Strategi Nasabah',
        date:  `DATE '2026-05-01'`,
        content: 'Suku bunga deposito perbankan nasional mulai menunjukkan tekanan turun seiring dengan sinyal pelonggaran moneter global. Bank-bank besar mulai memangkas rate deposito 25-50 bps. Nasabah dengan deposito jatuh tempo dalam 60 hari disarankan untuk segera berkonsultasi dengan RM mengenai pilihan perpanjangan atau relokasi ke instrumen dengan return lebih tinggi seperti obligasi negara atau reksa dana pendapatan tetap.',
      },
    ];

    for (const m of mktData) {
      try {
        const vec    = await embedDocument(`${m.title}\n${m.content}`);
        const vecStr = vectorToString(vec);
        const model  = process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0';
        await exec(
          `INSERT INTO MARKET_CONTEXT_EMBEDDINGS (EVENT_DATE, TITLE, CONTENT, EMBEDDING, MODEL_USED)
           VALUES (${m.date}, :1, :2, TO_VECTOR(:3, 1024, FLOAT32), :4)`,
          [m.title, m.content, vecStr, model]
        );
        process.stdout.write(`  ✓ ${m.title.substring(0, 50)}\n`);
      } catch (err) {
        console.warn(`  WARN market: ${err.message}`);
      }
    }
  } else {
    // Update existing placeholder rows with real embeddings
    for (const mkt of mktRows) {
      try {
        const vec    = await embedDocument(`${mkt.TITLE}\n${mkt.CONTENT}`);
        const vecStr = vectorToString(vec);
        const model  = process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0';
        await exec(
          `UPDATE MARKET_CONTEXT_EMBEDDINGS
              SET EMBEDDING = TO_VECTOR(:1, 1024, FLOAT32), MODEL_USED = :2
            WHERE EMBED_ID = :3`,
          [vecStr, model, mkt.EMBED_ID]
        );
        process.stdout.write(`  ✓ ${mkt.TITLE?.substring(0, 50)}\n`);
      } catch (err) {
        console.warn(`  WARN market ${mkt.EMBED_ID}: ${err.message}`);
      }
    }
  }

  // ── 8. Cleanup ────────────────────────────────────────────────────
  await _conn.close();
  try { await oracledb.getPool('seedPool').close(5); } catch (_) {}

  console.log('\n──────────────────────────────────────────────');
  console.log('✅  Seed + embeddings complete!');
  console.log('\nTest accounts (password: danamon2026):');
  console.log('  anisa   — Senior RM');
  console.log('  budi    — Relationship Manager');
  console.log('  dewi    — Wealth Advisor');
  console.log('  manager — Branch Manager\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function upsertEmbed(table, _keys, whereClause, whereBinds, content, insertExtras) {
  try {
    const vec    = await embedDocument(content);
    const vecStr = vectorToString(vec);
    const model  = process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0';

    await exec(`DELETE FROM ${table} WHERE ${whereClause}`, whereBinds);

    if (table === 'CUSTOMER_EMBEDDINGS') {
      await exec(
        `INSERT INTO CUSTOMER_EMBEDDINGS (CUSTOMER_ID, CONTENT_TYPE, CONTENT, EMBEDDING, MODEL_USED)
         VALUES (:1, :2, :3, TO_VECTOR(:4, 1024, FLOAT32), :5)`,
        [...insertExtras, content, vecStr, model]
      );
    }
  } catch (err) {
    console.warn(`  WARN ${table}: ${err.message}`);
  }
}

function buildCustomerProfileText(cust) {
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

function buildProductText(prod) {
  let features = '';
  try { features = JSON.parse(prod.FEATURES || '[]').join(', '); } catch (_) {}
  return [
    `Produk: ${prod.PRODUCT_NAME}`,
    `Kategori: ${prod.CATEGORY}`,
    `Deskripsi: ${prod.DESCRIPTION || ''}`,
    `Bunga/Return: ${prod.INTEREST_RATE || '-'}% per tahun`,
    `Tenor: ${prod.TENURE_MONTHS ? prod.TENURE_MONTHS + ' bulan' : 'fleksibel'}`,
    `Risiko: ${prod.RISK_LEVEL}`,
    `Minimum: Rp ${Number(prod.MIN_AMOUNT || 0).toLocaleString('id-ID')}`,
    `Fitur: ${features}`,
  ].join('\n');
}

main().catch(err => {
  console.error('\nFatal:', err.message || err);
  if (_conn) _conn.close().catch(() => {});
  process.exit(1);
});
