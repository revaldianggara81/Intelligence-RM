'use strict';
/**
 * Generates: PAF_Studio_Guidelines_PAF_AGENT_ALERT_MCP.docx
 * PAF AI Studio setup guide for migrating PAF_AGENT_ALERT to Oracle DB MCP.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, LevelFormat,
  ExternalHyperlink,
} = require('docx');
const fs   = require('fs');
const path = require('path');

const OUT = path.join(
  __dirname, '..', 'database', 'agent_tools',
  'PAF_Studio_Guidelines_PAF_AGENT_ALERT_MCP.docx'
);

// ── Color palette ──────────────────────────────────────────────────────────
const C = {
  danamon:  'E31E24',   // Danamon red
  oracle:   'FF0000',   // Oracle red
  dark:     '1A1A2E',   // Dark navy
  blue:     '1565C0',   // Primary blue
  lightBg:  'EFF3FB',   // Light blue bg
  codeBg:   'F5F5F5',   // Code background
  green:    '1B5E20',   // Success green
  amber:    'F57F17',   // Warning amber
  white:    'FFFFFF',
  border:   'D0D7E5',
  header:   '1A237E',   // Deep blue for headings
};

// ── Reusable border objects ────────────────────────────────────────────────
const thickBorder  = { style: BorderStyle.SINGLE, size: 6,  color: C.danamon };
const thinBorder   = { style: BorderStyle.SINGLE, size: 1,  color: C.border  };
const cellBorders  = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorder     = { style: BorderStyle.NONE };
const noCellBorder = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Helper functions ───────────────────────────────────────────────────────
const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 120 },
  border:  { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.danamon } },
  children: [new TextRun({ text, bold: true, color: C.header, size: 30, font: 'Arial' })],
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 80 },
  children: [new TextRun({ text, bold: true, color: C.blue, size: 26, font: 'Arial' })],
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 160, after: 60 },
  children: [new TextRun({ text, bold: true, color: C.dark, size: 22, font: 'Arial' })],
});

const body = (text, opts = {}) => new Paragraph({
  spacing: { after: 100 },
  children: [new TextRun({ text, font: 'Arial', size: 22, ...opts })],
});

const bullet = (text, bold = false) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  spacing:   { after: 60 },
  children:  [new TextRun({ text, font: 'Arial', size: 22, bold })],
});

const numbered = (text, bold = false) => new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  spacing:   { after: 60 },
  children:  [new TextRun({ text, font: 'Arial', size: 22, bold })],
});

const codeBlock = (text) => new Paragraph({
  spacing: { before: 60, after: 60 },
  indent:  { left: 360 },
  shading: { fill: C.codeBg, type: ShadingType.CLEAR },
  border:  { left: { style: BorderStyle.SINGLE, size: 8, color: C.blue } },
  children: [new TextRun({ text, font: 'Courier New', size: 18, color: C.dark })],
});

const note = (label, text, fillColor = C.lightBg) =>
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: cellBorders,
      width:   { size: 9360, type: WidthType.DXA },
      shading: { fill: fillColor, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 180, right: 180 },
      children: [new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: label + ' ', bold: true, font: 'Arial', size: 20, color: C.dark }),
        new TextRun({ text, font: 'Arial', size: 20, color: C.dark }),
      ]})],
    })]})],
  });

const space = () => new Paragraph({ spacing: { after: 140 }, children: [] });

// ── Table builders ─────────────────────────────────────────────────────────
function twoColRow(label, value, shade = C.white) {
  return new TableRow({ children: [
    new TableCell({
      borders: cellBorders, width: { size: 3000, type: WidthType.DXA },
      shading: { fill: shade, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: 'Arial', size: 20 })] })],
    }),
    new TableCell({
      borders: cellBorders, width: { size: 6360, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: value, font: 'Arial', size: 20 })] })],
    }),
  ]});
}

function headerRow(...cells) {
  return new TableRow({ children: cells.map((c, i) => new TableCell({
    borders: cellBorders,
    width:   { size: i === 0 ? 2800 : 6560 / (cells.length - 1), type: WidthType.DXA },
    shading: { fill: C.blue, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, font: 'Arial', size: 20, color: C.white })] })],
  }))});
}

function dataRow(cells, shade = C.white) {
  const widths = cells.length === 2 ? [2800, 6560] : [2800, 3280, 3280];
  return new TableRow({ children: cells.map((c, i) => new TableCell({
    borders: cellBorders,
    width:   { size: widths[i], type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: { fill: shade, type: ShadingType.CLEAR },
    children: [new Paragraph({ children: [new TextRun({ text: c, font: 'Arial', size: 20 })] })],
  }))});
}

// ══════════════════════════════════════════════════════════════════════════
//  DOCUMENT CONTENT
// ══════════════════════════════════════════════════════════════════════════
const children = [

  /* ─── COVER ─────────────────────────────────────────────────────────── */
  new Paragraph({
    spacing: { before: 1440, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: 'PAF AI STUDIO', bold: true, size: 48, font: 'Arial', color: C.danamon,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: 'PAF_AGENT_ALERT — MCP Migration Guide', bold: true, size: 34, font: 'Arial', color: C.dark })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: 'Oracle Database as MCP Server', size: 26, font: 'Arial', color: C.blue, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.danamon } },
    children: [new TextRun({ text: 'Bank Danamon Intelligence RM Platform  |  Version 2.0  |  2026', size: 20, font: 'Arial', color: '666666' })],
  }),
  space(),

  // Metadata box
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: { style: BorderStyle.SINGLE, size: 8, color: C.danamon }, bottom: { style: BorderStyle.SINGLE, size: 8, color: C.danamon }, left: { style: BorderStyle.SINGLE, size: 8, color: C.danamon }, right: { style: BorderStyle.SINGLE, size: 8, color: C.danamon } },
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: C.lightBg, type: ShadingType.CLEAR },
      margins: { top: 200, bottom: 200, left: 300, right: 300 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DOCUMENT INFORMATION', bold: true, size: 22, font: 'Arial', color: C.header })] }),
        space(),
        new Paragraph({ children: [new TextRun({ text: 'Purpose:   ', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: 'Step-by-step guide to migrate PAF_AGENT_ALERT from in-database framework to Oracle DB MCP server in PAF AI Studio', font: 'Arial', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Audience:  ', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: 'Oracle AI Engineers, RM Platform Developers', font: 'Arial', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Platform:  ', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: 'Oracle ADB 26ai + PAF AI Studio + Node.js Express Backend', font: 'Arial', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Companion: ', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: 'Migration 23 (scripts/run_migration_23.js) creates all DB objects', font: 'Arial', size: 20 })] }),
      ],
    })]})],
  }),
  space(),

  /* ─── 1. OVERVIEW ───────────────────────────────────────────────────── */
  h1('1. Overview & Architecture'),

  body('This guide covers the migration of PAF_AGENT_ALERT from its original in-database execution framework to a Model Context Protocol (MCP) architecture where Oracle Database acts as the MCP server.'),
  space(),

  h2('1.1 What Changed'),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 3280, 3280],
    rows: [
      headerRow('Aspect', 'Before (In-DB)', 'After (MCP)'),
      dataRow(['Data fetch', 'Node.js pre-fetches all data\nbefore LLM call', 'PAF agent queries Oracle DB\nvia MCP tools autonomously'], C.white),
      dataRow(['Context size', 'Fixed prompt built in alertService.js', 'Agent decides what to query\nbased on the alert type'], 'F9F9F9'),
      dataRow(['LLM call', 'Direct OCI Cohere chatStream()', 'PAF AI Studio orchestrates\nmulti-step reasoning'], C.white),
      dataRow(['Traceability', 'No persistent log', 'MCP_ANALYSIS_LOG table records\nevery analysis run'], 'F9F9F9'),
      dataRow(['Extensibility', 'Hard-coded RAG sources', 'Add Oracle DB views as new MCP\ntools without code changes'], C.white),
    ],
  }),
  space(),

  h2('1.2 Architecture Diagram'),
  codeBlock('  Browser / RM Dashboard'),
  codeBlock('        ↓ GET /api/alerts/:id/analyze  (SSE)'),
  codeBlock('  Express Backend (alertService.js)'),
  codeBlock('        ↓ PAF_MCP_ENABLED=true'),
  codeBlock('  pafAlertMCPService.js → POST /agentFactory/v1/agentBuilder/run/{AGENT_ID}'),
  codeBlock('        ↓ Basic Auth'),
  codeBlock('  PAF AI Studio (PAF_AGENT_ALERT)'),
  codeBlock('        ↓ MCP Tool calls'),
  codeBlock('  Oracle ADB 26ai (MCP Server)'),
  codeBlock('    ├── SELECT * FROM MCP_V_ALERT_DETAIL        WHERE ALERT_ID = ?'),
  codeBlock('    ├── SELECT * FROM MCP_V_CUSTOMER_PORTFOLIO  WHERE CUSTOMER_ID = ?'),
  codeBlock('    └── SELECT * FROM MCP_V_PRODUCT_PERFORMANCE WHERE PRODUCT_ID IN (...)'),
  codeBlock('        ↓ Agent synthesizes analysis'),
  codeBlock('  SSE token stream → Browser'),
  space(),

  /* ─── 2. PREREQUISITES ──────────────────────────────────────────────── */
  h1('2. Prerequisites'),

  h2('2.1 Database Objects (Migration 23)'),
  body('Run the following before configuring PAF AI Studio:'),
  codeBlock('  cd C:\\Users\\deny\\Desktop\\Project-Danamon-RM'),
  codeBlock('  node scripts/run_migration_23.js'),
  space(),
  body('Migration 23 creates:'),
  bullet('MCP_V_ALERT_DETAIL — alert detail + full customer profile'),
  bullet('MCP_V_CUSTOMER_PORTFOLIO — active holdings with return and maturity'),
  bullet('MCP_V_PRODUCT_PERFORMANCE — benchmark comparison data'),
  bullet('MCP_SP_GET_ALERT_CONTEXT — stored procedure returning JSON context (one call)'),
  bullet('MCP_SP_LOG_ANALYSIS — stored procedure for audit logging'),
  bullet('MCP_ANALYSIS_LOG — persistent analysis log table'),
  space(),

  h2('2.2 Oracle ADB 26ai JDBC Connection'),
  body('PAF AI Studio needs a JDBC connection to Oracle ADB. Collect these values:'),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 6360],
    rows: [
      twoColRow('Parameter', 'Value', C.lightBg),
      twoColRow('JDBC Driver', 'Oracle JDBC (ojdbc8.jar or ojdbc11.jar)'),
      twoColRow('Connection String', 'jdbc:oracle:thin:@malbdvdawec3xe8i_tp?TNS_ADMIN=./wallet', 'F9F9F9'),
      twoColRow('Username', 'DBN'),
      twoColRow('Password', 'Apex2026IntramedikaJaya', 'F9F9F9'),
      twoColRow('Wallet Directory', './wallet (upload zip to PAF Studio)'),
    ],
  }),
  space(),

  h2('2.3 PAF AI Studio Access'),
  bullet('PAF AI Studio URL: https://161.33.3.160:8080'),
  bullet('Login: deny.nursidiq@oracle.com / Intramedika2045#Startup'),
  bullet('Accept self-signed certificate in browser before connecting'),
  space(),
  note('🔒 Note:', 'Accept the browser certificate warning for the PAF Studio URL. The Express backend already uses rejectUnauthorized:false for this connection.'),
  space(),

  /* ─── 3. STEP 1: MCP SERVER ─────────────────────────────────────────── */
  h1('3. Step 1 — Register Oracle DB as MCP Server'),

  h2('3.1 Open MCP Server Configuration'),
  numbered('Log into PAF AI Studio: https://161.33.3.160:8080'),
  numbered('Click Settings (⚙️) in the left navigation'),
  numbered('Select MCP Servers → Add MCP Server'),
  numbered('Choose connector type: Oracle Database'),
  space(),

  h2('3.2 Fill in Connection Details'),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 6360],
    rows: [
      twoColRow('Field', 'Value to Enter', C.lightBg),
      twoColRow('Server Name', 'oracle-danamon-db', 'F9F9F9'),
      twoColRow('Display Name', 'Oracle ADB 26ai — Danamon Intelligence'),
      twoColRow('JDBC URL', 'jdbc:oracle:thin:@malbdvdawec3xe8i_tp?TNS_ADMIN=/opt/wallet', 'F9F9F9'),
      twoColRow('Database User', 'DBN'),
      twoColRow('Database Password', 'Apex2026IntramedikaJaya', 'F9F9F9'),
      twoColRow('Schema', 'DBN'),
      twoColRow('Allowed Objects', 'MCP_V_ALERT_DETAIL, MCP_V_CUSTOMER_PORTFOLIO, MCP_V_PRODUCT_PERFORMANCE', 'F9F9F9'),
      twoColRow('Allow Stored Procedures', 'Yes — MCP_SP_GET_ALERT_CONTEXT, MCP_SP_LOG_ANALYSIS'),
    ],
  }),
  space(),

  h2('3.3 Upload Wallet (if using mTLS)'),
  numbered('Download wallet zip from OCI Console → Autonomous Database → DB Connection'),
  numbered('In PAF Studio MCP Server config → Wallet section → Upload ZIP'),
  numbered('Set TNS_ADMIN to the path where PAF Studio extracts the wallet'),
  numbered('Click Test Connection — verify "Connected successfully"'),
  numbered('Click Save MCP Server'),
  space(),
  note('✅ Success:', 'The MCP Server card shows a green dot with "Connected". The three MCP_V_* views will appear as queryable tools in the tool browser.'),
  space(),

  /* ─── 4. STEP 2: CREATE AGENT ───────────────────────────────────────── */
  h1('4. Step 2 — Create PAF_AGENT_ALERT in PAF AI Studio'),

  h2('4.1 Create New Agent'),
  numbered('In PAF Studio left nav → My Agents → New Agent'),
  numbered('Set the following agent properties:'),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 6360],
    rows: [
      twoColRow('Property', 'Value', C.lightBg),
      twoColRow('Agent Name', 'PAF_AGENT_ALERT', 'F9F9F9'),
      twoColRow('Display Name', 'Portfolio Alert Intelligence Agent'),
      twoColRow('Description', 'Analyzes portfolio alerts and generates intervention strategies using live Oracle DB data via MCP tools', 'F9F9F9'),
      twoColRow('LLM Model', 'cohere.command-r-plus-08-2024 (OCI GenAI)'),
      twoColRow('Max Tokens', '2500', 'F9F9F9'),
      twoColRow('Temperature', '0.3'),
      twoColRow('Streaming', 'Enabled', 'F9F9F9'),
    ],
  }),
  space(),

  h2('4.2 Attach Oracle DB MCP Server'),
  numbered('In the agent editor → Tools tab → Add MCP Server'),
  numbered('Select: oracle-danamon-db (created in Step 1)'),
  numbered('Enable the following tools:'),
  bullet('query_sql — allows agent to run SELECT statements on allowed views'),
  bullet('call_procedure — allows agent to call MCP_SP_GET_ALERT_CONTEXT'),
  numbered('Set Max Tool Calls per turn: 5'),
  numbered('Enable Tool Retry on error: Yes, max 2 retries'),
  space(),

  /* ─── 5. STEP 3: SYSTEM PREAMBLE ────────────────────────────────────── */
  h1('5. Step 3 — Configure System Preamble'),

  h2('5.1 Preamble / System Instruction'),
  body('Navigate to Agent → System Preamble. Paste the text below:'),
  space(),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: cellBorders, width: { size: 9360, type: WidthType.DXA },
      shading: { fill: C.codeBg, type: ShadingType.CLEAR },
      margins: { top: 160, bottom: 160, left: 200, right: 200 },
      children: [
        new Paragraph({ children: [new TextRun({ text: '-- SYSTEM PREAMBLE: PAF_AGENT_ALERT --', bold: true, font: 'Courier New', size: 18, color: C.blue })] }),
        new Paragraph({ children: [new TextRun({ text: 'Kamu adalah AI Advisor Senior Bank Danamon yang menganalisis portfolio alerts.', font: 'Courier New', size: 18 })] }),
        space(),
        new Paragraph({ children: [new TextRun({ text: 'KEMAMPUAN UTAMA:', bold: true, font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '1. Ambil data langsung dari Oracle Database via MCP tools', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '2. Analisis metrik yang dilanggar dengan konteks portofolio nasabah', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '3. Buat strategi intervensi terstruktur berbasis data', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '4. Gunakan format output wajib yang diberikan dalam prompt', font: 'Courier New', size: 18 })] }),
        space(),
        new Paragraph({ children: [new TextRun({ text: 'ATURAN PENTING:', bold: true, font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '- SELALU query Oracle DB sebelum membuat analisis', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '- JANGAN mengarang angka — hanya gunakan data dari DB', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '- Sebutkan nilai Rupiah dan persentase spesifik dari data', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '- Respons dalam Bahasa Indonesia yang profesional', font: 'Courier New', size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: '- Format output: markdown dengan header ### dan tabel', font: 'Courier New', size: 18 })] }),
      ],
    })]})],
  }),
  space(),

  /* ─── 6. STEP 4: AGENT FLOW ─────────────────────────────────────────── */
  h1('6. Step 4 — Design the Agent Flow'),

  h2('6.1 Flow Overview'),
  body('In PAF AI Studio → Agent Flow Editor, design the following ReAct-style flow:'),
  space(),
  codeBlock('  User Input (alert_id + context)'),
  codeBlock('         ↓'),
  codeBlock('  [THINK] Determine which MCP tools to call'),
  codeBlock('         ↓'),
  codeBlock('  [ACT 1] query_sql: MCP_V_ALERT_DETAIL WHERE ALERT_ID = {alert_id}'),
  codeBlock('         ↓ result: alert detail + customer profile'),
  codeBlock('  [ACT 2] query_sql: MCP_V_CUSTOMER_PORTFOLIO WHERE CUSTOMER_ID = {customer_id}'),
  codeBlock('         ↓ result: all active holdings'),
  codeBlock('  [ACT 3] query_sql: MCP_V_PRODUCT_PERFORMANCE WHERE PRODUCT_ID IN (...)'),
  codeBlock('         ↓ result: benchmark comparison'),
  codeBlock('  [OBSERVE] Synthesize all results'),
  codeBlock('         ↓'),
  codeBlock('  [OUTPUT] Structured analysis in mandatory format'),
  space(),

  h2('6.2 Flow Node Configuration'),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 6560],
    rows: [
      headerRow('Node', 'Configuration'),
      dataRow(['Input Node', 'Accept: { message: string, context: { alert_id, alert_type, severity, customer_name } }']),
      dataRow(['Tool Node 1', 'Tool: query_sql\nInput: "SELECT * FROM MCP_V_ALERT_DETAIL WHERE ALERT_ID = {{context.alert_id}}"\nOutput: alert_data'], 'F9F9F9'),
      dataRow(['Tool Node 2', 'Tool: query_sql\nInput: "SELECT * FROM MCP_V_CUSTOMER_PORTFOLIO WHERE CUSTOMER_ID = {{alert_data.CUSTOMER_ID}}"\nOutput: portfolio_data']),
      dataRow(['Tool Node 3', 'Tool: query_sql\nInput: "SELECT * FROM MCP_V_PRODUCT_PERFORMANCE WHERE PRODUCT_ID IN (SELECT DISTINCT PRODUCT_ID FROM MCP_V_CUSTOMER_PORTFOLIO WHERE CUSTOMER_ID = {{alert_data.CUSTOMER_ID}})"\nOutput: perf_data'], 'F9F9F9'),
      dataRow(['LLM Node', 'Combine alert_data + portfolio_data + perf_data into analysis\nUse system preamble + user message format\nStream output: enabled']),
      dataRow(['Output Node', 'Return: { message: "..analyzed text.." }\nLog: call_procedure MCP_SP_LOG_ANALYSIS'], 'F9F9F9'),
    ],
  }),
  space(),
  note('💡 Tip:', 'In PAF AI Studio Flow Editor, use the "Variable Binding" feature to pass {{context.alert_id}} from the input node to subsequent tool nodes automatically.'),
  space(),

  /* ─── 7. STEP 5: TEST ───────────────────────────────────────────────── */
  h1('7. Step 5 — Test the Agent'),

  h2('7.1 Test via PAF Studio Chat'),
  numbered('In the agent editor → click Test (chat icon)'),
  numbered('Send the following test message:'),
  codeBlock('  Analisis alert portofolio alert_id = 1. Ambil data dari Oracle DB via MCP tools dan buat strategi intervensi lengkap.'),
  numbered('Verify the agent:'),
  bullet('Calls query_sql 3 times (visible in tool call trace)'),
  bullet('Returns structured analysis with ### headers'),
  bullet('Shows specific Rupiah values and percentages from DB data'),
  space(),

  h2('7.2 Test via REST API (curl)'),
  body('After saving and publishing the agent, test the REST endpoint:'),
  codeBlock('  curl -k -X POST https://161.33.3.160:8080/agentFactory/v1/agentBuilder/run/{AGENT_ID} \\'),
  codeBlock('    -H "Authorization: Basic $(echo -n \'deny.nursidiq@oracle.com:Intramedika2045#Startup\' | base64)" \\'),
  codeBlock('    -H "Content-Type: application/json" \\'),
  codeBlock('    -d \'{'),
  codeBlock('      "message": "Analisis alert #1 dan buat strategi intervensi.",'),
  codeBlock('      "roomId": "test_001",'),
  codeBlock('      "context": { "alert_id": "1", "task": "alert_intervention_analysis" }'),
  codeBlock('    }\''),
  space(),
  body('Expected response shape:'),
  codeBlock('  {'),
  codeBlock('    "message": "### 🚨 DASAR TRIGGER ALERT\\n...",'),
  codeBlock('    "sessionId": "...",'),
  codeBlock('    "toolCalls": [...]'),
  codeBlock('  }'),
  space(),

  /* ─── 8. STEP 6: INTEGRATE ──────────────────────────────────────────── */
  h1('8. Step 6 — Integrate with Intelligence RM Platform'),

  h2('8.1 Copy the Agent ID'),
  numbered('In PAF AI Studio → My Agents → PAF_AGENT_ALERT'),
  numbered('Click the three-dot menu → Copy Agent ID'),
  numbered('The Agent ID looks like: 52B6A3C5F895DC49E0636617000AFE53 (hex string)'),
  space(),

  h2('8.2 Update .env File'),
  body('Open C:\\Users\\deny\\Desktop\\Project-Danamon-RM\\.env and update:'),
  codeBlock('  # Enable MCP mode for alert analysis'),
  codeBlock('  PAF_MCP_ENABLED=true'),
  codeBlock(''),
  codeBlock('  # PAF AI Studio base URL (without path)'),
  codeBlock('  PAF_MCP_AGENT_ENDPOINT=https://161.33.3.160:8080'),
  codeBlock(''),
  codeBlock('  # Agent ID copied from PAF Studio'),
  codeBlock('  PAF_MCP_AGENT_ID=<paste-agent-id-here>'),
  space(),
  note('⚠️ Important:', 'PAF_AUTH_USER and PAF_AUTH_PASS are already in .env and are shared. Do not duplicate them.'),
  space(),

  h2('8.3 Restart the Backend Server'),
  codeBlock('  # Stop existing server (Ctrl+C or kill PID)'),
  codeBlock('  # Then restart:'),
  codeBlock('  node server.js'),
  space(),
  body('The server log should show:'),
  codeBlock('  [DB] Oracle Autonomous Database 26ai pool initialized'),
  codeBlock('  Server running on port 3000'),
  space(),

  h2('8.4 Verify End-to-End'),
  numbered('Login to the RM Dashboard at http://localhost:3000'),
  numbered('Navigate to Alerts → click on any alert card'),
  numbered('Click the "Analisis AI" button'),
  numbered('Observe the stage timeline showing:'),
  bullet('✅ PAF MCP Intelligence Engine — active → done'),
  bullet('✅ Oracle DB MCP Tools — active → done'),
  numbered('Read the structured analysis — verify it shows actual customer data (name, AUM, product names)'),
  numbered('Check MCP_ANALYSIS_LOG in Oracle DB to confirm the analysis was persisted:'),
  codeBlock('  SELECT LOG_ID, ALERT_ID, RM_USER_ID, MODEL_USED, DURATION_MS, CREATED_AT'),
  codeBlock('    FROM MCP_ANALYSIS_LOG ORDER BY CREATED_AT DESC FETCH FIRST 5 ROWS ONLY;'),
  space(),

  /* ─── 9. FALLBACK BEHAVIOR ──────────────────────────────────────────── */
  h1('9. Fallback Behavior'),

  body('The system is designed to never fail silently. The fallback chain is:'),
  space(),
  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 6560],
    rows: [
      headerRow('Condition', 'What Happens'),
      dataRow(['PAF_MCP_ENABLED=false', 'Skips MCP entirely — uses direct OCI Cohere (original path)']),
      dataRow(['PAF_MCP_AGENT_ID not set', 'Logs warning, falls back to direct OCI Cohere'], 'F9F9F9'),
      dataRow(['PAF Studio unreachable', 'HTTP timeout after 120s — stage shows error, falls back to direct LLM']),
      dataRow(['Agent returns empty/short response', 'Detected by pafAlertMCPService — falls back automatically'], 'F9F9F9'),
      dataRow(['MCP_ANALYSIS_LOG write fails', 'Logged as warning — never blocks the main analysis flow']),
    ],
  }),
  space(),
  note('📋 Monitoring:', 'Check server console for [PAF-MCP] log lines. Fallback activations are logged with the reason so you can diagnose connectivity issues.'),
  space(),

  /* ─── 10. ENV VARS REFERENCE ────────────────────────────────────────── */
  h1('10. Environment Variables Reference'),

  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [3600, 2400, 3360],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: cellBorders, width: { size: 3600, type: WidthType.DXA }, shading: { fill: C.blue, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Variable', bold: true, font: 'Arial', size: 20, color: C.white })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: C.blue, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Default', bold: true, font: 'Arial', size: 20, color: C.white })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 3360, type: WidthType.DXA }, shading: { fill: C.blue, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, font: 'Arial', size: 20, color: C.white })] })] }),
      ]}),
      ...[
        ['PAF_MCP_ENABLED',          'false',  'Set true to activate MCP agent path'],
        ['PAF_MCP_AGENT_ENDPOINT',   '(empty)', 'Base URL of PAF AI Studio server'],
        ['PAF_MCP_AGENT_ID',         '(empty)', 'Agent ID from PAF Studio My Agents'],
        ['PAF_AUTH_USER',            '(set)',   'PAF Studio login username (shared)'],
        ['PAF_AUTH_PASS',            '(set)',   'PAF Studio login password (shared)'],
        ['PAF_MCP_DB_USER',          'DBN',     'Oracle DB user for PAF Studio MCP reference'],
        ['PAF_MCP_DB_CONNECT_STRING','(set)',   'TNS alias for PAF Studio MCP connection'],
      ].map(([v, d, desc], i) => new TableRow({ children: [
        new TableCell({ borders: cellBorders, width: { size: 3600, type: WidthType.DXA }, shading: { fill: i % 2 ? 'F9F9F9' : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: v, font: 'Courier New', size: 18 })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: i % 2 ? 'F9F9F9' : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: d, font: 'Courier New', size: 18 })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 3360, type: WidthType.DXA }, shading: { fill: i % 2 ? 'F9F9F9' : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: desc, font: 'Arial', size: 18 })] })] }),
      ]})),
    ],
  }),
  space(),

  /* ─── 11. TROUBLESHOOTING ───────────────────────────────────────────── */
  h1('11. Troubleshooting'),

  new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [3800, 5560],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: cellBorders, width: { size: 3800, type: WidthType.DXA }, shading: { fill: C.danamon, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Problem', bold: true, font: 'Arial', size: 20, color: C.white })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 5560, type: WidthType.DXA }, shading: { fill: C.danamon, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Solution', bold: true, font: 'Arial', size: 20, color: C.white })] })] }),
      ]}),
      ...[
        ['[PAF-MCP] PAF_MCP_AGENT_ENDPOINT or PAF_MCP_AGENT_ID not configured', 'Set both vars in .env and restart server'],
        ['HTTP 401 from PAF Studio', 'Verify PAF_AUTH_USER and PAF_AUTH_PASS in .env match PAF Studio credentials'],
        ['HTTP 404 from PAF Studio', 'Verify the AGENT_ID exists in PAF Studio — My Agents. Re-copy the ID.'],
        ['PAF MCP request timeout after 120s', 'PAF Studio server is unreachable. Check network/VPN. Verify https://161.33.3.160:8080 is accessible from the server.'],
        ['Agent returns generic response without DB data', 'MCP tool calls failed. Check PAF Studio → Agent Run Log for tool errors. Verify Oracle DB MCP connection is active.'],
        ['ORA-01031 insufficient privileges on MCP views', 'Re-run migration 23 to ensure GRANT SELECT on views to PUBLIC.'],
        ['MCP_ANALYSIS_LOG write fails (non-critical)', 'Verify MCP_SP_LOG_ANALYSIS was created. Run: EXEC MCP_SP_LOG_ANALYSIS(1, NULL, NULL, NULL, NULL); in SQLDeveloper.'],
        ['Analysis still uses direct LLM (fallback)', 'Check server console for [PAF-MCP] lines to see which condition triggered the fallback.'],
      ].map(([prob, sol], i) => new TableRow({ children: [
        new TableCell({ borders: cellBorders, width: { size: 3800, type: WidthType.DXA }, shading: { fill: i % 2 ? 'FFF8F8' : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: prob, font: 'Courier New', size: 18, color: C.dark })] })] }),
        new TableCell({ borders: cellBorders, width: { size: 5560, type: WidthType.DXA }, shading: { fill: i % 2 ? 'FFF8F8' : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: sol, font: 'Arial', size: 18 })] })] }),
      ]})),
    ],
  }),
  space(),

  /* ─── 12. DB OBJECTS QUICK REFERENCE ────────────────────────────────── */
  h1('12. Oracle DB Objects Quick Reference'),

  h2('MCP_V_ALERT_DETAIL (View)'),
  codeBlock('  SELECT ALERT_ID, CUSTOMER_ID, ALERT_TYPE, SEVERITY, TITLE, MESSAGE,'),
  codeBlock('         METRIC_KEY, METRIC_VALUE, THRESHOLD, STATUS, TRIGGERED_FMT,'),
  codeBlock('         CUSTOMER_NAME, TIER, TIER_LABEL, RISK_PROFILE, TOTAL_AUM,'),
  codeBlock('         AGE, GENDER, RM_NAME, RM_BRANCH'),
  codeBlock('    FROM MCP_V_ALERT_DETAIL WHERE ALERT_ID = :alert_id;'),
  space(),

  h2('MCP_V_CUSTOMER_PORTFOLIO (View)'),
  codeBlock('  SELECT HOLDING_ID, PRODUCT_ID, PRODUCT_NAME, CATEGORY,'),
  codeBlock('         AMOUNT, INTEREST_RATE, RETURN_PCT, START_DATE, MATURITY_DATE,'),
  codeBlock('         DAYS_TO_MATURITY, AMOUNT_FMT'),
  codeBlock('    FROM MCP_V_CUSTOMER_PORTFOLIO WHERE CUSTOMER_ID = :customer_id;'),
  space(),

  h2('MCP_V_PRODUCT_PERFORMANCE (View)'),
  codeBlock('  SELECT PRODUCT_ID, PRODUCT_NAME, BENCHMARK_NAME,'),
  codeBlock('         RETURN_1M, RETURN_3M, RETURN_6M, RETURN_1Y,'),
  codeBlock('         BENCH_RETURN_3M, ALPHA_3M, UPDATED_FMT'),
  codeBlock('    FROM MCP_V_PRODUCT_PERFORMANCE WHERE PRODUCT_ID IN (...);'),
  space(),

  h2('MCP_SP_GET_ALERT_CONTEXT (Stored Procedure)'),
  body('Returns full JSON context for an alert_id in a single call — useful for batch/offline scenarios:'),
  codeBlock('  DECLARE'),
  codeBlock('    v_ctx CLOB;'),
  codeBlock('  BEGIN'),
  codeBlock('    MCP_SP_GET_ALERT_CONTEXT(1, v_ctx);'),
  codeBlock('    DBMS_OUTPUT.PUT_LINE(v_ctx);'),
  codeBlock('  END;'),
  space(),

  // Footer note
  new Paragraph({
    spacing: { before: 400 },
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.danamon } },
    children: [new TextRun({
      text: 'Bank Danamon Intelligence RM Platform  |  PAF_AGENT_ALERT MCP Guide  |  Generated 2026',
      font: 'Arial', size: 18, color: '888888',
    })],
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  BUILD DOCUMENT
// ══════════════════════════════════════════════════════════════════════════
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      },
      {
        reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Arial', size: 22 } },
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: C.header },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: C.blue },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: C.dark },
        paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size:   { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border:    { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.danamon } },
          children:  [
            new TextRun({ text: 'Bank Danamon  |  PAF_AGENT_ALERT MCP Guide', font: 'Arial', size: 18, color: '666666' }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border:    { top: { style: BorderStyle.SINGLE, size: 2, color: C.border } },
          children:  [
            new TextRun({ text: 'Page ', font: 'Arial', size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '666666' }),
            new TextRun({ text: ' of ', font: 'Arial', size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: '666666' }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log('✅  Generated:', OUT);
}).catch(err => {
  console.error('❌  DOCX generation failed:', err.message);
  process.exit(1);
});
