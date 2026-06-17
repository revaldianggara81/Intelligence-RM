-- ═══════════════════════════════════════════════════════════════════
-- Intelligence RM Platform — Seed Data
-- Run AFTER schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. RM USERS  (passwords are bcrypt of "danamon2026")
-- ───────────────────────────────────────────────────────────────────
INSERT INTO RM_USERS (USER_ID, USERNAME, PASSWORD_HASH, FULL_NAME, ROLE, INITIALS, EMAIL, BRANCH, IS_ACTIVE)
VALUES ('rm001','anisa','$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGwad7.AJq0TGxT0z2','Anisa Rahma','Senior RM','AR','anisa.rahma@danamon.co.id','Jakarta Pusat',1);

INSERT INTO RM_USERS (USER_ID, USERNAME, PASSWORD_HASH, FULL_NAME, ROLE, INITIALS, EMAIL, BRANCH, IS_ACTIVE)
VALUES ('rm002','budi','$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGwad7.AJq0TGxT0z2','Budi Prasetyo','Relationship Manager','BP','budi.prasetyo@danamon.co.id','Surabaya',1);

INSERT INTO RM_USERS (USER_ID, USERNAME, PASSWORD_HASH, FULL_NAME, ROLE, INITIALS, EMAIL, BRANCH, IS_ACTIVE)
VALUES ('rm003','dewi','$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGwad7.AJq0TGxT0z2','Dewi Kusuma','Wealth Advisor','DK','dewi.kusuma@danamon.co.id','Bandung',1);

INSERT INTO RM_USERS (USER_ID, USERNAME, PASSWORD_HASH, FULL_NAME, ROLE, INITIALS, EMAIL, BRANCH, IS_ACTIVE)
VALUES ('rm004','manager','$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGwad7.AJq0TGxT0z2','Ahmad Fauzi','Branch Manager','AF','ahmad.fauzi@danamon.co.id','Jakarta Pusat',1);

-- ───────────────────────────────────────────────────────────────────
-- 2. PRODUCT CATALOG
-- ───────────────────────────────────────────────────────────────────
INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD001','Deposito Reguler 6 Bulan','deposito','Deposito berjangka dengan tenor 6 bulan, bunga kompetitif',5.75,10000000,10000000000,6,'low',1,DATE '2024-01-01',DATE '2026-12-31','["Bunga 5.75% p.a.","Dapat diperpanjang otomatis","Dijamin LPS hingga 2M"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD002','Deposito Prioritas 12 Bulan','deposito','Deposito eksklusif nasabah Prioritas tenor 12 bulan',6.25,100000000,null,12,'low',1,DATE '2024-01-01',DATE '2026-12-31','["Bunga 6.25% p.a.","Pencairan awal tanpa penalti","Dedicated RM support"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD003','Reksa Dana Pendapatan Tetap','reksa_dana','Reksa dana dengan portofolio obligasi pemerintah dan korporasi',7.50,1000000,null,null,'medium',1,DATE '2024-01-01',DATE '2026-12-31','["Target return 7-8% p.a.","Likuiditas harian","Dikelola manajer investasi berpengalaman"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD004','Reksa Dana Saham Bluechip','reksa_dana','Reksa dana saham terfokus pada emiten LQ45 dan bluechip',12.00,1000000,null,null,'high',1,DATE '2024-01-01',DATE '2026-12-31','["Potensi return 10-15% p.a.","Diversifikasi saham LQ45","Laporan portofolio real-time"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD005','Obligasi Negara Ritel ORI024','obligasi','Surat Berharga Negara ritel berbunga tetap tenor 3 tahun',6.00,1000000,5000000000,36,'low',1,DATE '2024-06-01',DATE '2024-07-31','["Kupon 6.0% p.a.","Dijamin pemerintah","Tradeable di pasar sekunder"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD006','Asuransi Jiwa Unit Link','asuransi','Proteksi jiwa sekaligus investasi reksa dana',8.00,2000000,null,120,'medium',1,DATE '2024-01-01',DATE '2026-12-31','["Premi mulai 2jt/bulan","Manfaat jiwa 200% premi","Investasi di reksa dana pilihan"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD007','Tabungan Danamon Lebih','tabungan','Tabungan reguler dengan bunga berjenjang dan bebas biaya',2.50,500000,null,null,'low',1,DATE '2024-01-01',DATE '2026-12-31','["Bunga berjenjang s/d 2.5%","Bebas biaya adm","Gratis transfer antar bank"]');

INSERT INTO PRODUCT_CATALOG (PRODUCT_ID, PRODUCT_NAME, CATEGORY, DESCRIPTION, INTEREST_RATE, MIN_AMOUNT, MAX_AMOUNT, TENURE_MONTHS, RISK_LEVEL, IS_ACTIVE, VALID_FROM, VALID_TO, FEATURES)
VALUES ('PROD008','Deposito Reguler 3 Bulan','deposito','Deposito berjangka tenor 3 bulan cocok untuk dana darurat',5.25,10000000,null,3,'low',1,DATE '2024-01-01',DATE '2026-12-31','["Bunga 5.25% p.a.","Pencairan fleksibel","Roll-over otomatis"]');

-- ───────────────────────────────────────────────────────────────────
-- 3. CUSTOMERS
-- ───────────────────────────────────────────────────────────────────
INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST001','Budi Santoso','BS','#2196F3',54,'Male','budi.santoso@email.com','+62-812-3456-7890','Jl. Sudirman No. 45, Jakarta Pusat 10220','Conservative','prioritas','Prioritas',85000000,2850000000,'rm001','Verified',DATE '2026-08-15','Nasabah senior loyal 12 tahun. Preferensi produk konservatif. Deposito jatuh tempo Q3 2026.');

INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST002','Sari Wijaya','SW','#9C27B0',38,'Female','sari.wijaya@email.com','+62-813-9876-5432','Jl. Thamrin No. 12, Jakarta Selatan 12190','Moderate','privilege','Privilege',45000000,1200000000,'rm001','Verified',DATE '2026-11-20','Profesional muda. Minat portofolio diversifikasi. Target pensiun dini usia 55.');

INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST003','Hendra Kusuma','HK','#FF5722',45,'Male','hendra.kusuma@email.com','+62-811-2345-6789','Jl. Gatot Subroto No. 88, Jakarta Selatan 12930','Aggressive','prioritas','Prioritas',120000000,5600000000,'rm001','Verified',DATE '2027-01-10','Pengusaha properti. Toleransi risiko tinggi. Aktif di pasar modal.');

INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST004','Dewi Lestari','DL','#4CAF50',42,'Female','dewi.lestari@email.com','+62-814-5678-9012','Jl. Kemang Raya No. 23, Jakarta Selatan 12730','Moderate','privilege','Privilege',55000000,1850000000,'rm001','Verified',DATE '2026-09-30','Dokter spesialis. Nasabah 7 tahun. Rencana pendidikan anak prioritas.');

INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST005','Rudi Santoso','RS','#FF9800',61,'Male','rudi.santoso@email.com','+62-815-6789-0123','Jl. Pondok Indah No. 56, Jakarta Selatan 12310','Conservative','prioritas','Prioritas',65000000,4200000000,'rm001','Verified',DATE '2026-07-01','Pensiunan direktur BUMN. Fokus capital preservation dan income reguler.');

INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST006','Reza Pratama','RP','#00BCD4',29,'Male','reza.pratama@email.com','+62-817-8901-2345','Jl. Kuningan No. 7, Jakarta Selatan 12980','Aggressive','regular','Regular',18000000,280000000,'rm001','Verified',DATE '2027-03-15','Tech entrepreneur. High growth potential. Baru mulai investasi serius tahun lalu.');

INSERT INTO CUSTOMERS (CUSTOMER_ID,FULL_NAME,INITIALS,AVATAR_COLOR,AGE,GENDER,EMAIL,PHONE,ADDRESS,RISK_PROFILE,TIER,TIER_LABEL,MONTHLY_INCOME,TOTAL_AUM,RM_USER_ID,KYC_STATUS,KYC_EXPIRY,NOTES)
VALUES ('CUST007','Mega Wulandari','MW','#E91E63',35,'Female','mega.wulandari@email.com','+62-818-9012-3456','Jl. SCBD Lot 8, Jakarta Selatan 12190','Moderate','privilege','Privilege',72000000,2100000000,'rm001','Verified',DATE '2026-06-30','CFO perusahaan manufaktur. Sophisticated investor. Tertarik obligasi dan reksa dana.');

-- ───────────────────────────────────────────────────────────────────
-- 4. CUSTOMER PRODUCTS (holdings)
-- ───────────────────────────────────────────────────────────────────
-- Budi Santoso (CUST001) — Conservative
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST001','PROD002','Deposito Prioritas 12 Bulan','deposito',500000000,6.25,DATE '2025-07-15',DATE '2026-07-15','Active',4.23);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST001','PROD001','Deposito Reguler 6 Bulan','deposito',300000000,5.75,DATE '2025-12-20',DATE '2026-06-20','Active',1.15);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST001','PROD005','Obligasi Negara Ritel ORI024','obligasi',200000000,6.00,DATE '2024-07-01',DATE '2027-07-01','Active',12.50);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST001','PROD007','Tabungan Danamon Lebih','tabungan',150000000,2.50,DATE '2022-03-01',null,'Active',2.50);

-- Sari Wijaya (CUST002) — Moderate
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST002','PROD003','Reksa Dana Pendapatan Tetap','reksa_dana',400000000,7.50,DATE '2024-03-01',null,'Active',9.30);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST002','PROD001','Deposito Reguler 6 Bulan','deposito',200000000,5.75,DATE '2025-11-10',DATE '2026-05-10','Active',0.85);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST002','PROD006','Asuransi Jiwa Unit Link','asuransi',50000000,8.00,DATE '2023-01-15',null,'Active',15.20);

-- Hendra Kusuma (CUST003) — Aggressive
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST003','PROD004','Reksa Dana Saham Bluechip','reksa_dana',2000000000,12.00,DATE '2024-01-10',null,'Active',-8.50);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST003','PROD002','Deposito Prioritas 12 Bulan','deposito',800000000,6.25,DATE '2025-06-01',DATE '2026-06-01','Active',3.10);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST003','PROD005','Obligasi Negara Ritel ORI024','obligasi',500000000,6.00,DATE '2024-07-01',DATE '2027-07-01','Active',12.50);

-- Dewi Lestari (CUST004) — Moderate
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST004','PROD003','Reksa Dana Pendapatan Tetap','reksa_dana',600000000,7.50,DATE '2023-08-01',null,'Active',18.40);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST004','PROD001','Deposito Reguler 6 Bulan','deposito',250000000,5.75,DATE '2025-12-01',DATE '2026-06-01','Active',0.95);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST004','PROD006','Asuransi Jiwa Unit Link','asuransi',100000000,8.00,DATE '2022-05-01',null,'Active',28.70);

-- Rudi Santoso (CUST005) — Conservative
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST005','PROD002','Deposito Prioritas 12 Bulan','deposito',1500000000,6.25,DATE '2025-07-01',DATE '2026-07-01','Active',3.10);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST005','PROD005','Obligasi Negara Ritel ORI024','obligasi',1000000000,6.00,DATE '2024-07-01',DATE '2027-07-01','Active',12.50);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST005','PROD003','Reksa Dana Pendapatan Tetap','reksa_dana',800000000,7.50,DATE '2023-04-01',null,'Active',22.10);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST005','PROD007','Tabungan Danamon Lebih','tabungan',200000000,2.50,DATE '2020-01-01',null,'Active',2.50);

-- Reza Pratama (CUST006) — Aggressive
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST006','PROD004','Reksa Dana Saham Bluechip','reksa_dana',150000000,12.00,DATE '2025-03-01',null,'Active',-12.30);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST006','PROD008','Deposito Reguler 3 Bulan','deposito',50000000,5.25,DATE '2026-03-01',DATE '2026-06-01','Active',0.65);

-- Mega Wulandari (CUST007) — Moderate
INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST007','PROD003','Reksa Dana Pendapatan Tetap','reksa_dana',700000000,7.50,DATE '2024-02-01',null,'Active',11.20);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST007','PROD002','Deposito Prioritas 12 Bulan','deposito',500000000,6.25,DATE '2025-08-15',DATE '2026-08-15','Active',2.60);

INSERT INTO CUSTOMER_PRODUCTS (CUSTOMER_ID,PRODUCT_ID,PRODUCT_NAME,CATEGORY,AMOUNT,INTEREST_RATE,START_DATE,MATURITY_DATE,STATUS,RETURN_PCT)
VALUES ('CUST007','PROD005','Obligasi Negara Ritel ORI024','obligasi',400000000,6.00,DATE '2024-07-01',DATE '2027-07-01','Active',12.50);

-- ───────────────────────────────────────────────────────────────────
-- 5. ALERTS
-- ───────────────────────────────────────────────────────────────────
INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST001','maturity','high','Deposito Jatuh Tempo 50 Hari — Budi Santoso','Deposito Prioritas 12 Bulan senilai Rp 500 juta akan jatuh tempo pada 15 Juli 2026 (50 hari lagi). Perlu tindakan segera untuk mencegah roll-over ke rate lebih rendah.','days_to_maturity','50','60','Open');

INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST001','maturity','medium','Deposito 6 Bulan Jatuh Tempo — Budi Santoso','Deposito Reguler 6 Bulan senilai Rp 300 juta akan jatuh tempo 20 Juni 2026 (25 hari).','days_to_maturity','25','60','Open');

INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST003','portfolio_loss','high','Kerugian Reksa Dana -8.5% — Hendra Kusuma','Reksa Dana Saham Bluechip mengalami penurunan -8.5% YTD akibat koreksi IHSG. Nilai kerugian unrealized mencapai Rp 170 juta.','portfolio_loss_pct','-8.50','-7.00','Open');

INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST006','portfolio_loss','high','Kerugian Reksa Dana -12.3% — Reza Pratama','Reksa Dana Saham Bluechip turun -12.3% YTD. Nilai kerugian unrealized Rp 18.45 juta dari pokok Rp 150 juta.','portfolio_loss_pct','-12.30','-10.00','Open');

INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST005','maturity','medium','Deposito Prioritas Jatuh Tempo — Rudi Santoso','Deposito Prioritas 12 Bulan senilai Rp 1.5 miliar jatuh tempo 1 Juli 2026 (36 hari). Perlu konsultasi alokasi ulang.','days_to_maturity','36','60','Open');

INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST004','kyc_expiry','medium','KYC Mendekati Kadaluarsa — Dewi Lestari','Dokumen KYC Dewi Lestari akan kadaluarsa pada 30 September 2026 (127 hari). Segera jadwalkan pembaruan dokumen.','kyc_days_remaining','127','180','Open');

INSERT INTO ALERTS (CUSTOMER_ID,ALERT_TYPE,SEVERITY,TITLE,MESSAGE,METRIC_KEY,METRIC_VALUE,THRESHOLD,STATUS)
VALUES ('CUST002','campaign','low','Eligible Upgrade Privilege — Sari Wijaya','Sari Wijaya memenuhi syarat upgrade ke Prioritas. AUM rata-rata 3 bulan Rp 1.2 miliar, di atas threshold Rp 1 miliar.','aum_3m_avg','1200000000','1000000000','Open');

-- ───────────────────────────────────────────────────────────────────
-- 6. CAMPAIGNS
-- ───────────────────────────────────────────────────────────────────
INSERT INTO CAMPAIGNS (CAMPAIGN_ID,NAME,DESCRIPTION,TYPE,STATUS,START_DATE,END_DATE,RULES)
VALUES ('CAMP001','Privilege Upgrade Q2 2026','Program upgrade nasabah Privilege ke Prioritas berdasarkan pertumbuhan AUM konsisten','privilege_upgrade','Active',DATE '2026-04-01',DATE '2026-06-30','[{"id":1,"desc":"AUM rata-rata 3 bulan >= Rp 1 miliar","field":"aum_3m_avg","op":">=","value":1000000000},{"id":2,"desc":"Tidak ada transaksi gagal 6 bulan terakhir","field":"failed_txn","op":"=","value":0},{"id":3,"desc":"KYC status Verified","field":"kyc_status","op":"=","value":"Verified"}]');

INSERT INTO CAMPAIGNS (CAMPAIGN_ID,NAME,DESCRIPTION,TYPE,STATUS,START_DATE,END_DATE,RULES)
VALUES ('CAMP002','Retensi Deposito Jatuh Tempo','Kampanye retensi untuk nasabah dengan deposito jatuh tempo dalam 60 hari','retention','Active',DATE '2026-05-01',DATE '2026-07-31','[{"id":1,"desc":"Deposito jatuh tempo dalam 60 hari","field":"maturity_days","op":"<=","value":60},{"id":2,"desc":"Total AUM >= Rp 500 juta","field":"total_aum","op":">=","value":500000000},{"id":3,"desc":"Nasabah aktif minimal 2 tahun","field":"account_age_months","op":">=","value":24}]');

INSERT INTO CAMPAIGNS (CAMPAIGN_ID,NAME,DESCRIPTION,TYPE,STATUS,START_DATE,END_DATE,RULES)
VALUES ('CAMP003','Penawaran ORI025 — Nasabah Konservatif','Penawaran eksklusif Obligasi Negara Ritel ORI025 untuk nasabah dengan profil konservatif','product_placement','Active',DATE '2026-06-01',DATE '2026-07-15','[{"id":1,"desc":"Profil risiko Conservative","field":"risk_profile","op":"=","value":"Conservative"},{"id":2,"desc":"AUM >= Rp 500 juta","field":"total_aum","op":">=","value":500000000},{"id":3,"desc":"Tier Prioritas atau Privilege","field":"tier","op":"in","value":["prioritas","privilege"]}]');

-- Campaign eligibility
INSERT INTO CAMPAIGN_ELIGIBILITY (CAMPAIGN_ID,CUSTOMER_ID,IS_ELIGIBLE,RULE1_PASS,RULE2_PASS,RULE3_PASS,AUM_3M_AVG,NOTES)
VALUES ('CAMP001','CUST002',1,1,1,1,1200000000,'Semua rules terpenuhi. Rekomendasikan upgrade ke Prioritas.');

INSERT INTO CAMPAIGN_ELIGIBILITY (CAMPAIGN_ID,CUSTOMER_ID,IS_ELIGIBLE,RULE1_PASS,RULE2_PASS,RULE3_PASS,AUM_3M_AVG,NOTES)
VALUES ('CAMP001','CUST004',0,1,1,1,1850000000,'Eligible secara AUM namun belum ada konfirmasi dari nasabah.');

INSERT INTO CAMPAIGN_ELIGIBILITY (CAMPAIGN_ID,CUSTOMER_ID,IS_ELIGIBLE,RULE1_PASS,RULE2_PASS,RULE3_PASS,AUM_3M_AVG,NOTES)
VALUES ('CAMP002','CUST001',1,1,1,1,2850000000,'Deposito 500jt jatuh tempo 50 hari. Prioritas tinggi.');

INSERT INTO CAMPAIGN_ELIGIBILITY (CAMPAIGN_ID,CUSTOMER_ID,IS_ELIGIBLE,RULE1_PASS,RULE2_PASS,RULE3_PASS,AUM_3M_AVG,NOTES)
VALUES ('CAMP002','CUST005',1,1,1,1,4200000000,'Deposito 1.5M jatuh tempo 36 hari.');

INSERT INTO CAMPAIGN_ELIGIBILITY (CAMPAIGN_ID,CUSTOMER_ID,IS_ELIGIBLE,RULE1_PASS,RULE2_PASS,RULE3_PASS,AUM_3M_AVG,NOTES)
VALUES ('CAMP003','CUST001',1,1,1,1,2850000000,'Profil konservatif, AUM besar, tier prioritas.');

INSERT INTO CAMPAIGN_ELIGIBILITY (CAMPAIGN_ID,CUSTOMER_ID,IS_ELIGIBLE,RULE1_PASS,RULE2_PASS,RULE3_PASS,AUM_3M_AVG,NOTES)
VALUES ('CAMP003','CUST005',1,1,1,1,4200000000,'Profil konservatif, AUM sangat besar, tier prioritas.');

-- ───────────────────────────────────────────────────────────────────
-- 7. MEETING NOTES
-- ───────────────────────────────────────────────────────────────────
INSERT INTO MEETING_NOTES (CUSTOMER_ID,RM_USER_ID,MEETING_DATE,NOTE_TYPE,SUMMARY,TOPICS,PRODUCTS_DISCUSSED,FOLLOW_UP)
VALUES ('CUST001','rm001',DATE '2026-05-10','meeting','Pertemuan rutin membahas portofolio dan rencana investasi Q3 2026. Budi menyatakan puas dengan return deposito namun khawatir dengan kondisi pasar. Berencana tambah deposito setelah jatuh tempo Juli.','["Review portofolio","Kondisi ekonomi makro","Rencana deposito baru"]','["Deposito Prioritas 12 Bulan","Obligasi ORI024"]','Hubungi 2 minggu sebelum jatuh tempo deposito. Siapkan penawaran rate deposito terbaru.');

INSERT INTO MEETING_NOTES (CUSTOMER_ID,RM_USER_ID,MEETING_DATE,NOTE_TYPE,SUMMARY,TOPICS,PRODUCTS_DISCUSSED,FOLLOW_UP)
VALUES ('CUST002','rm001',DATE '2026-05-15','call','Call telepon menindaklanjuti performa reksa dana. Sari menanyakan tentang obligasi negara sebagai alternatif konservatif. Tertarik dengan ORI025.','["Performa reksa dana","Diversifikasi ke obligasi","Target return 2026"]','["Reksa Dana Pendapatan Tetap","ORI025"]','Kirimkan prospektus ORI025 via email. Jadwalkan presentasi produk minggu depan.');

INSERT INTO MEETING_NOTES (CUSTOMER_ID,RM_USER_ID,MEETING_DATE,NOTE_TYPE,SUMMARY,TOPICS,PRODUCTS_DISCUSSED,FOLLOW_UP)
VALUES ('CUST003','rm001',DATE '2026-05-12','meeting','Pertemuan urgen terkait kerugian reksa dana saham -8.5%. Hendra meminta analisis mendalam dan rekomendasi apakah hold atau cut loss. Masih percaya jangka panjang.','["Analisis kerugian reksa dana","Strategi hold vs cut loss","Outlook pasar saham Q3"]','["Reksa Dana Saham Bluechip"]','Kirimkan analisis teknikal IHSG. Follow up dalam 3 hari dengan rekomendasi konkret.');

INSERT INTO MEETING_NOTES (CUSTOMER_ID,RM_USER_ID,MEETING_DATE,NOTE_TYPE,SUMMARY,TOPICS,PRODUCTS_DISCUSSED,FOLLOW_UP)
VALUES ('CUST004','rm001',DATE '2026-04-28','meeting','Diskusi perencanaan pendidikan anak. Dewi ingin alokasikan sebagian investasi untuk dana pendidikan S2 anak tertua (usia 15). Waktu 3 tahun.','["Dana pendidikan","Profil risiko","Reksa dana campuran"]','["Reksa Dana Pendapatan Tetap","Asuransi Unit Link"]','Siapkan proyeksi kebutuhan dana pendidikan. Rekomendasikan reksa dana campuran dengan tenor 3 tahun.');

INSERT INTO MEETING_NOTES (CUSTOMER_ID,RM_USER_ID,MEETING_DATE,NOTE_TYPE,SUMMARY,TOPICS,PRODUCTS_DISCUSSED,FOLLOW_UP)
VALUES ('CUST006','rm001',DATE '2026-05-20','visit','Kunjungan ke kantor Reza. Diskusi tentang kerugian reksa dana -12.3%. Reza baru pertama kali mengalami kerugian besar dan sangat khawatir. Perlu edukasi lebih lanjut tentang investasi jangka panjang.','["Manajemen kerugian","Edukasi investasi saham","Diversifikasi portofolio"]','["Reksa Dana Saham Bluechip","Deposito"]','Kirimkan materi edukasi investasi saham jangka panjang. Sarankan diversifikasi ke reksa dana campuran.');

-- ───────────────────────────────────────────────────────────────────
-- 8. MARKET CONTEXT (for RAG — Scenario 3 portfolio alerts)
-- ───────────────────────────────────────────────────────────────────
INSERT INTO MARKET_CONTEXT_EMBEDDINGS (EVENT_DATE, TITLE, CONTENT, EMBEDDING, MODEL_USED)
VALUES (
  DATE '2026-05-15',
  'IHSG Koreksi 3.2% — Tekanan Eksternal Global',
  'IHSG mengalami koreksi signifikan sebesar 3.2% pada Mei 2026 dipicu oleh kekhawatiran resesi global dan kenaikan Fed Funds Rate AS. Sektor saham teknologi dan consumer goods terdampak paling besar. Investor asing mencatat net sell Rp 4.2 triliun dalam sebulan terakhir. Analis memperkirakan IHSG akan bergerak sideways di kisaran 7,000-7,400 hingga akhir Q2 2026. Rekomendasikan nasabah untuk hold posisi dan tidak panik jual. Diversifikasi ke obligasi atau deposito dapat menjadi strategi defensif yang tepat.',
  TO_VECTOR('[' || RPAD('0.01', 7, '01') || RPAD(',0.02', 5118, ',0.02') || ']', 1024, FLOAT32),
  'placeholder-seed'
);

INSERT INTO MARKET_CONTEXT_EMBEDDINGS (EVENT_DATE, TITLE, CONTENT, EMBEDDING, MODEL_USED)
VALUES (
  DATE '2026-04-20',
  'BI Rate Ditahan 6.25% — Sinyal Positif Obligasi',
  'Bank Indonesia mempertahankan BI Rate di level 6.25% pada Rapat Dewan Gubernur April 2026. Keputusan ini memberikan sinyal positif untuk pasar obligasi karena mengurangi tekanan kenaikan yield. Obligasi negara tenor 10 tahun diprediksi akan memberikan return total 7-8% hingga akhir 2026. Rekomendasikan nasabah konservatif untuk meningkatkan alokasi obligasi negara sebagai anchor portofolio. ORI025 yang akan terbit Juni 2026 diprediksi menawarkan kupon 6.25-6.50%.',
  TO_VECTOR('[' || RPAD('0.01', 7, '01') || RPAD(',0.03', 5118, ',0.03') || ']', 1024, FLOAT32),
  'placeholder-seed'
);

INSERT INTO MARKET_CONTEXT_EMBEDDINGS (EVENT_DATE, TITLE, CONTENT, EMBEDDING, MODEL_USED)
VALUES (
  DATE '2026-03-10',
  'Reksa Dana Saham Underperform — Strategi Rebalancing',
  'Mayoritas reksa dana saham Indonesia mencatat return negatif YTD 2026 dengan rata-rata -6.5% hingga Maret 2026. Penyebab utama adalah koreksi valuasi saham growth dan tekanan inflasi global. Manajer investasi menyarankan strategi rebalancing dengan menambah posisi di reksa dana pendapatan tetap atau obligasi. Nasabah dengan profil risiko agresif yang mengalami kerugian di atas 10% disarankan untuk melakukan average down secara bertahap jika masih percaya pada fundamental emiten. Horizon investasi minimal 3-5 tahun untuk saham.',
  TO_VECTOR('[' || RPAD('0.01', 7, '01') || RPAD(',0.04', 5118, ',0.04') || ']', 1024, FLOAT32),
  'placeholder-seed'
);

INSERT INTO MARKET_CONTEXT_EMBEDDINGS (EVENT_DATE, TITLE, CONTENT, EMBEDDING, MODEL_USED)
VALUES (
  DATE '2026-05-01',
  'Deposito Perbankan — Tren Rate & Strategi Nasabah',
  'Suku bunga deposito perbankan nasional mulai menunjukkan tekanan turun seiring dengan sinyal pelonggaran moneter global. Bank-bank besar mulai memangkas rate deposito 25-50 bps. Nasabah dengan deposito jatuh tempo dalam 60 hari disarankan untuk segera berkonsultasi dengan RM mengenai pilihan perpanjangan atau relokasi ke instrumen dengan return lebih tinggi seperti obligasi negara atau reksa dana pendapatan tetap. Jangan biarkan dana ter-rollover otomatis ke rate yang lebih rendah tanpa negosiasi.',
  TO_VECTOR('[' || RPAD('0.01', 7, '01') || RPAD(',0.05', 5118, ',0.05') || ']', 1024, FLOAT32),
  'placeholder-seed'
);

COMMIT;
