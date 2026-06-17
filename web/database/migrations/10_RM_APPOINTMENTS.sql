-- =====================================================================
-- Migration 10: RM Appointments / Calendar
-- Oracle Autonomous Database 26ai
-- Creates: RM_APPOINTMENTS, index, check constraints
-- =====================================================================

-- Drop if re-running
BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE RM_APPOINTMENTS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE RM_APPOINTMENTS (
  APPOINTMENT_ID   NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  RM_USER_ID       VARCHAR2(50)    NOT NULL,
  CUSTOMER_ID      VARCHAR2(50),                          -- nullable (internal meetings)
  CUSTOMER_NAME    VARCHAR2(200),                         -- denormalized for display
  TITLE            VARCHAR2(200)   NOT NULL,
  MEETING_TYPE     VARCHAR2(20)    NOT NULL,              -- email|whatsapp|phone|visit
  NOTES            VARCHAR2(2000),
  APPOINTMENT_DATE TIMESTAMP       NOT NULL,
  DURATION_MIN     NUMBER          DEFAULT 30,
  STATUS           VARCHAR2(20)    DEFAULT 'scheduled',  -- scheduled|completed|cancelled
  CREATED_AT       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT appt_meeting_type_ck CHECK (MEETING_TYPE IN ('email','whatsapp','phone','visit')),
  CONSTRAINT appt_status_ck       CHECK (STATUS IN ('scheduled','completed','cancelled')),
  CONSTRAINT appt_duration_ck     CHECK (DURATION_MIN > 0 AND DURATION_MIN <= 480),

  CONSTRAINT appt_rm_fk FOREIGN KEY (RM_USER_ID)
    REFERENCES RM_USERS(USER_ID) ON DELETE CASCADE,

  CONSTRAINT appt_cust_fk FOREIGN KEY (CUSTOMER_ID)
    REFERENCES CUSTOMERS(CUSTOMER_ID) ON DELETE SET NULL
);

-- Index: RM + month range queries (primary access pattern)
CREATE INDEX idx_appt_rm_date    ON RM_APPOINTMENTS(RM_USER_ID, APPOINTMENT_DATE);
-- Index: customer lookup
CREATE INDEX idx_appt_customer   ON RM_APPOINTMENTS(CUSTOMER_ID);
-- Index: status filtering
CREATE INDEX idx_appt_status     ON RM_APPOINTMENTS(STATUS);

-- ── Seed demo data ────────────────────────────────────────────────────
-- Anisa (rm001) appointments — spread across current month

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST001','Budi Karya',
        'Review Deposito Jatuh Tempo & Rebalancing',
        'visit',
        'Deposito 500jt jatuh tempo minggu depan. Siapkan proposal reinvestasi ke ORI026 dan reksa dana pendapatan tetap.',
        TRUNC(SYSDATE,'MM') + INTERVAL '3' DAY + INTERVAL '10' HOUR,
        60, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST003','Hendra Kusuma Jati',
        'Follow-up Portfolio Review Q2',
        'phone',
        'Bahas idle money 55% AUM. Rekomendasikan produk baru: obligasi korporasi dan reksa dana saham campuran.',
        TRUNC(SYSDATE,'MM') + INTERVAL '5' DAY + INTERVAL '14' HOUR,
        30, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST004','Dewi Lestari',
        'Perbaruan KYC & Dokumen',
        'email',
        'KYC akan expired 30 hari lagi. Kirim reminder & form pembaruan via email. CC compliance team.',
        TRUNC(SYSDATE,'MM') + INTERVAL '7' DAY + INTERVAL '9' HOUR,
        15, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST006','Reza Pratama',
        'Tawarkan Upgrade Tier Prioritas',
        'whatsapp',
        'AUM 280jt sudah memenuhi syarat upgrade. Kirim info benefit tier Prioritas dan jadwalkan meeting.',
        TRUNC(SYSDATE,'MM') + INTERVAL '9' DAY + INTERVAL '11' HOUR,
        20, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST005','Rudi Santoso',
        'Kunjungan Kantor — Perkenalan Produk Baru',
        'visit',
        'Presentasi Obligasi Korporasi high-yield dan SBR013. Siapkan prospektus dan simulasi return.',
        TRUNC(SYSDATE,'MM') + INTERVAL '12' DAY + INTERVAL '13' HOUR,
        90, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST002','Sari Wijaya II',
        'Check-in Bulanan via WhatsApp',
        'whatsapp',
        'Update performa reksa dana yang dipegang. Tanyakan kebutuhan likuiditas jangka pendek.',
        TRUNC(SYSDATE,'MM') + INTERVAL '14' DAY + INTERVAL '10' HOUR,
        15, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST007','Mega Wulandari',
        'Diskusi Strategi Portofolio H2 2026',
        'visit',
        'Nasabah ingin diversifikasi ke aset asing. Siapkan info produk reksa dana global & obligasi USD.',
        TRUNC(SYSDATE,'MM') + INTERVAL '17' DAY + INTERVAL '15' HOUR,
        60, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST001','Budi Karya',
        'Konfirmasi Reinvestasi Deposito',
        'phone',
        'Follow-up setelah meeting tanggal 3. Konfirmasi keputusan reinvestasi.',
        TRUNC(SYSDATE,'MM') + INTERVAL '19' DAY + INTERVAL '16' HOUR,
        20, 'completed');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001',NULL,NULL,
        'Internal Team Meeting — Monthly Review',
        'visit',
        'Review target AUM bulan berjalan bersama kepala cabang. Siapkan laporan perkembangan nasabah.',
        TRUNC(SYSDATE,'MM') + INTERVAL '21' DAY + INTERVAL '9' HOUR,
        120, 'scheduled');

INSERT INTO RM_APPOINTMENTS (RM_USER_ID, CUSTOMER_ID, CUSTOMER_NAME, TITLE, MEETING_TYPE, NOTES, APPOINTMENT_DATE, DURATION_MIN, STATUS)
VALUES ('rm001','CUST003','Hendra Kusuma Jati',
        'Tindak Lanjut Alert Konsentrasi Portofolio',
        'email',
        'Kirim laporan rebalancing. Saran alihkan sebagian reksa_dana ke obligasi untuk kurangi konsentrasi.',
        TRUNC(SYSDATE,'MM') + INTERVAL '24' DAY + INTERVAL '10' HOUR,
        15, 'scheduled');

COMMIT;

SELECT 'RM_APPOINTMENTS table created. ' || COUNT(*) || ' demo records inserted.' AS STATUS
  FROM RM_APPOINTMENTS;
