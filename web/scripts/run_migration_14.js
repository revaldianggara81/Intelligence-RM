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

  // ── 1. Create ACTION_PLAN_TEMPLATES table ──────────────────────────────────
  await run('CREATE ACTION_PLAN_TEMPLATES', `CREATE TABLE ACTION_PLAN_TEMPLATES (
    TEMPLATE_ID    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    SCENARIO_TYPE  VARCHAR2(50)   NOT NULL,
    SECTION_KEY    VARCHAR2(50)   NOT NULL,
    SECTION_LABEL  VARCHAR2(100)  NOT NULL,
    SECTION_ICON   VARCHAR2(20),
    SECTION_ORDER  NUMBER         DEFAULT 1,
    GUIDANCE       VARCHAR2(4000) NOT NULL,
    IS_ACTIVE      NUMBER(1)      DEFAULT 1,
    UPDATED_AT     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UK_APT_SCENARIO_SECTION UNIQUE (SCENARIO_TYPE, SECTION_KEY)
  )`);

  await run('IDX_APT_SCENARIO',
    `CREATE INDEX IDX_APT_SCENARIO ON ACTION_PLAN_TEMPLATES (SCENARIO_TYPE, IS_ACTIVE)`);

  // ── 2. Seed templates ──────────────────────────────────────────────────────
  const upsert = async (scenarioType, sectionKey, sectionLabel, sectionIcon, sectionOrder, guidance) => {
    try {
      await db.execute(
        `MERGE INTO ACTION_PLAN_TEMPLATES t
         USING (SELECT :1 AS SCENARIO_TYPE, :2 AS SECTION_KEY FROM DUAL) s
         ON (t.SCENARIO_TYPE = s.SCENARIO_TYPE AND t.SECTION_KEY = s.SECTION_KEY)
         WHEN MATCHED THEN
           UPDATE SET SECTION_LABEL = :3, SECTION_ICON = :4, SECTION_ORDER = :5,
                      GUIDANCE = :6, UPDATED_AT = CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN
           INSERT (SCENARIO_TYPE, SECTION_KEY, SECTION_LABEL, SECTION_ICON, SECTION_ORDER, GUIDANCE)
           VALUES (:7, :8, :9, :10, :11, :12)`,
        [scenarioType, sectionKey,
         sectionLabel, sectionIcon, sectionOrder, guidance,
         scenarioType, sectionKey, sectionLabel, sectionIcon, sectionOrder, guidance]
      );
      console.log(`[✓] Seeded ${scenarioType}/${sectionKey}`);
    } catch(e) {
      console.error(`[✗] Seed ${scenarioType}/${sectionKey}:`, e.message);
    }
  };

  // ── MATURITY scenario ──────────────────────────────────────────────────────
  await upsert('maturity', 'opening', 'OPENING', '🎙️', 1,
    `Mulai dengan salam hangat dan sebut nama nasabah secara personal. Referensikan hubungan atau produk yang dimiliki. Sebutkan alasan menghubungi secara spesifik: nama produk yang akan jatuh tempo, kapan tanggalnya, dan berapa nilai nominalnya dalam Rupiah. Gunakan nada: hangat, profesional, tidak terburu-buru. Buat terasa seperti percakapan biasa — bukan skrip kaku. Maksimal 3 kalimat.`
  );

  await upsert('maturity', 'value_proposition', 'VALUE PROPOSITION', '💎', 2,
    `Jelaskan manfaat konkret dari produk alternatif terbaik yang direkomendasikan. Gunakan angka spesifik dari data nasabah: perbandingan return (persen dan Rupiah per tahun vs deposito saat ini), potensi pertumbuhan dana dalam 1–3 tahun. Kaitkan langsung ke profil risiko dan kondisi keuangan nasabah. Tunjukkan "biaya opportunity" jika dana hanya diperpanjang deposito saja. Maksimal 3 kalimat — langsung ke poin utama.`
  );

  await upsert('maturity', 'objection_handling', 'OBJECTION HANDLING', '🛡️', 3,
    `Antisipasi dan siapkan respons untuk 3 keberatan yang paling mungkin dari nasabah ini berdasarkan profil risikonya: (1) "Saya khawatir dengan risikonya" — respons dengan data historis produk, jaminan pemerintah jika ada, dan kesesuaian profil risiko; (2) "Saya ingin dana tetap fleksibel dan bisa dicairkan kapan saja" — tawarkan produk yang lebih likuid sebagai kompromi; (3) "Saya sudah puas dengan deposito saja" — tunjukkan return yang lebih tinggi dan potensi pertumbuhan yang nasabah lewatkan. Format ketat: [Keberatan] → [Respons RM yang empati + data].`
  );

  await upsert('maturity', 'close', 'CLOSE', '✅', 4,
    `Tutup dengan satu pertanyaan konkret yang mendorong komitmen tindakan berikutnya. Berikan pilihan yang mudah dijawab "ya": (a) jadwal meeting singkat 30 menit hari ini atau besok, (b) persetujuan kirim proposal tertulis via WhatsApp/email dalam 1 jam, atau (c) konfirmasi waktu follow-up telepon besok pagi. Sertakan sense of urgency yang natural berdasarkan tanggal jatuh tempo deposito. Maksimal 2 kalimat — buat mudah untuk nasabah mengambil langkah berikutnya.`
  );

  // ── RECOMMENDATION scenario ────────────────────────────────────────────────
  await upsert('recommendation', 'opening', 'OPENING', '🎙️', 1,
    `Mulai dengan salam personal dan apresiasi kepercayaan nasabah. Referensikan profil investasi atau tujuan keuangan yang sudah diketahui. Sebutkan bahwa Anda telah menyiapkan rekomendasi produk khusus berdasarkan kondisi portofolio terkini. Nada: antusias, percaya diri, berorientasi pada kepentingan nasabah.`
  );

  await upsert('recommendation', 'value_proposition', 'VALUE PROPOSITION', '💎', 2,
    `Jelaskan nilai unik dari kombinasi produk yang direkomendasikan: diversifikasi portofolio, potensi return lebih tinggi, atau perlindungan dari risiko pasar. Gunakan angka konkret: proyeksi return tahunan, perbandingan dengan kondisi portofolio saat ini. Kaitkan ke tujuan keuangan spesifik nasabah (pendidikan anak, pensiun, dll).`
  );

  await upsert('recommendation', 'objection_handling', 'OBJECTION HANDLING', '🛡️', 3,
    `Antisipasi 3 keberatan umum: (1) "Portofolio saya sudah cukup terdiversifikasi" — tunjukkan gap atau konsentrasi berlebih yang teridentifikasi; (2) "Kondisi pasar sedang tidak menentu" — jelaskan strategi dollar-cost averaging atau produk yang lebih defensif; (3) "Saya tidak punya dana tambahan untuk investasi baru" — sarankan rebalancing dari produk yang sudah ada. Format: [Keberatan] → [Respons RM].`
  );

  await upsert('recommendation', 'close', 'CLOSE', '✅', 4,
    `Tutup dengan ajakan konkret: jadwalkan meeting product presentation, kirim ilustrasi simulasi return via WhatsApp, atau proses pembelian produk hari ini jika nasabah sudah siap. Tekankan window of opportunity jika ada (masa penawaran terbatas, kondisi pasar yang tepat, dll).`
  );

  // ── CAMPAIGN_SCAN scenario ─────────────────────────────────────────────────
  await upsert('campaign_scan', 'opening', 'OPENING', '🎙️', 1,
    `Buka dengan informasi eksklusif: nasabah telah teridentifikasi eligible untuk program spesial. Sebutkan nama campaign dan benefit utamanya di kalimat pertama untuk menarik perhatian. Gunakan nada: antusias, eksklusif — nasabah terpilih, bukan semua orang.`
  );

  await upsert('campaign_scan', 'value_proposition', 'VALUE PROPOSITION', '💎', 2,
    `Jelaskan benefit campaign secara konkret dalam Rupiah atau persentase: bonus bunga, cashback, hadiah, atau privilege tambahan. Bandingkan dengan kondisi reguler tanpa campaign. Sebutkan syarat utama yang mudah dipenuhi nasabah ini berdasarkan profil dan AUM-nya.`
  );

  await upsert('campaign_scan', 'objection_handling', 'OBJECTION HANDLING', '🛡️', 3,
    `Antisipasi keberatan: (1) "Saya perlu pikir-pikir dulu" — ingatkan bahwa program terbatas dan deadline-nya; (2) "Syaratnya terlalu ribet" — sederhanakan: nasabah ini sudah hampir memenuhi syarat; (3) "Benefit-nya tidak sebanding" — hitung total nilai benefit dalam Rupiah untuk nasabah ini spesifik.`
  );

  await upsert('campaign_scan', 'close', 'CLOSE', '✅', 4,
    `Tutup dengan langkah pendaftaran yang konkret dan mudah: proses registrasi campaign online, kunjungi cabang terdekat, atau RM bisa proseskan langsung. Sebutkan deadline campaign untuk menciptakan urgensi yang sah.`
  );

  // ── ALERT scenario ─────────────────────────────────────────────────────────
  await upsert('alert', 'opening', 'OPENING', '🎙️', 1,
    `Buka dengan nada yang tenang dan reassuring — nasabah mungkin cemas melihat alert portofolio. Akui situasi secara langsung tanpa membesar-besarkan. Tunjukkan bahwa Anda proaktif memantau portofolio mereka dan sudah siap dengan solusi.`
  );

  await upsert('alert', 'value_proposition', 'VALUE PROPOSITION', '💎', 2,
    `Jelaskan tindakan spesifik yang bisa mengatasi alert ini: rebalancing, lindung nilai (hedging), atau averaging down. Gunakan angka konkret: estimasi dampak jika tidak ditindaklanjuti vs jika dilakukan tindakan. Tunjukkan track record atau data historis yang mendukung rekomendasi ini.`
  );

  await upsert('alert', 'objection_handling', 'OBJECTION HANDLING', '🛡️', 3,
    `Antisipasi reaksi: (1) "Kenapa baru sekarang dikabari?" — tunjukkan monitoring real-time dan proaktivitas RM; (2) "Lebih baik tunggu pemulihan sendiri" — berikan data historis tentang recovery time dan cost of inaction; (3) "Saya mau cut loss sekarang" — diskusikan dampak dan alternatif yang lebih optimal.`
  );

  await upsert('alert', 'close', 'CLOSE', '✅', 4,
    `Tutup dengan komitmen tindakan yang jelas: jadwalkan konsultasi darurat hari ini, kirim analisis lengkap dalam 2 jam, atau minta persetujuan untuk tindakan rebalancing segera. Pastikan nasabah merasa ada orang yang aktif menjaga portofolionya.`
  );

  await db.close();
  console.log('\n[✓] Migration 14 complete — ACTION_PLAN_TEMPLATES ready');
})();
