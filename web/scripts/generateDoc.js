'use strict';
/**
 * scripts/generateDoc.js
 * Generates PAF_AGENT_MATURITY_Guidelines.docx on the Desktop.
 *
 * Usage: node scripts/generateDoc.js
 */

const {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType,
} = require('docx');
const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join('C:\\Users\\deny\\Desktop', 'PAF_AGENT_MATURITY_Guidelines.docx');
const GRAY     = 'F2F2F2';
const BLUE_HDR = 'D6E4F0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const h1 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 240 } });
const h2 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 160 } });
const h3 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } });

function p(text) {
  return new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { before: 80, after: 80 } });
}
function bold(text) {
  return new Paragraph({ children: [new TextRun({ text, bold: true, size: 22 })], spacing: { before: 80, after: 80 } });
}
function note(text) {
  return new Paragraph({
    children: [new TextRun({ text: `Note: ${text}`, size: 20, italics: true, color: '555555' })],
    spacing: { before: 80, after: 80 }, indent: { left: 360 },
  });
}
function spacer() {
  return new Paragraph({ spacing: { before: 0, after: 200 } });
}
function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    bullet: { level: 0 },
    spacing: { before: 60, after: 60 },
  });
}

/** Render an array of strings as a monospace code block */
function code(lines) {
  const blocks = lines.map((line, i) =>
    new Paragraph({
      children: [new TextRun({ text: line.length ? line : ' ', font: 'Courier New', size: 18 })],
      shading:  { type: ShadingType.CLEAR, fill: GRAY },
      spacing:  { before: i === 0 ? 100 : 0, after: 0 },
      indent:   { left: 360 },
    })
  );
  // add a small gap after the block
  blocks.push(new Paragraph({ spacing: { before: 0, after: 100 } }));
  return blocks;
}

/** Simple table: string[][] with first row as header */
function table(headers, rows) {
  const mkCell = (text, isHdr) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, bold: isHdr })] })],
    shading: isHdr ? { type: ShadingType.CLEAR, fill: BLUE_HDR } : undefined,
    width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
  });

  const headerRow = new TableRow({ children: headers.map(h => mkCell(h, true)), tableHeader: true });
  const dataRows  = rows.map(row => new TableRow({ children: row.map(c => mkCell(c, false)) }));

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  });
}

// ─── Build document children ──────────────────────────────────────────────────

const children = [];

// ── Cover ──────────────────────────────────────────────────────────────────────
children.push(new Paragraph({
  children: [new TextRun({ text: 'PAF_AGENT_MATURITY', bold: true, size: 52, color: '1F4E79' })],
  alignment: AlignmentType.CENTER, spacing: { before: 600, after: 200 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Setup & Integration Guidelines', bold: true, size: 32, color: '2E75B6' })],
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 160 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Oracle AI Database Private Agent Factory 25.3 Studio', size: 26, italics: true, color: '444444' })],
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 160 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Bank Danamon Intelligence RM Platform', size: 22, italics: true, color: '666666' })],
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 160 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Reference: https://docs.oracle.com/en/database/oracle/agent-factory/25.3/paias/', size: 18, color: '888888' })],
  alignment: AlignmentType.CENTER, spacing: { before: 0, after: 800 },
}));

// ── Overview ──────────────────────────────────────────────────────────────────
children.push(h1('Overview'));
children.push(p('PAF 25.3 Studio is a no-code visual workflow platform accessed via browser. Agents are built by dragging nodes onto a canvas and connecting them. The published agent exposes a REST endpoint that the Node.js backend calls.'));
children.push(spacer());
children.push(p('PAF_AGENT_MATURITY performs the following pipeline:'));
children.push(bullet('Receive a customer ID from the RM frontend'));
children.push(bullet('Query Oracle Autonomous Database for maturing deposits and customer profile'));
children.push(bullet('Retrieve product alternatives and market context'));
children.push(bullet('Generate a Bahasa Indonesia action plan via Cohere Command R+'));
children.push(bullet('Stream the result back to the frontend via SSE'));

// ── PART 1 ────────────────────────────────────────────────────────────────────
children.push(h1('PART 1 — Access the PAF Studio'));

children.push(h2('1.1 Open the Studio UI'));
children.push(p('Navigate to your PAF instance in a browser:'));
children.push(...code([
  'https://<your-paf-host>/agentFactory',
]));
children.push(p('If deployed from OCI Marketplace the host is the public IP of the compute instance. If local:'));
children.push(...code([
  'https://localhost/agentFactory',
]));
children.push(p('Log in with your PAF admin credentials (set during installation).'));

children.push(h2('1.2 Configure LLM Provider — OCI Generative AI'));
children.push(p('Before creating an agent you must register OCI GenAI as the LLM provider:'));
children.push(bullet('Click the Administration (gear) icon in the left sidebar'));
children.push(bullet('Select Configure LLM → click + Add LLM'));
children.push(bullet('Fill in the fields below, then click Test Connection → Save'));
children.push(spacer());
children.push(table(
  ['Field', 'Value'],
  [
    ['Provider',        'OCI GenAI'],
    ['Display Name',    'OCI-Cohere-CommandR'],
    ['Region',          'ap-osaka-1'],
    ['Compartment OCID','ocid1.compartment.oc1..xxxxxxx'],
    ['Model',           'cohere.command-r-plus-08-2024'],
    ['Auth Type',       'Instance Principal (on OCI VM) or API Key'],
    ['Max Tokens',      '2048'],
    ['Temperature',     '0.3'],
  ]
));
children.push(spacer());

children.push(h2('1.3 Configure Oracle ADB Data Source'));
children.push(p('Go to Administration → Data Sources → Database → + Add:'));
children.push(spacer());
children.push(table(
  ['Field', 'Value'],
  [
    ['Name',              'ADB-Danamon'],
    ['Type',              'Oracle'],
    ['Connection String', 'jdbc:oracle:thin:@malbdvdawec3xe8i_tp?TNS_ADMIN=/opt/wallet'],
    ['Username',          'DBN'],
    ['Password',          '<DB_PASSWORD from .env>'],
    ['Schema',            'DBN'],
  ]
));
children.push(spacer());
children.push(note('Upload ewallet.pem, tnsnames.ora, and sqlnet.ora to the wallet directory referenced in the connection string.'));
children.push(bullet('Click Test → Save'));

// ── PART 2 ────────────────────────────────────────────────────────────────────
children.push(h1('PART 2 — Build the Agent Workflow'));

children.push(h2('2.1 Create a New Flow'));
children.push(bullet('Click Agent Builder in the left sidebar'));
children.push(bullet('Click + New Flow (top-right)'));
children.push(bullet('Rename the flow to: PAF_AGENT_MATURITY'));
children.push(bullet('Description: Analisis jatuh tempo deposito dan rekomendasi produk alternatif untuk Relationship Manager Bank Danamon'));

children.push(h2('2.2 Complete Node Layout'));
children.push(p('Drop the following 9 nodes from the left component panel onto the canvas in left-to-right order:'));
children.push(...code([
  '[Chat Input]',
  '     |',
  '     v',
  '[Prompt: System Preamble]',
  '     |',
  '     | Message',
  '     v',
  '[Text Combiner] <-- Message -- [Type Convert] <-- JSON -- [Combine JSON Data: Full Context]',
  '     |                                                            ^                  ^',
  '     | Message                                                    |                  |',
  '     v                                               [Combine JSON 1: Customer]  [SQL: Products]',
  '[Agent: Maturity Analyzer]                                 ^             ^',
  '     |                                              [SQL: Holdings]  [SQL: Profiles]',
  '     v',
  '[Chat Output]',
]));

children.push(h2('2.3 Configure Each Node'));

// Node 1
children.push(h3('Node 1 — Chat Input'));
children.push(p('Category: Input | No configuration required.'));
children.push(p('Captures the RM query at runtime. Example input:'));
children.push(...code(['"Analisis semua nasabah dengan deposito jatuh tempo dalam 60 hari ke depan"']));

// Node 2
children.push(h3('Node 2 — Prompt: System Preamble'));
children.push(p('Category: Input. Click the node and paste the following into the Template field:'));
children.push(...code([
  'Anda adalah AI Co-Pilot untuk Relationship Manager (RM) di Bank Danamon Indonesia.',
  'Anda memiliki keahlian mendalam dalam wealth management, produk investasi perbankan,',
  'dan manajemen hubungan nasabah.',
  '',
  'Tugas Anda adalah menganalisis jatuh tempo deposito nasabah dan memberikan:',
  '1. Ringkasan status deposito yang akan jatuh tempo (<=60 hari)',
  '2. Rekomendasi produk alternatif yang sesuai profil risiko nasabah',
  '3. Action plan konkret dengan timeline dan nominal yang spesifik',
  '4. Pertimbangan kondisi pasar terkini',
  '',
  'Selalu berikan respons dalam Bahasa Indonesia yang profesional, konkret, dan actionable.',
  'Berikan rekomendasi yang spesifik dengan angka dan timeline yang jelas.',
  '',
  'Permintaan RM:',
  '{{user_query}}',
]));
children.push(note('Connect: Chat Input -> Message to the {{user_query}} variable on this Prompt node.'));

// Node 3
children.push(h3('Node 3 — SQL Query: Customer Holdings'));
children.push(p('Category: Data | Database: ADB-Danamon'));
children.push(p('Query:'));
children.push(...code([
  'SELECT',
  '  c.FULL_NAME, c.RISK_PROFILE, c.TIER_LABEL, c.TOTAL_AUM, c.MONTHLY_INCOME,',
  '  cp.PRODUCT_NAME, cp.CATEGORY, cp.AMOUNT, cp.PURCHASE_DATE,',
  '  cp.MATURITY_DATE, cp.INTEREST_RATE, cp.STATUS,',
  "  ROUND(cp.MATURITY_DATE - SYSDATE) AS DAYS_TO_MATURITY",
  'FROM CUSTOMERS c',
  'JOIN CUSTOMER_PRODUCTS cp ON cp.CUSTOMER_ID = c.CUSTOMER_ID',
  "WHERE cp.CATEGORY = 'Deposito'",
  "  AND cp.STATUS = 'Active'",
  '  AND cp.MATURITY_DATE IS NOT NULL',
  '  AND cp.MATURITY_DATE - SYSDATE <= 60',
  'ORDER BY cp.MATURITY_DATE ASC',
]));
children.push(note('Connect: JSON output -> Combine JSON Data: Customer Context'));

// Node 4
children.push(h3('Node 4 — SQL Query: Customer Profiles'));
children.push(p('Category: Data | Database: ADB-Danamon'));
children.push(p('Query:'));
children.push(...code([
  'SELECT',
  '  c.CUSTOMER_ID, c.FULL_NAME, c.EMAIL, c.PHONE,',
  '  c.RISK_PROFILE, c.NOTES, NVL(c.TIER_LABEL, c.TIER) AS TIER,',
  '  c.TOTAL_AUM, c.KYC_STATUS',
  'FROM CUSTOMERS c',
  'WHERE ROWNUM <= 10',
  'ORDER BY c.TOTAL_AUM DESC',
]));
children.push(note('Connect: JSON output -> Combine JSON Data: Customer Context'));

// Node 5
children.push(h3('Node 5 — Combine JSON Data: Customer Context'));
children.push(p('Category: Processing'));
children.push(bullet('Merge mode: Deep'));
children.push(bullet('Keys to include: leave blank (include all)'));
children.push(bullet('Receives: SQL Query Holdings JSON + SQL Query Profiles JSON'));
children.push(note('Connect: JSON output -> SQL Query: Product Catalog (for input) and also -> Combine JSON Data: Full Context'));

// Node 6
children.push(h3('Node 6 — SQL Query: Product Catalog'));
children.push(p('Category: Data | Database: ADB-Danamon'));
children.push(p('Query:'));
children.push(...code([
  'SELECT',
  '  PRODUCT_NAME, CATEGORY, DESCRIPTION,',
  '  INTEREST_RATE, MIN_AMOUNT, TENURE_MONTHS,',
  '  RISK_LEVEL, FEATURES',
  'FROM PRODUCT_CATALOG',
  'WHERE IS_ACTIVE = 1',
  "  AND CATEGORY IN ('Deposito', 'Obligasi', 'Reksa Dana')",
  'ORDER BY RISK_LEVEL, INTEREST_RATE DESC',
]));
children.push(note('Connect: JSON output -> Combine JSON Data: Full Context'));

// Node 7a
children.push(h3('Node 7a — Combine JSON Data: Full Context'));
children.push(p('Category: Processing'));
children.push(bullet('Merge mode: Deep'));
children.push(bullet('Receives: Combine JSON Data: Customer Context JSON + SQL: Product Catalog JSON'));
children.push(note('Connect: JSON output -> Type Convert'));

// Node 7b
children.push(h3('Node 7b — Type Convert'));
children.push(p('Category: Processing. Converts JSON -> Message (stringified text).'));
children.push(p('No configuration needed — the node auto-detects input type.'));
children.push(bullet('Input: Combine JSON Data: Full Context -> JSON'));
children.push(bullet('Output: Message (string) -> Text Combiner Text 2 input'));
children.push(note('The Agent node only accepts a Message (text) input. This node is required to bridge the JSON data into text before reaching the Agent.'));

// Node 7c
children.push(h3('Node 7c — Text Combiner'));
children.push(p('Category: Processing (or Tools depending on PAF version).'));
children.push(bullet('Delimiter: newline (\\n)'));
children.push(bullet('Text 1: Prompt: System Preamble -> Message output'));
children.push(bullet('Text 2: Type Convert -> Message output'));
children.push(note('Connect: Text Combiner -> Message -> Agent: Maturity Analyzer Message/Prompt input'));

// Node 8
children.push(h3('Node 8 — Agent: Maturity Analyzer'));
children.push(p('Category: Orchestration'));
children.push(bullet('LLM: OCI-Cohere-CommandR (configured in Part 1.2)'));
children.push(bullet('Temperature: 0.3'));
children.push(p('System Instructions:'));
children.push(...code([
  'Anda adalah AI Co-Pilot Relationship Manager Bank Danamon.',
  'Spesialisasi: Analisis jatuh tempo deposito dan rekomendasi produk wealth management.',
  '',
  'Data nasabah, deposito, dan katalog produk dikirim dalam JSON di bagian atas pesan.',
  'Gunakan data tersebut untuk:',
  '1. Identifikasi deposito yang jatuh tempo <=60 hari, urutkan berdasarkan nilai terbesar',
  '2. Cocokkan profil risiko nasabah dengan produk alternatif yang tersedia di katalog',
  '3. Buat action plan: jadwal kontak H-30/H-14/H-7, nominal, dan produk yang direkomendasikan',
  '4. Ringkasan akhir: total nasabah, total nilai AUM yang perlu ditangani',
  '',
  'Format respons: heading jelas, Bahasa Indonesia profesional, angka spesifik.',
]));
children.push(bold('Inputs:'));
children.push(bullet('Message / Prompt input: Text Combiner -> Message'));
children.push(bullet('Tools: (none required for base implementation)'));
children.push(bullet('Sub-agents: (none)'));
children.push(note('The Agent node does NOT have a JSON input port. All context data must arrive as text through the Message input via the Type Convert + Text Combiner chain above.'));

// Node 9
children.push(h3('Node 9 — Chat Output'));
children.push(p('Category: Output. No configuration.'));
children.push(bullet('Connect: Agent -> Message to this node'));

// ── PART 3 ────────────────────────────────────────────────────────────────────
children.push(h1('PART 3 — Save, Test, and Publish'));

children.push(h2('3.1 Save'));
children.push(p('Click Save (top-right). The flow appears under My Custom Flows in the sidebar.'));

children.push(h2('3.2 Test in Playground'));
children.push(bullet('Click Playground next to the saved flow'));
children.push(bullet('A chat window opens'));
children.push(bullet('Type: "Analisis semua nasabah dengan deposito jatuh tempo dalam 60 hari ke depan"'));
children.push(bullet('Verify structured Bahasa Indonesia output with customer names, values, and product recommendations'));
children.push(spacer());
children.push(bold('Common issues:'));
children.push(table(
  ['Error', 'Cause', 'Fix'],
  [
    ['SQL error',    'Column names do not match schema',           'Verify column names against actual ADB schema'],
    ['LLM error',   'OCI GenAI connection invalid',               'Re-test connection in Administration -> Configure LLM'],
    ['Empty JSON',  'ADB credentials or wallet path wrong',       'Verify DB_PASSWORD and wallet file paths'],
    ['Node red',    'Required input port not connected',          'Click the node for the specific error message'],
  ]
));
children.push(spacer());

children.push(h2('3.3 Publish and Get API Endpoint'));
children.push(bullet('Click Publish (top-right of the flow editor)'));
children.push(bullet('In the dialog click the Integration Options tab'));
children.push(bullet('Copy the Agent API Endpoint URL:'));
children.push(...code([
  'https://<your-paf-host>/agentFactory/v1/agentBuilder/run/<agentId>',
]));
children.push(p('The <agentId> segment is the value to set as PAF_AGENT_MATURITY in your .env file.'));

// ── PART 4 ────────────────────────────────────────────────────────────────────
children.push(h1('PART 4 — Connect to Node.js Backend'));

children.push(h2('4.1 Update .env'));
children.push(...code([
  'PAF_ENABLED=true',
  'PAF_BASE_URL=https://<your-paf-host>/agentFactory/v1',
  'PAF_AGENT_MATURITY=<agentId-from-step-3.3>',
  'PAF_AUTH_USER=<paf-app-username>',
  'PAF_AUTH_PASS=<paf-app-password>',
]));

children.push(h2('4.2 How PAF 25.3 API Authentication Works'));
children.push(p('PAF 25.3 uses HTTP Basic Auth + POST JSON. The pattern is:'));
children.push(bullet('Step 1: GET /loginValidation with Basic Auth header to establish session'));
children.push(bullet('Step 2: POST /agentBuilder/run/<agentId> with Basic Auth + JSON body'));
children.push(spacer());

children.push(h2('4.3 Update backend/services/pafService.js — callPAF()'));
children.push(...code([
  "async function callPAF(scenario, prompt, res, context = {}) {",
  "  if (!process.env.PAF_ENABLED || process.env.PAF_ENABLED !== 'true') {",
  "    return callFallback(scenario, prompt, res, context);",
  "  }",
  "",
  "  const agentIdMap = {",
  "    maturity:        process.env.PAF_AGENT_MATURITY,",
  "    recommendations: process.env.PAF_AGENT_RECOMMENDATION,",
  "    alerts:          process.env.PAF_AGENT_ALERTS,",
  "  };",
  "  const agentId = agentIdMap[scenario];",
  "  if (!agentId) return callFallback(scenario, prompt, res, context);",
  "",
  "  const baseUrl  = process.env.PAF_BASE_URL;",
  "  const user     = process.env.PAF_AUTH_USER;",
  "  const pass     = process.env.PAF_AUTH_PASS;",
  "  const basicB64 = Buffer.from(`${user}:${pass}`).toString('base64');",
  "",
  "  // Step 1: Authenticate",
  "  await fetch(`${baseUrl}/loginValidation`, {",
  "    headers: { 'Authorization': `Basic ${basicB64}` },",
  "  });",
  "",
  "  // Step 2: Call agent endpoint",
  "  const body = { message: prompt, roomId: context.roomId };",
  "  const resp = await fetch(`${baseUrl}/agentBuilder/run/${agentId}`, {",
  "    method:  'POST',",
  "    headers: {",
  "      'Authorization': `Basic ${basicB64}`,",
  "      'Content-Type':  'application/json',",
  "    },",
  "    body: JSON.stringify(body),",
  "  });",
  "",
  "  if (!resp.ok) throw new Error(`PAF returned ${resp.status}`);",
  "  const data = await resp.json();",
  "",
  "  // Emit as SSE then close",
  "  const text = data?.message || data?.result || JSON.stringify(data);",
  "  emitToken(res, text);",
  "  emitDone(res);",
  "}",
]));

// ── PART 5 ────────────────────────────────────────────────────────────────────
children.push(h1('PART 5 — Testing with PowerShell'));
children.push(note('Always use Invoke-RestMethod or Invoke-WebRequest in PowerShell. Do NOT use the curl alias — it maps to Invoke-WebRequest with incompatible syntax. Use curl.exe (with .exe) to call the real curl binary.'));

children.push(h2('5.1 Login and Get JWT Token'));
children.push(p('Run all three steps in the same PowerShell session — $TOKEN persists between commands.'));
children.push(...code([
  "$response = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' `",
  "  -Method POST `",
  "  -ContentType 'application/json' `",
  "  -Body '{\"username\":\"anisa\",\"password\":\"danamon2026\"}'",
  "",
  "$TOKEN = $response.token",
  "Write-Host \"Token acquired: $($TOKEN.Substring(0,20))...\"",
]));

children.push(h2('5.2 List Customers'));
children.push(...code([
  '$headers = @{ Authorization = "Bearer $TOKEN" }',
  "Invoke-RestMethod -Uri 'http://localhost:3000/api/customers' -Headers $headers",
]));

children.push(h2('5.3 Run Maturity Analysis'));
children.push(p('Customer IDs in the database are strings (CUST001, CUST002 ... CUST007), NOT integers. Always use the string format:'));
children.push(...code([
  '# Correct — string ID format',
  'curl.exe http://localhost:3000/api/maturity/CUST001/analyze `',
  '  -H "Authorization: Bearer $TOKEN" `',
  '  -H "Accept: text/event-stream"',
]));
children.push(spacer());
children.push(table(
  ['Customer ID', 'Name', 'RM', 'Risk Profile'],
  [
    ['CUST001', 'Budi Santoso',    'anisa (rm001)', 'Conservative'],
    ['CUST002', 'Sari Indah',      'anisa (rm001)', 'Moderate'],
    ['CUST003', 'Hendra Wijaya',   'budi (rm002)',  'Aggressive'],
    ['CUST004', 'Dewi Lestari',    'anisa (rm001)', 'Moderate'],
    ['CUST005', 'Eko Prasetyo',    'budi (rm002)',  'Conservative'],
    ['CUST006', 'Fitri Handayani', 'dewi (rm003)',  'Moderate'],
    ['CUST007', 'Gunawan Santoso', 'dewi (rm003)',  'Aggressive'],
  ]
));
children.push(spacer());

children.push(h2('5.4 Expected SSE Response'));
children.push(...code([
  'data: {"type":"stage","stage":"Customer Data Agent","status":"active","detail":"Mengambil data nasabah dan deposito..."}',
  'data: {"type":"stage","stage":"Customer Data Agent","status":"done","detail":"2 deposito ditemukan"}',
  'data: {"type":"stage","stage":"Context Retrieval Agent","status":"active","detail":"Mencari konteks relevan..."}',
  'data: {"type":"stage","stage":"Context Retrieval Agent","status":"done","detail":"6 dokumen konteks ditemukan"}',
  'data: {"type":"stage","stage":"Product Match Agent","status":"active","detail":"Mencocokkan produk alternatif terbaik..."}',
  'data: {"type":"stage","stage":"Maturity Analysis Agent","status":"active","detail":"Menganalisis situasi..."}',
  'data: {"type":"token","token":"## Analisis Jatuh Tempo Deposito\\n\\n"}',
  'data: {"type":"token","token":"**Nasabah:** Budi Santoso..."}',
  'data: {"type":"done"}',
]));

// ── PART 6 ────────────────────────────────────────────────────────────────────
children.push(h1('PART 6 — Known Issues and Fixes'));

children.push(h2('6.1 Agent Node Has No JSON Input Port'));
children.push(p('The Agent node in PAF 25.3 only accepts a single Message (text) input. Raw JSON from SQL queries cannot be connected directly.'));
children.push(bold('Solution: Type Convert + Text Combiner chain'));
children.push(bullet('Combine JSON Data -> JSON output -> Type Convert (converts to string)'));
children.push(bullet('Type Convert -> Message + Prompt node -> Text Combiner'));
children.push(bullet('Text Combiner -> Message -> Agent Message/Prompt input'));
children.push(p('This is the standard PAF 25.3 pattern for injecting structured database results into an Agent prompt.'));
children.push(spacer());

children.push(h2('6.2 Password Hash Mismatch in seed.sql'));
children.push(p('The bcrypt hash in seed.sql was generated for a different password (not "danamon2026"). Run this script once to generate the correct hash and update all 4 RM user records in the database:'));
children.push(...code([
  'node -e "',
  "const bcrypt = require('bcryptjs');",
  "const db = require('./backend/config/database');",
  '',
  'async function fix() {',
  "  const hash = await bcrypt.hash('danamon2026', 10);",
  "  console.log('New hash:', hash);",
  '  await db.initialize();',
  "  const result = await db.execute('UPDATE RM_USERS SET PASSWORD_HASH = :1', [hash]);",
  "  console.log('Rows updated:', result.rowsAffected);",
  '  process.exit(0);',
  '}',
  'fix().catch(e => { console.error(e.message); process.exit(1); });',
  '"',
]));
children.push(note('After running this script, update the PASSWORD_HASH values in backend/db/seed.sql with the printed hash to ensure future re-seeds also work.'));
children.push(spacer());

children.push(h2('6.3 Customer ID Format — String Not Integer'));
children.push(p('The CUSTOMER_ID column is VARCHAR2, not a number. Always pass string IDs in API calls:'));
children.push(...code([
  '# WRONG — returns "Nasabah tidak ditemukan"',
  'curl.exe http://localhost:3000/api/maturity/1/analyze ...',
  '',
  '# CORRECT',
  'curl.exe http://localhost:3000/api/maturity/CUST001/analyze ...',
]));
children.push(spacer());

children.push(h2('6.4 PowerShell curl Alias'));
children.push(p('In PowerShell, "curl" is an alias for Invoke-WebRequest, not the curl binary. This causes parameter binding errors when using Linux-style flags like -H and -d.'));
children.push(...code([
  '# WRONG — PowerShell alias, causes "Cannot bind parameter Headers" error',
  'curl -H "Content-Type: application/json" ...',
  '',
  '# CORRECT option A — force real curl binary',
  'curl.exe -H "Content-Type: application/json" ...',
  '',
  '# CORRECT option B — use native PowerShell cmdlet',
  '$response = Invoke-RestMethod -Uri "..." -Method POST -ContentType "application/json" -Body "..."',
]));

// ── Summary Checklist ─────────────────────────────────────────────────────────
children.push(h1('Summary Checklist'));
children.push(table(
  ['#', 'Action', 'Status'],
  [
    ['1',  'Access PAF Studio at https://<host>/agentFactory',                        '[ ]'],
    ['2',  'Admin -> Configure LLM -> Add OCI GenAI (Cohere Command R+)',             '[ ]'],
    ['3',  'Admin -> Data Sources -> Add Oracle ADB connection (ADB-Danamon)',        '[ ]'],
    ['4',  'Agent Builder -> New Flow -> Name: PAF_AGENT_MATURITY',                   '[ ]'],
    ['5',  'Drop Node 1: Chat Input',                                                 '[ ]'],
    ['6',  'Drop Node 2: Prompt (System Preamble with {{user_query}})',               '[ ]'],
    ['7',  'Drop Nodes 3-4: SQL Query (Holdings + Profiles)',                         '[ ]'],
    ['8',  'Drop Node 5: Combine JSON Data: Customer Context',                        '[ ]'],
    ['9',  'Drop Node 6: SQL Query (Product Catalog)',                                '[ ]'],
    ['10', 'Drop Node 7a: Combine JSON Data: Full Context',                          '[ ]'],
    ['11', 'Drop Node 7b: Type Convert (JSON -> Message)',                            '[ ]'],
    ['12', 'Drop Node 7c: Text Combiner (Preamble + Context)',                        '[ ]'],
    ['13', 'Drop Node 8: Agent with System Instructions + LLM=OCI-Cohere-CommandR',  '[ ]'],
    ['14', 'Drop Node 9: Chat Output',                                                '[ ]'],
    ['15', 'Connect all nodes per Part 2 canvas diagram',                             '[ ]'],
    ['16', 'Save -> test in Playground with sample query',                            '[ ]'],
    ['17', 'Publish -> copy Agent Endpoint URL (agentId)',                            '[ ]'],
    ['18', 'Update .env: PAF_AGENT_MATURITY=<agentId>, PAF_ENABLED=true',            '[ ]'],
    ['19', 'Update pafService.js callPAF() with Basic Auth POST pattern',             '[ ]'],
    ['20', 'Fix password hash (run script in Part 6.2)',                              '[ ]'],
    ['21', 'Confirm customer IDs use CUST001 format in all API calls',                '[ ]'],
    ['22', 'npm run dev -> login -> test /api/maturity/CUST001/analyze',              '[ ]'],
  ]
));

// ── Build and write ───────────────────────────────────────────────────────────

const doc = new Document({
  creator:  'Bank Danamon Intelligence RM Platform',
  title:    'PAF_AGENT_MATURITY Guidelines',
  subject:  'Oracle AI Database Private Agent Factory 25.3 Studio',
  sections: [{ children }],
});

Packer.toBuffer(doc)
  .then(buffer => {
    fs.writeFileSync(OUT_PATH, buffer);
    console.log('');
    console.log('✅  Document saved to:');
    console.log('   ', OUT_PATH);
  })
  .catch(err => {
    console.error('Error generating document:', err.message);
    process.exit(1);
  });
