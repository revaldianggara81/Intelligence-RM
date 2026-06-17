'use strict';
/**
 * portfolioReportService.js
 * Generates a professional DOCX report from AI analysis + portfolio data.
 * Uses the `docx` npm package (already in devDependencies).
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType,
  HeadingLevel, PageBreak, PageNumber, LevelFormat,
} = require('docx');

/* ── Constants ──────────────────────────────────────────────────────── */
const DXA = n => n;           // pass-through (already in DXA)
const PAGE_W   = 12240;       // US Letter width
const PAGE_H   = 15840;       // US Letter height
const MARGIN   = 1080;        // 0.75 inch
const CONTENT_W = PAGE_W - MARGIN * 2;   // 10080

const CLR = {
  primary:   '1A5276',   // dark blue
  accent:    '2E86C1',   // mid blue
  cyan:      '00CCFF',
  green:     '00D47E',
  gold:      'D4AC0D',
  red:       'E74C3C',
  bg:        'EBF5FB',
  bgLight:   'F8FCFF',
  border:    'AED6F1',
  txt:       '1B2631',
  txtLight:  '566573',
  white:     'FFFFFF',
};

const borderThin = (color = CLR.border) => ({
  style: BorderStyle.SINGLE, size: 1, color,
});
const cellBorders = (color = CLR.border) => ({
  top: borderThin(color), bottom: borderThin(color),
  left: borderThin(color), right: borderThin(color),
});
const noBorder = () => ({
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
});

/* ── Helpers ────────────────────────────────────────────────────────── */
const fmtRp = v => {
  v = Math.round(v || 0);
  if (v >= 1e12) return `Rp ${(v/1e12).toFixed(2)} T`;
  if (v >= 1e9)  return `Rp ${(v/1e9).toFixed(2)} M`;
  if (v >= 1e6)  return `Rp ${Math.round(v/1e6)} Jt`;
  if (v >= 1e3)  return `Rp ${Math.round(v/1e3)} Rb`;
  return `Rp ${v.toLocaleString('id-ID')}`;
};
const pct = (part, total) =>
  total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '—';

const run = (text, opts = {}) => new TextRun({
  text: String(text ?? ''),
  font: 'Arial',
  size: opts.size || 22,
  bold:   opts.bold   || false,
  italics:opts.italic || false,
  color:  opts.color  || CLR.txt,
});

const para = (children, opts = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [run(children, opts)],
  alignment: opts.align || AlignmentType.LEFT,
  spacing:   { before: opts.before ?? 40, after: opts.after ?? 40 },
  ...(opts.heading ? { heading: opts.heading } : {}),
  ...(opts.indent  ? { indent: opts.indent }   : {}),
  ...(opts.bullet  ? {
    numbering: { reference: 'bullets', level: 0 },
  } : {}),
  ...(opts.border ? {
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: CLR.accent, space: 4 } },
  } : {}),
});

const space = (pts = 80) => para('', { before: pts, after: 0 });

const sectionHeading = (title, icon = '') => [
  space(120),
  para(
    [run(`${icon}  ${title}`, { size: 26, bold: true, color: CLR.primary })],
    { border: true, before: 0, after: 80 }
  ),
];

const cellHead = (text, w, opts = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  borders: cellBorders(CLR.accent),
  shading: { fill: CLR.primary, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [para(run(text, { bold: true, size: 18, color: CLR.white }))],
  ...opts,
});
const cellData = (text, w, opts = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  borders: cellBorders(CLR.border),
  shading: { fill: opts.shade || CLR.bgLight, type: ShadingType.CLEAR },
  margins: { top: 70, bottom: 70, left: 120, right: 120 },
  children: [para(run(text, { size: 19, color: opts.color || CLR.txt, bold: opts.bold }))],
  ...opts,
});

/* ── Markdown → docx paragraphs ─────────────────────────────────────── */
function parseMarkdown(text) {
  if (!text) return [para('—', { before: 0, after: 0 })];
  const items = [];
  const lines = text.split('\n');
  let tableRows = [];
  let inTable = false;
  let inList  = false;

  const flushTable = () => {
    if (!tableRows.length) return;
    // first row = headers, second = separator, rest = data
    const [hdrLine, , ...dataLines] = tableRows;
    const heads = hdrLine.split('|').filter((_,i,a) => i > 0 && i < a.length-1).map(c => c.trim());
    const colW   = Math.floor(CONTENT_W / Math.max(heads.length, 1));
    const hdrRow = new TableRow({
      children: heads.map(h => cellHead(h, colW)),
    });
    const dataRows = dataLines.filter(l => l.trim()).map((line, ri) => new TableRow({
      children: line.split('|').filter((_,i,a) => i > 0 && i < a.length-1).map((c,ci) => {
        const txt = c.trim();
        const isNum = /^Rp\s*[\d,.]/.test(txt);
        return cellData(txt, colW, {
          shade: ri % 2 === 0 ? CLR.bgLight : CLR.white,
          color: isNum ? CLR.accent : CLR.txt,
          bold:  isNum,
        });
      }),
    }));
    items.push(new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: heads.map(() => colW),
      rows: [hdrRow, ...dataRows],
    }));
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const t    = line.trim();

    if (t.startsWith('## ')) {
      if (inTable) { flushTable(); inTable = false; }
      inList = false;
      // Skip — section headings rendered separately
      continue;
    }
    if (t.startsWith('| ') || t.startsWith('|---')) {
      if (!inTable) inTable = true;
      if (!t.startsWith('|---')) tableRows.push(t);
      continue;
    }
    if (inTable && !t.startsWith('|')) {
      flushTable(); inTable = false;
    }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      inList = true;
      const content = t.slice(2).replace(/\*\*(.+?)\*\*/g, '$1');
      items.push(para(
        [run('•  ', { bold: true, color: CLR.accent, size: 20 }),
         run(content, { size: 20, color: CLR.txt })],
        { before: 20, after: 20 }
      ));
      continue;
    }
    inList = false;
    if (t) {
      const content = t.replace(/\*\*(.+?)\*\*/g, '$1');
      items.push(para([run(content, { size: 20, color: CLR.txtLight })], { before: 30, after: 30 }));
    }
  }
  if (inTable) flushTable();
  return items.length ? items : [para('—', { before: 0, after: 0 })];
}

/* ── Section extractor ───────────────────────────────────────────────── */
function extractSection(text, heading) {
  const re = new RegExp(`## ${heading}\\s*\n([\\s\\S]*?)(?=\n## |$)`, 'i');
  const m  = text.match(re);
  return m ? m[1].trim() : '';
}

/* ── DOCX builder ────────────────────────────────────────────────────── */
async function generateDocx({ customer, forecast, alerts, analysis, rmName, reportId }) {
  const { products = [], total = [], total_net = [], quarters = [] } = forecast || {};
  const custName   = customer.FULL_NAME   || 'Nasabah';
  const tier       = customer.TIER        || '—';
  const riskProf   = customer.RISK_PROFILE || 'Moderat';
  const totalFinal = total[total.length - 1]     || 0;
  const netFinal   = total_net[total_net.length - 1] || totalFinal;
  const dateStr    = new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

  /* Pull AI sections */
  const secOverview  = extractSection(analysis, 'Gambaran Umum');
  const secGrowth    = extractSection(analysis, 'Analisis Pertumbuhan');
  const secDiversi   = extractSection(analysis, 'Diversifikasi Portofolio');
  const secInsight   = extractSection(analysis, 'Insight Strategis');
  const secConclusion= extractSection(analysis, 'Kesimpulan');

  /* ── Active alerts summary ─────────────────────────────────────────── */
  const alertList = (alerts || []).slice(0, 15);
  const highCount = alertList.filter(a => a.SEVERITY === 'high').length;

  /* ── Risk badge color ──────────────────────────────────────────────── */
  const riskColor = riskProf?.toLowerCase().includes('agresif') ? CLR.red
    : riskProf?.toLowerCase().includes('konservatif') ? CLR.green
    : CLR.gold;

  /* ═════════════════════════════════════════════════════════════════════
     DOCUMENT
  ═════════════════════════════════════════════════════════════════════ */
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Table({
              width: { size: CONTENT_W, type: WidthType.DXA },
              columnWidths: [CONTENT_W - 2400, 2400],
              rows: [new TableRow({ children: [
                new TableCell({
                  width: { size: CONTENT_W - 2400, type: WidthType.DXA },
                  borders: noBorder(),
                  children: [para([
                    run('Bank Danamon', { bold: true, size: 18, color: CLR.primary }),
                    run('  ·  Intelligence RM Platform', { size: 18, color: CLR.txtLight }),
                  ])],
                }),
                new TableCell({
                  width: { size: 2400, type: WidthType.DXA },
                  borders: noBorder(),
                  children: [para([
                    run('Laporan Portofolio  ', { size: 17, color: CLR.txtLight }),
                    new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 17, color: CLR.txtLight }),
                  ], { align: AlignmentType.RIGHT })],
                }),
              ]})],
            }),
            new Paragraph({
              children: [],
              border: { bottom: borderThin(CLR.accent) },
              spacing: { before: 40, after: 60 },
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [],
              border: { top: borderThin(CLR.border) },
              spacing: { before: 40, after: 40 },
            }),
            para([
              run('KONFIDENSIAL — Hanya untuk Internal Bank Danamon', { size: 16, color: CLR.txtLight, italic: true }),
              run('   |   Dihasilkan oleh Intelligence RM Platform', { size: 16, color: CLR.txtLight }),
            ]),
          ],
        }),
      },
      children: [

        /* ══ COVER ═══════════════════════════════════════════════════ */
        // Bank name bar
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [CONTENT_W],
          rows: [new TableRow({ children: [new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: noBorder(),
            shading: { fill: CLR.primary, type: ShadingType.CLEAR },
            margins: { top: 200, bottom: 200, left: 300, right: 300 },
            children: [
              para([run('🏦  BANK DANAMON', { bold: true, size: 36, color: CLR.white })],
                { before: 0, after: 40 }),
              para([run('Intelligence RM Platform', { size: 22, color: 'AED6F1' })],
                { before: 0, after: 0 }),
            ],
          })]})],
        }),

        space(200),
        para([run('LAPORAN ANALISIS PORTOFOLIO INVESTASI', { bold: true, size: 34, color: CLR.primary })],
          { align: AlignmentType.CENTER, before: 0, after: 120 }),
        para([run('Ringkasan Eksekutif & Rekomendasi Strategis', { size: 22, italic: true, color: CLR.txtLight })],
          { align: AlignmentType.CENTER, before: 0, after: 200 }),

        // Info box
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [2400, CONTENT_W - 2400],
          rows: [
            new TableRow({ children: [
              cellHead('Nasabah', 2400),
              cellData(custName, CONTENT_W - 2400, { bold: true }),
            ]}),
            new TableRow({ children: [
              cellHead('Tier', 2400),
              cellData(tier, CONTENT_W - 2400),
            ]}),
            new TableRow({ children: [
              cellHead('Profil Risiko', 2400),
              cellData(riskProf, CONTENT_W - 2400, { color: riskColor, bold: true }),
            ]}),
            new TableRow({ children: [
              cellHead('Periode Proyeksi', 2400),
              cellData(`${quarters[0] || '—'} s/d ${quarters[3] || '—'}`, CONTENT_W - 2400),
            ]}),
            new TableRow({ children: [
              cellHead('Total Akhir (Neto)', 2400),
              cellData(fmtRp(netFinal), CONTENT_W - 2400, { color: CLR.accent, bold: true }),
            ]}),
            new TableRow({ children: [
              cellHead('Jumlah Produk', 2400),
              cellData(String(products.length), CONTENT_W - 2400),
            ]}),
            new TableRow({ children: [
              cellHead('Alert Aktif', 2400),
              cellData(`${alertList.length} alert${highCount ? ` (${highCount} urgent)` : ''}`,
                CONTENT_W - 2400, { color: highCount ? CLR.red : CLR.txt }),
            ]}),
            new TableRow({ children: [
              cellHead('Disiapkan oleh', 2400),
              cellData(rmName || '—', CONTENT_W - 2400),
            ]}),
            new TableRow({ children: [
              cellHead('Tanggal', 2400),
              cellData(dateStr, CONTENT_W - 2400),
            ]}),
            new TableRow({ children: [
              cellHead('Report ID', 2400),
              cellData(reportId ? `PAR-${String(reportId).padStart(6,'0')}` : '—', CONTENT_W - 2400),
            ]}),
          ],
        }),

        /* ── Page break ─────────────────────────────────────────────── */
        new Paragraph({ children: [new PageBreak()] }),

        /* ══ 1. GAMBARAN UMUM ════════════════════════════════════════ */
        ...sectionHeading('Gambaran Umum', '📋'),
        ...parseMarkdown(secOverview),

        /* ══ 2. PROFIL PORTOFOLIO ════════════════════════════════════ */
        ...sectionHeading('Profil Portofolio', '💼'),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [3000, 1800, 1200, 1680, 1440, CONTENT_W - 3000 - 1800 - 1200 - 1680 - 1440],
          rows: [
            new TableRow({ children: [
              cellHead('Produk', 3000),
              cellHead('Kategori', 1800),
              cellHead('Rate', 1200),
              cellHead('Pokok', 1680),
              cellHead('Nilai Akhir', 1440),
              cellHead('Kontribusi', CONTENT_W - 3000 - 1800 - 1200 - 1680 - 1440),
            ]}),
            ...products.map((p, ri) => {
              const q4 = p.cumulative?.[3] || 0;
              const contrib = pct(q4, totalFinal);
              return new TableRow({
                children: [
                  cellData(p.name || '—', 3000, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                  cellData(p.category || '—', 1800, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                  cellData(`${p.rate || 0}%`, 1200, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                  cellData(fmtRp(p.amount), 1680, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                  cellData(fmtRp(q4), 1440, { shade: ri%2===0 ? CLR.bgLight : CLR.white, color: CLR.accent, bold: true }),
                  cellData(contrib, CONTENT_W - 3000 - 1800 - 1200 - 1680 - 1440, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                ],
              });
            }),
            // Total row
            new TableRow({ children: [
              cellHead('TOTAL', 3000 + 1800 + 1200 + 1680),
              cellHead(fmtRp(totalFinal), 1440),
              cellHead('100%', CONTENT_W - 3000 - 1800 - 1200 - 1680 - 1440),
            ]}),
          ],
        }),

        /* ══ 3. PROYEKSI KUARTALAN ═══════════════════════════════════ */
        ...sectionHeading('Proyeksi Keuntungan per Kuartal', '📊'),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [2800, ...[0,1,2,3].map(() => Math.floor((CONTENT_W-2800)/4))],
          rows: [
            new TableRow({ children: [
              cellHead('Produk', 2800),
              ...(quarters.map(q => cellHead(q || '—', Math.floor((CONTENT_W-2800)/4)))),
            ]}),
            ...products.map((p, ri) => new TableRow({
              children: [
                cellData(p.name || '—', 2800, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                ...[0,1,2,3].map(qi => cellData(
                  fmtRp(p.cumulative?.[qi] || 0),
                  Math.floor((CONTENT_W-2800)/4),
                  { shade: ri%2===0 ? CLR.bgLight : CLR.white, color: CLR.accent }
                )),
              ],
            })),
            new TableRow({ children: [
              cellHead('Total Bruto', 2800),
              ...[0,1,2,3].map(qi => cellHead(fmtRp(total[qi]||0), Math.floor((CONTENT_W-2800)/4))),
            ]}),
            new TableRow({ children: [
              cellHead('Total Neto', 2800),
              ...[0,1,2,3].map(qi => cellHead(fmtRp(total_net[qi]||0), Math.floor((CONTENT_W-2800)/4))),
            ]}),
          ],
        }),

        /* ══ 4. ALERT AKTIF ══════════════════════════════════════════ */
        ...sectionHeading('Alert Aktif Nasabah', '🔔'),
        alertList.length === 0
          ? para([run('Tidak ada alert aktif.', { italic: true, color: CLR.txtLight, size: 20 })])
          : new Table({
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [2400, 2000, 1200, CONTENT_W - 2400 - 2000 - 1200],
            rows: [
              new TableRow({ children: [
                cellHead('Tipe Alert', 2400),
                cellHead('Judul', 2000),
                cellHead('Severity', 1200),
                cellHead('Deskripsi', CONTENT_W - 2400 - 2000 - 1200),
              ]}),
              ...alertList.map((a, ri) => new TableRow({
                children: [
                  cellData(a.ALERT_TYPE || '—', 2400, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                  cellData(a.TITLE || '—', 2000, { shade: ri%2===0 ? CLR.bgLight : CLR.white }),
                  cellData(a.SEVERITY || '—', 1200, {
                    shade: ri%2===0 ? CLR.bgLight : CLR.white,
                    color: a.SEVERITY === 'high' ? CLR.red : a.SEVERITY === 'medium' ? CLR.gold : CLR.green,
                    bold: true,
                  }),
                  cellData(
                    String(a.DESCRIPTION || a.MESSAGE || '—').slice(0, 120),
                    CONTENT_W - 2400 - 2000 - 1200,
                    { shade: ri%2===0 ? CLR.bgLight : CLR.white }
                  ),
                ],
              })),
            ],
          }),

        /* ── Page break before AI analysis ──────────────────────────── */
        new Paragraph({ children: [new PageBreak()] }),

        /* ══ 5. ANALISIS PER PRODUK ══════════════════════════════════ */
        ...sectionHeading('Analisis Per Produk (AI)', '🤖'),
        ...parseMarkdown(extractSection(analysis, 'Analisis Per Produk')),

        /* ══ 6. ANALISIS PERTUMBUHAN ═════════════════════════════════ */
        ...sectionHeading('Analisis Pertumbuhan', '📈'),
        ...parseMarkdown(secGrowth),

        /* ══ 7. DIVERSIFIKASI ════════════════════════════════════════ */
        ...sectionHeading('Diversifikasi Portofolio', '⚖️'),
        ...parseMarkdown(secDiversi),

        /* ══ 8. INSIGHT STRATEGIS ════════════════════════════════════ */
        ...sectionHeading('Insight Strategis', '💡'),
        ...parseMarkdown(secInsight),

        /* ══ 9. KESIMPULAN ═══════════════════════════════════════════ */
        ...sectionHeading('Kesimpulan & Rekomendasi', '✅'),
        ...parseMarkdown(secConclusion),

        /* ══ DISCLAIMER ══════════════════════════════════════════════ */
        space(200),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [CONTENT_W],
          rows: [new TableRow({ children: [new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: noBorder(),
            shading: { fill: 'FEF9E7', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            children: [
              para([run('⚠  DISCLAIMER', { bold: true, size: 19, color: CLR.gold })]),
              para([run(
                'Laporan ini dibuat secara otomatis oleh sistem Intelligence RM Platform Bank Danamon ' +
                'menggunakan data live dari database internal dan model AI. Proyeksi yang tercantum ' +
                'bersifat estimasi berdasarkan asumsi return historis dan tidak merupakan jaminan ' +
                'imbal hasil di masa mendatang. Investasi mengandung risiko. Keputusan investasi ' +
                'sepenuhnya menjadi tanggung jawab nasabah dan RM yang bersangkutan.',
                { size: 18, color: '7D6608', italic: true }
              )]),
            ],
          })]})],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateDocx };
