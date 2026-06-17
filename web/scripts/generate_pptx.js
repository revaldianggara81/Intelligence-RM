'use strict';
/**
 * Bank Danamon Intelligence RM Platform
 * Comprehensive User Guide & Operational Manual — PowerPoint Generator
 */
const PptxGenJS = require('pptxgenjs');
const path      = require('path');
const fs        = require('fs');

const SS   = path.join(__dirname, '..', 'screenshots');   // screenshots dir
const OUT  = path.join(__dirname, '..', 'Danamon_RM_Platform_User_Guide.pptx');

// ── Brand colours (no # prefix for pptxgenjs) ─────────────────────────────
const C = {
  red:      'E31E24',   // Danamon red
  darkBg:   '0D1117',   // Dark background
  navyBg:   '0F1B2D',   // Navy blue bg
  blue:     '1565C0',   // Primary blue
  lightBlue:'1E88E5',
  teal:     '00897B',
  gold:     'F59E0B',
  green:    '16A34A',
  amber:    'F97316',
  purple:   '7C3AED',
  white:    'FFFFFF',
  offWhite: 'F1F5F9',
  lightGray:'E2E8F0',
  gray:     '64748B',
  darkText: '1E293B',
  subText:  '475569',
  cardBg:   '1A2744',
  cardBg2:  '0F1E35',
  // Light tint variants (solid equivalents for semi-transparency)
  blueLight:  'D1E4F7',   // blue ~10% on white
  blueLight2: 'B8D4F3',   // blue ~20% on white
  tealLight:  'D0EBE8',   // teal ~10% on white
  redLight:   'FCE4E4',   // red ~10% on white
  goldLight:  'FEF3C7',   // gold ~15% on white
  amberLight: 'FFF0E6',   // amber ~15% on white
  purpleLight:'EDE9FE',   // purple ~10% on white
};

// ── Helpers ────────────────────────────────────────────────────────────────
const ss = (name) => {
  const p = path.join(SS, `${name}.jpg`);
  return fs.existsSync(p) ? p : null;
};

function addBg(slide, color = C.darkBg) {
  slide.background = { color };
}

function topBar(slide, title, subtitle = '', opts = {}) {
  const barH    = opts.barH    || 1.05;
  const barColor= opts.barColor|| C.red;
  const textColor= opts.textColor || C.white;

  slide.addShape('rect', {
    x: 0, y: 0, w: 13.33, h: barH,
    fill: { color: barColor }, line: { color: barColor },
  });
  slide.addText(title, {
    x: 0.35, y: 0.1, w: 10, h: barH - 0.2,
    fontSize: 20, bold: true, color: textColor,
    fontFace: 'Calibri', valign: 'middle',
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.35, y: barH + 0.05, w: 12.6, h: 0.4,
      fontSize: 11, color: C.gray, italic: true, fontFace: 'Calibri',
    });
  }
  // Danamon badge top-right
  slide.addShape('rect', {
    x: 11.5, y: 0.1, w: 1.65, h: 0.85,
    fill: { color: C.navyBg }, line: { color: C.red, pt: 1 },
  });
  slide.addText('DANAMON\nRM PLATFORM', {
    x: 11.52, y: 0.12, w: 1.6, h: 0.8,
    fontSize: 7, bold: true, color: C.red, align: 'center',
    fontFace: 'Calibri', valign: 'middle',
  });
}

function bullet(text, indent = 0) {
  return {
    text,
    options: {
      bullet:   indent === 0 ? { type: 'bullet', code: '25CF' } : { type: 'bullet', code: '25AA', indent: 10 },
      indentLevel: indent,
      fontSize: indent === 0 ? 13 : 11.5,
      color:    indent === 0 ? C.darkText : C.subText,
      paraSpaceAfter: indent === 0 ? 6 : 3,
      fontFace: 'Calibri',
    },
  };
}

function boldLabel(label, rest, fontSize = 13) {
  return [
    { text: label, options: { bold: true, fontSize, color: C.darkBg, fontFace: 'Calibri' } },
    { text: rest,  options: { bold: false, fontSize, color: C.subText, fontFace: 'Calibri' } },
  ];
}

function kpiBox(slide, x, y, w, h, label, value, sub, accentColor) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: accentColor, pt: 2 }, shadow: { type: 'outer', blur: 4, offset: 2, color: 'AAAAAA', opacity: 0.2 } });
  slide.addShape('rect', { x, y, w, h: 0.08, fill: { color: accentColor }, line: { color: accentColor } });
  slide.addText(value, { x: x+0.08, y: y+0.12, w: w-0.16, h: h*0.45,
    fontSize: 22, bold: true, color: accentColor, align: 'center', fontFace: 'Calibri', valign: 'middle' });
  slide.addText(label, { x: x+0.08, y: y+h*0.52, w: w-0.16, h: h*0.28,
    fontSize: 9.5, bold: true, color: C.darkText, align: 'center', fontFace: 'Calibri', valign: 'middle' });
  if (sub) slide.addText(sub, { x: x+0.08, y: y+h*0.78, w: w-0.16, h: h*0.2,
    fontSize: 8, color: C.gray, align: 'center', fontFace: 'Calibri', valign: 'middle' });
}

function sectionDivider(pptx, num, title, subtitle) {
  const slide = pptx.addSlide();
  slide.background = { color: C.navyBg };
  // Red accent bar left
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.red }, line: { color: C.red } });
  // Large section number watermark
  slide.addText(num, { x: 8, y: 0.8, w: 5, h: 5.5,
    fontSize: 180, bold: true, color: C.cardBg, fontFace: 'Calibri', align: 'right', valign: 'bottom', transparency: 60 });
  slide.addText('SECTION', { x: 0.5, y: 2.2, w: 8, h: 0.6,
    fontSize: 13, bold: true, color: C.red, fontFace: 'Calibri', charSpacing: 6 });
  slide.addText(title, { x: 0.5, y: 2.85, w: 10.5, h: 1.4,
    fontSize: 38, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
  slide.addShape('rect', { x: 0.5, y: 4.3, w: 4, h: 0.05, fill: { color: C.red }, line: { color: C.red } });
  if (subtitle) slide.addText(subtitle, { x: 0.5, y: 4.5, w: 11, h: 0.8,
    fontSize: 14, color: C.lightBlue, fontFace: 'Calibri', italic: true });
  return slide;
}

function screenshotSlide(pptx, title, subtitle, imgName, notes = []) {
  const slide = pptx.addSlide();
  addBg(slide, C.navyBg);
  topBar(slide, title, subtitle, { barColor: C.blue });

  const imgPath = ss(imgName);
  if (imgPath) {
    slide.addImage({ path: imgPath, x: 0.2, y: 1.35, w: 12.93, h: 5.78, sizing: { type: 'contain', w: 12.93, h: 5.78 } });
  } else {
    slide.addShape('rect', { x: 0.2, y: 1.35, w: 12.93, h: 5.78, fill: { color: C.cardBg }, line: { color: C.gray } });
    slide.addText('[Screenshot: ' + imgName + ']', { x: 0.2, y: 3.5, w: 12.93, h: 1, fontSize: 16, color: C.gray, align: 'center' });
  }
  // Slide footer
  if (notes.length) {
    slide.addShape('rect', { x: 0, y: 7.18, w: 13.33, h: 0.32, fill: { color: '1A2744' }, line: { color: '1A2744' } });
    slide.addText(notes.join('   ●   '), { x: 0.2, y: 7.19, w: 12.93, h: 0.28, fontSize: 8, color: C.lightBlue, fontFace: 'Calibri' });
  }
  return slide;
}

function splitScreenshotSlide(pptx, title, subtitle, imgName, bulletItems, accentColor = C.blue) {
  const slide = pptx.addSlide();
  slide.background = { color: C.offWhite };
  topBar(slide, title, subtitle, { barColor: accentColor, textColor: C.white });

  // Screenshot on left 60%
  const imgPath = ss(imgName);
  if (imgPath) {
    slide.addShape('rect', { x: 0.2, y: 1.2, w: 7.6, h: 5.9, fill: { color: C.darkBg }, line: { color: C.gray, pt: 0.5 } });
    slide.addImage({ path: imgPath, x: 0.22, y: 1.22, w: 7.56, h: 5.86, sizing: { type: 'contain', w: 7.56, h: 5.86 } });
  } else {
    slide.addShape('rect', { x: 0.2, y: 1.2, w: 7.6, h: 5.9, fill: { color: C.cardBg }, line: { color: C.gray } });
    slide.addText('[' + imgName + ']', { x: 0.2, y: 4, w: 7.6, h: 1, fontSize: 13, color: C.gray, align: 'center' });
  }

  // Content panel on right 40%
  slide.addShape('rect', { x: 8.05, y: 1.2, w: 5.1, h: 5.9, fill: { color: C.white }, line: { color: C.lightGray, pt: 0.5 } });
  slide.addShape('rect', { x: 8.05, y: 1.2, w: 5.1, h: 0.08, fill: { color: accentColor }, line: { color: accentColor } });

  slide.addText(bulletItems, { x: 8.15, y: 1.35, w: 4.85, h: 5.6, valign: 'top', fontFace: 'Calibri' });
  return slide;
}

function contentSlide(pptx, title, subtitle, items, opts = {}) {
  const slide   = pptx.addSlide();
  const bgColor = opts.bgColor || C.offWhite;
  const barColor= opts.accentColor || C.blue;
  slide.background = { color: bgColor };
  topBar(slide, title, subtitle, { barColor, textColor: C.white });

  let textItems;
  if (typeof items[0] === 'string') {
    textItems = items.map(t => bullet(t));
  } else {
    textItems = items;
  }
  slide.addText(textItems, {
    x: 0.35, y: opts.y || 1.3, w: opts.w || 12.63, h: opts.h || 5.9,
    valign: 'top', fontFace: 'Calibri',
  });
  return slide;
}

function twoColContent(pptx, title, subtitle, leftItems, rightItems, opts = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: opts.bgColor || C.offWhite };
  topBar(slide, title, subtitle, { barColor: opts.barColor || C.blue, textColor: C.white });

  const leftBullets = typeof leftItems[0] === 'string' ? leftItems.map(t => bullet(t)) : leftItems;
  const rightBullets= typeof rightItems[0] === 'string' ? rightItems.map(t => bullet(t)): rightItems;

  // Left column
  slide.addShape('rect', { x: 0.3, y: 1.25, w: 6.2, h: 5.95, fill: { color: C.white }, line: { color: C.lightGray, pt: 0.5 } });
  slide.addShape('rect', { x: 0.3, y: 1.25, w: 6.2, h: 0.08, fill: { color: opts.leftColor || C.blue }, line: { color: opts.leftColor || C.blue } });
  if (opts.leftTitle) slide.addText(opts.leftTitle, { x: 0.4, y: 1.3, w: 5.9, h: 0.45, fontSize: 12, bold: true, color: opts.leftColor || C.blue, fontFace: 'Calibri', valign: 'middle' });
  slide.addText(leftBullets, { x: 0.4, y: opts.leftTitle ? 1.8 : 1.4, w: 5.9, h: opts.leftTitle ? 5.3 : 5.7, valign: 'top', fontFace: 'Calibri' });

  // Right column
  slide.addShape('rect', { x: 6.83, y: 1.25, w: 6.2, h: 5.95, fill: { color: C.white }, line: { color: C.lightGray, pt: 0.5 } });
  slide.addShape('rect', { x: 6.83, y: 1.25, w: 6.2, h: 0.08, fill: { color: opts.rightColor || C.teal }, line: { color: opts.rightColor || C.teal } });
  if (opts.rightTitle) slide.addText(opts.rightTitle, { x: 6.93, y: 1.3, w: 5.9, h: 0.45, fontSize: 12, bold: true, color: opts.rightColor || C.teal, fontFace: 'Calibri', valign: 'middle' });
  slide.addText(rightBullets, { x: 6.93, y: opts.rightTitle ? 1.8 : 1.4, w: 5.9, h: opts.rightTitle ? 5.3 : 5.7, valign: 'top', fontFace: 'Calibri' });

  return slide;
}

// ══════════════════════════════════════════════════════════════════════════
//  BUILD PRESENTATION
// ══════════════════════════════════════════════════════════════════════════
async function buildPPTX() {
  const pptx = new PptxGenJS();
  pptx.layout  = 'LAYOUT_WIDE';  // 13.33" × 7.5"
  pptx.author  = 'Bank Danamon — RM Intelligence Platform';
  pptx.subject = 'RM User Guide & Operational Manual';
  pptx.title   = 'Danamon RM Platform — User Guide';

  // ────────────────────────────────────────────────────────────────────────
  // SLIDE 1: COVER
  // ────────────────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: C.darkBg };

    // Left red accent strip
    s.addShape('rect', { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: C.red }, line: { color: C.red } });

    // Background gradient-style blocks
    s.addShape('rect', { x: 0.22, y: 0, w: 13.11, h: 7.5, fill: { color: C.navyBg }, line: { color: C.navyBg } });
    s.addShape('rect', { x: 8.5, y: 0, w: 4.83, h: 7.5, fill: { color: C.cardBg2 }, line: { color: C.cardBg2 } });

    // Decorative grid dots (right panel)
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
      s.addShape('ellipse', { x: 8.8 + c*0.65, y: 0.6 + r*0.65, w: 0.06, h: 0.06, fill: { color: '1E3A5F' }, line: { color: '1E3A5F' } });
    }

    // Bank logo area
    s.addShape('rect', { x: 0.5, y: 0.35, w: 2.4, h: 0.75, fill: { color: C.red }, line: { color: C.red } });
    s.addText('DANAMON', { x: 0.52, y: 0.38, w: 2.35, h: 0.68, fontSize: 22, bold: true, color: C.white, fontFace: 'Arial', align: 'center', valign: 'middle' });

    // Main title
    s.addText('Intelligence RM Platform', { x: 0.5, y: 1.45, w: 8, h: 0.75, fontSize: 13, bold: true, color: C.red, fontFace: 'Calibri', charSpacing: 4 });
    s.addText('User Guide &\nOperational Manual', { x: 0.5, y: 2.1, w: 8.5, h: 2.2, fontSize: 46, bold: true, color: C.white, fontFace: 'Calibri', valign: 'top' });

    s.addShape('rect', { x: 0.5, y: 4.35, w: 5.5, h: 0.07, fill: { color: C.red }, line: { color: C.red } });

    s.addText('Comprehensive guide for Relationship Managers and RM Managers\ncovering daily operations, AI-powered insights, and best practices.', {
      x: 0.5, y: 4.55, w: 8.3, h: 0.95, fontSize: 13, color: 'A0B4CC', fontFace: 'Calibri', lineSpacingMultiple: 1.3,
    });

    // Info boxes bottom left
    const infoItems = [
      { label: 'TARGET', val: 'Relationship Managers & RM Managers' },
      { label: 'VERSION', val: '2.0 — June 2026' },
      { label: 'PLATFORM', val: 'Oracle ADB 26ai + PAF AI Studio' },
    ];
    infoItems.forEach((item, i) => {
      s.addShape('rect', { x: 0.5, y: 5.72 + i*0.42, w: 1.45, h: 0.36, fill: { color: C.red }, line: { color: C.red } });
      s.addText(item.label, { x: 0.52, y: 5.73 + i*0.42, w: 1.4, h: 0.34, fontSize: 8, bold: true, color: C.white, fontFace: 'Calibri', align: 'center', valign: 'middle' });
      s.addText(item.val,  { x: 2.02, y: 5.73 + i*0.42, w: 6.8, h: 0.34, fontSize: 9, color: 'A0B4CC', fontFace: 'Calibri', valign: 'middle' });
    });

    // Right panel content - module list
    s.addText('MODULES COVERED', { x: 8.7, y: 1.6, w: 4.4, h: 0.45, fontSize: 9, bold: true, color: C.red, fontFace: 'Calibri', charSpacing: 3 });
    const modules = [
      '🏠  RM Dashboard', '👥  Customer 360', '📅  Calendar & Scheduling',
      '📅  Maturity Reminder', '💡  Product Recommendations', '🎯  Campaign Management',
      '⚡  Portfolio Alerts', '🤖  AI Copilot', '📊  Executive Dashboard',
      '📉  Performance Monitor', '🛡️  Compliance', '⚙️  Admin Console',
    ];
    modules.forEach((m, i) => {
      s.addShape('rect', { x: 8.65, y: 2.08 + i*0.395, w: 4.45, h: 0.37,
        fill: { color: i % 2 === 0 ? '122038' : C.cardBg2 }, line: { color: '1A3050' } });
      s.addText(m, { x: 8.75, y: 2.1 + i*0.395, w: 4.25, h: 0.32, fontSize: 10.5, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 1: INTRODUCTION
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '01', 'Executive Overview', 'Purpose, objectives and business benefits of the RM Intelligence Platform');

  // SLIDE: Purpose & Objectives
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'Executive Overview — Purpose & Objectives', 'What the platform does and why it matters', { barColor: C.red });

    // Left: Purpose
    s.addShape('rect', { x: 0.3, y: 1.25, w: 6.1, h: 5.95, fill: { color: C.white }, line: { color: C.lightGray, pt: 0.5 } });
    s.addShape('rect', { x: 0.3, y: 1.25, w: 6.1, h: 0.5, fill: { color: C.red }, line: { color: C.red } });
    s.addText('🎯  PURPOSE OF THE PLATFORM', { x: 0.4, y: 1.27, w: 5.8, h: 0.45, fontSize: 11, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    s.addText([
      bullet('AI-powered Relationship Management platform for Bank Danamon RMs and their managers'),
      bullet('Consolidates customer data, portfolio analytics, and AI recommendations into one workspace'),
      bullet('Replaces manual tracking with automated, real-time intelligence for every customer'),
      bullet('Powered by Oracle ADB 26ai, OCI Generative AI, and PAF AI Studio multi-agent framework'),
      { text: ' ', options: { fontSize: 6 } },
      bullet('CORE CAPABILITIES:', 0),
      bullet('Real-time AUM monitoring and growth tracking', 1),
      bullet('AI-generated intervention strategies for at-risk customers', 1),
      bullet('Automated portfolio alert detection with PAF agents', 1),
      bullet('Campaign eligibility scanning with AI scoring', 1),
      bullet('Predictive churn risk and opportunity identification', 1),
      bullet('Executive intelligence dashboard for branch oversight', 1),
    ], { x: 0.42, y: 1.82, w: 5.8, h: 5.25, valign: 'top', fontFace: 'Calibri' });

    // Right: Business Objectives
    s.addShape('rect', { x: 6.75, y: 1.25, w: 6.28, h: 5.95, fill: { color: C.white }, line: { color: C.lightGray, pt: 0.5 } });
    s.addShape('rect', { x: 6.75, y: 1.25, w: 6.28, h: 0.5, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText('📈  BUSINESS OBJECTIVES', { x: 6.85, y: 1.27, w: 5.9, h: 0.45, fontSize: 11, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });

    const objectives = [
      { icon: '💰', title: 'AUM Growth', desc: 'Identify upsell, cross-sell and rebalancing opportunities to grow total portfolio value' },
      { icon: '🔒', title: 'Retention', desc: 'Detect at-risk customers before they churn and execute proactive intervention' },
      { icon: '🎯', title: 'Campaign ROI', desc: 'Increase campaign conversion rates by targeting the right customers at the right time' },
      { icon: '⚡', title: 'Alert Response', desc: 'Reduce time-to-action on portfolio risk alerts from days to minutes' },
      { icon: '📊', title: 'RM Productivity', desc: 'Enable RMs to manage more customers effectively using AI-prioritized action lists' },
      { icon: '🏆', title: 'Branch Performance', desc: 'Provide branch managers full visibility into portfolio health and team productivity' },
    ];
    objectives.forEach((obj, i) => {
      const y = 1.9 + i * 0.83;
      s.addShape('rect', { x: 6.85, y, w: 0.5, h: 0.5, fill: { color: C.blue }, line: { color: C.blue } });
      s.addText(obj.icon, { x: 6.85, y, w: 0.5, h: 0.5, fontSize: 14, align: 'center', valign: 'middle' });
      s.addText(obj.title, { x: 7.42, y: y + 0.02, w: 5.4, h: 0.25, fontSize: 11, bold: true, color: C.darkText, fontFace: 'Calibri' });
      s.addText(obj.desc,  { x: 7.42, y: y + 0.26, w: 5.4, h: 0.5,  fontSize: 9.5, color: C.subText, fontFace: 'Calibri', lineSpacingMultiple: 1.15 });
    });
  }

  // SLIDE: Benefits Overview
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'Who Benefits & How', 'Three perspectives: RM, RM Manager, and Branch Management', { barColor: C.red });

    const roles = [
      {
        title: '👤 Relationship Manager', color: C.blue, lightColor: C.blueLight, x: 0.3,
        benefits: [
          'AI-prioritized daily action list saves 2+ hours planning time',
          'Automated deposit maturity alerts — never miss a renewal',
          'Product recommendation engine surfaces the right product for each customer',
          'Portfolio alert analysis generates client communication scripts instantly',
          'One-click access to all customer interactions, holdings, and history',
        ],
        kpis: 'Target: Engage 80%+ of customers monthly',
      },
      {
        title: '👥 RM Manager', color: C.teal, lightColor: C.tealLight, x: 4.62,
        benefits: [
          'Real-time RM productivity leaderboard and engagement tracking',
          'Alert resolution velocity monitoring per RM',
          'Campaign pipeline visibility across the entire team',
          'AUM growth trend per RM vs branch target',
          'One-click coaching trigger from performance dashboard',
        ],
        kpis: 'Target: 100% alert resolution within 48 hours',
      },
      {
        title: '🏦 Branch Management', color: C.red, lightColor: C.redLight, x: 8.94,
        benefits: [
          'Executive dashboard with branch-wide KPIs in real-time',
          'Segment distribution and tier upgrade opportunity tracking',
          'Compliance KYC status monitoring and audit trail',
          'Campaign ROI and conversion rate reporting',
          'Churn risk heat map and intervention status',
        ],
        kpis: 'Target: AUM growth ≥ 15% YoY',
      },
    ];

    roles.forEach(role => {
      s.addShape('rect', { x: role.x, y: 1.2, w: 4.15, h: 6.05, fill: { color: C.white }, line: { color: C.lightGray, pt: 0.5 } });
      s.addShape('rect', { x: role.x, y: 1.2, w: 4.15, h: 0.62, fill: { color: role.color }, line: { color: role.color } });
      s.addText(role.title, { x: role.x + 0.1, y: 1.22, w: 3.9, h: 0.58, fontSize: 12.5, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
      role.benefits.forEach((b, i) => {
        s.addShape('ellipse', { x: role.x + 0.15, y: 1.98 + i * 0.82, w: 0.22, h: 0.22, fill: { color: role.color }, line: { color: role.color } });
        s.addText(b, { x: role.x + 0.45, y: 1.96 + i * 0.82, w: 3.6, h: 0.4, fontSize: 9.5, color: C.darkText, fontFace: 'Calibri', lineSpacingMultiple: 1.15, valign: 'middle' });
      });
      s.addShape('rect', { x: role.x + 0.1, y: 6.28, w: 3.95, h: 0.68, fill: { color: role.lightColor }, line: { color: role.color, pt: 0.8 } });
      s.addText('📊 ' + role.kpis, { x: role.x + 0.15, y: 6.3, w: 3.85, h: 0.62, fontSize: 9, bold: true, color: role.color, fontFace: 'Calibri', valign: 'middle' });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 2: RM DASHBOARD
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '02', 'RM Dashboard', 'Your intelligence command center — everything you need at a glance');

  screenshotSlide(pptx, 'RM Dashboard — Full View', 'The starting point for every RM workday', '01_rm_dashboard',
    ['Personalized greeting with date stamp', 'Live KPI cards: Customers, AUM, Alerts, Maturities', 'AI-generated Today\'s Priority Actions', 'Quick Launch shortcuts to all AI Scenarios']);

  // KPI Cards explanation
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'RM Dashboard — KPI Cards Explained', 'Understanding every number on your dashboard', { barColor: C.blue });

    // 4 KPI boxes
    kpiBox(s, 0.3,  1.25, 2.9, 2.55, 'Active Customers',    '7',       'Across all tiers',  C.blue);
    kpiBox(s, 3.45, 1.25, 2.9, 2.55, 'Total AUM',           'Rp 18.1M','Portfolio value',   C.red);
    kpiBox(s, 6.6,  1.25, 2.9, 2.55, 'Active Alerts',       '36',      '8 High • 28 Medium', C.amber);
    kpiBox(s, 9.75, 1.25, 2.9, 2.55, 'Maturing in 60d',    '3',       'Deposits expiring',  C.teal);

    // Interpretation table
    s.addShape('rect', { x: 0.3, y: 4.0, w: 12.73, h: 0.45, fill: { color: C.blue }, line: { color: C.blue } });
    ['KPI Card', 'Business Meaning', 'Action Required When...', 'Risk Level'].forEach((h, i) => {
      s.addText(h, { x: 0.4 + i * 3.18, y: 4.02, w: 3.0, h: 0.4, fontSize: 10, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    });
    const rows = [
      ['Active Customers', 'Total customers assigned to your portfolio', 'Count drops (customer transferred/lost)', 'Low'],
      ['Total AUM', 'Combined market value of all customer portfolios', 'AUM declines month-over-month ≥ 5%', 'High'],
      ['Active Alerts', 'Open portfolio risk signals requiring attention', 'High-severity alerts exceed 5 unresolved', 'Critical'],
      ['Maturing in 60d', 'Deposits reaching maturity in next 60 days', 'Any deposit approaching maturity', 'Medium'],
    ];
    const rowColors = [C.white, C.offWhite, C.white, C.offWhite];
    rows.forEach((row, i) => {
      s.addShape('rect', { x: 0.3, y: 4.48 + i * 0.68, w: 12.73, h: 0.65, fill: { color: rowColors[i] }, line: { color: C.lightGray } });
      row.forEach((cell, j) => {
        const color = j === 3 ? (cell === 'Critical' ? C.red : cell === 'High' ? C.amber : cell === 'Medium' ? C.gold : C.green) : C.darkText;
        s.addText(cell, { x: 0.4 + j * 3.18, y: 4.5 + i * 0.68, w: 3.0, h: 0.6, fontSize: 9.5, color, fontFace: 'Calibri', valign: 'middle', bold: j === 3 });
      });
    });
  }

  // RM Action Priorities
  splitScreenshotSlide(pptx, "RM Action Priorities", "AI-generated list of the most important customer tasks for today", '01_rm_dashboard',
    [
      bullet("WHAT IT IS"),
      bullet("AI-generated ranked list of customers needing attention today", 1),
      bullet("Powered by real-time alert data + maturity calendar + AI scoring", 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet("HOW TO READ IT"),
      bullet("🔴 URGENT — Contact within 2 hours", 1),
      bullet("🟡 TODAY — Contact before end of day", 1),
      bullet("⚪ REGULAR — Contact this week", 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet("RECOMMENDED ACTIONS"),
      bullet("Start each day by reviewing this list before any calls", 1),
      bullet("Resolve URGENT items in the morning session", 1),
      bullet("Log all contacts in the Calendar for tracking", 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet("💡 TIP: The AI re-scores priorities every time you open the dashboard — always fresh"),
    ], C.amber);

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 3: CUSTOMER 360
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '03', 'Customer 360', 'Complete customer intelligence — profile, portfolio, history and AI insights in one view');

  screenshotSlide(pptx, 'Customer 360 — Customer List', 'All your customers with tier badges and quick filters', '02_customer360',
    ['Search by name or ID', 'Filter by tier: All / Prioritas / Privilege / Regular', 'Color-coded initials for quick recognition', 'Click any customer to open their full 360 profile']);

  screenshotSlide(pptx, 'Customer 360 — Full Profile View', 'Complete customer intelligence dashboard', '02b_customer360_profile',
    ['Portfolio summary: Total AUM, product mix, return performance', 'Health score and churn risk indicator', 'Active alerts and recommended next actions', 'Meeting history, notes, and AI-generated insights']);

  // Customer Segmentation
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'Customer Segmentation Strategy', 'Understanding the four customer tiers and their engagement requirements', { barColor: C.purple });

    const segs = [
      { tier: 'PRIORITAS', color: C.red, lightColor: C.redLight, aum: '≥ Rp 500M', icon: '👑',
        desc: 'Highest value segment. Dedicated RM attention required. Priority access to all products and promotions.',
        contact: 'Weekly — min. 1 personal call', escalate: 'Any alert = immediate action' },
      { tier: 'PRIVILEGE', color: C.gold, lightColor: C.goldLight, aum: 'Rp 250M–500M', icon: '⭐',
        desc: 'Premium segment approaching Prioritas. Focus on AUM growth and product deepening.',
        contact: 'Bi-weekly personal engagement', escalate: 'High severity alert within 24h' },
      { tier: 'REGULAR', color: C.blue, lightColor: C.blueLight, aum: 'Rp 50M–250M', icon: '✅',
        desc: 'Mass affluent segment. Relationship deepening focus. Monitor for upgrade opportunity.',
        contact: 'Monthly check-in minimum', escalate: 'Critical alerts only' },
      { tier: 'UPGRADE READY', color: C.teal, lightColor: C.tealLight, aum: 'AUM growing', icon: '🚀',
        desc: 'Regular customers approaching Privilege tier. Proactive upgrade conversation needed.',
        contact: 'Immediate outreach triggered', escalate: 'RM Manager notified' },
    ];

    segs.forEach((seg, i) => {
      const x = 0.28 + i * 3.27;
      s.addShape('rect', { x, y: 1.25, w: 3.05, h: 6.0, fill: { color: C.white }, line: { color: C.lightGray } });
      s.addShape('rect', { x, y: 1.25, w: 3.05, h: 0.85, fill: { color: seg.color }, line: { color: seg.color } });
      s.addText(seg.icon, { x, y: 1.28, w: 0.7, h: 0.78, fontSize: 22, align: 'center', valign: 'middle' });
      s.addText(seg.tier, { x: x + 0.72, y: 1.3, w: 2.25, h: 0.42, fontSize: 13, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
      s.addText('AUM: ' + seg.aum, { x: x + 0.72, y: 1.73, w: 2.25, h: 0.34, fontSize: 9, color: C.white, fontFace: 'Calibri', valign: 'middle' });

      s.addText(seg.desc, { x: x+0.1, y: 2.18, w: 2.85, h: 1.35, fontSize: 9.5, color: C.darkText, fontFace: 'Calibri', lineSpacingMultiple: 1.2, valign: 'top' });

      s.addShape('rect', { x: x+0.1, y: 3.65, w: 2.85, h: 0.4, fill: { color: seg.lightColor }, line: { color: seg.color } });
      s.addText('📞 Contact Frequency', { x: x+0.12, y: 3.67, w: 2.8, h: 0.36, fontSize: 9, bold: true, color: seg.color, fontFace: 'Calibri', valign: 'middle' });
      s.addText(seg.contact, { x: x+0.1, y: 4.1, w: 2.85, h: 0.55, fontSize: 9, color: C.darkText, fontFace: 'Calibri' });

      s.addShape('rect', { x: x+0.1, y: 4.72, w: 2.85, h: 0.4, fill: { color: seg.lightColor }, line: { color: seg.color } });
      s.addText('⚠️ Escalation Trigger', { x: x+0.12, y: 4.74, w: 2.8, h: 0.36, fontSize: 9, bold: true, color: seg.color, fontFace: 'Calibri', valign: 'middle' });
      s.addText(seg.escalate, { x: x+0.1, y: 5.18, w: 2.85, h: 0.55, fontSize: 9, color: C.darkText, fontFace: 'Calibri' });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 4: AI SCENARIOS
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '04', 'AI Scenarios & Tools', 'Four AI-powered modules that drive proactive customer engagement');

  // Maturity Reminder
  splitScreenshotSlide(pptx, 'Maturity Reminder — Deposit Expiry Tracker', 'Never miss a deposit maturity — AI identifies renewal opportunities', '04_maturity',
    [
      bullet('PURPOSE'),
      bullet('Automatically detects deposits expiring in the next 60 days', 1),
      bullet('Prioritizes by days remaining and customer tier', 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet('HOW TO USE'),
      bullet('Review list every morning — sort by Days Left', 1),
      bullet('Click customer name to see full deposit details', 1),
      bullet('Use AI analysis to generate renewal pitch', 1),
      bullet('Schedule follow-up call directly from this screen', 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet('BUSINESS IMPACT'),
      bullet('Deposit renewal = AUM retention at no acquisition cost', 1),
      bullet('Average renewal saves Rp 15-50M in AUM per customer', 1),
      bullet('High priority: deposits > Rp 100M require personal visit', 1),
    ], C.teal);

  // Product Reco
  splitScreenshotSlide(pptx, 'Product Recommendations — AI-Powered Matching', 'AI matches the right product to the right customer automatically', '05_product_reco',
    [
      bullet('HOW AI RECOMMENDS'),
      bullet('Analyzes customer risk profile, age, AUM, and income', 1),
      bullet('Matches against product catalog suitability rules', 1),
      bullet('Scores fit from 0-100 — only shows high-fit products', 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet('READING THE RECOMMENDATION'),
      bullet('Match score: 85+ = strong fit, 70-84 = good fit', 1),
      bullet('Potential AUM uplift shown in Rupiah', 1),
      bullet('AI generates pre-written sales pitch for each product', 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet('RM ACTION STEPS'),
      bullet('Review top-3 recommendations for each customer', 1),
      bullet('Call customer with the AI-generated conversation script', 1),
      bullet('Log outcome in Calendar after every conversation', 1),
      bullet('Target: present 1 product per customer per month', 1),
    ], C.purple);

  // Campaign Management
  screenshotSlide(pptx, 'Campaign Management — Eligible Customer Pipeline', 'Run targeted campaigns with AI-identified eligible customers', '06_campaigns',
    ['Active campaigns with start/end dates', 'Eligible customer count per campaign (AI-scanned)', 'Campaign type: Upgrade / Investment / Deposit / Privilege', 'Click campaign to see individual eligible customers']);

  // Campaign detail slide
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'Campaign Management — How to Execute', 'Step-by-step campaign execution workflow', { barColor: C.teal });

    const steps = [
      { n: '01', title: 'Review Active Campaigns', desc: 'Open Campaign Mgmt daily. Check for newly eligible customers added by the AI scanner overnight.', color: C.blue },
      { n: '02', title: 'Identify Target Customers', desc: 'Click each campaign to see the eligible list. Sort by potential AUM uplift or customer tier.', color: C.teal },
      { n: '03', title: 'Prepare Your Pitch', desc: 'Use the AI Copilot to generate a personalized pitch for each customer based on their profile.', color: C.purple },
      { n: '04', title: 'Contact & Present', desc: 'Call or visit the customer. Use the prepared script. Log the contact in Calendar immediately.', color: C.amber },
      { n: '05', title: 'Track Conversion', desc: 'Mark eligible customers as Contacted / Converted / Not Interested in the campaign tracker.', color: C.green },
      { n: '06', title: 'Report to Manager', desc: 'Weekly campaign conversion rates are auto-reported to your RM Manager dashboard.', color: C.red },
    ];

    steps.forEach((step, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = 0.3 + col * 4.35;
      const y = 1.25 + row * 3.12;
      s.addShape('rect', { x, y, w: 4.1, h: 2.92, fill: { color: C.white }, line: { color: C.lightGray } });
      s.addShape('rect', { x, y, w: 4.1, h: 0.65, fill: { color: step.color }, line: { color: step.color } });
      s.addText(step.n, { x, y, w: 0.65, h: 0.65, fontSize: 20, bold: true, color: C.white, fontFace: 'Calibri', align: 'center', valign: 'middle' });
      s.addText(step.title, { x: x + 0.67, y, w: 3.35, h: 0.65, fontSize: 11, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
      s.addText(step.desc, { x: x + 0.12, y: y + 0.72, w: 3.85, h: 2.1, fontSize: 10.5, color: C.darkText, fontFace: 'Calibri', lineSpacingMultiple: 1.25, valign: 'top' });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 5: PORTFOLIO ALERTS
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '05', 'Portfolio Alert System', 'Real-time risk detection with AI-powered intervention strategies');

  screenshotSlide(pptx, 'Portfolio Alerts — Alert List & Analysis', 'Active alerts ranked by severity with one-click AI analysis', '07_alerts',
    ['Left panel: Ranked alert list (High > Medium > Low)', 'Center: Customer profile and alert details', 'Right: PAF AI Studio multi-agent analysis with intervention strategy', 'Action bar: Schedule Discussion / Rebalancing / Follow-up Task']);

  screenshotSlide(pptx, 'Portfolio Alerts — AI Intervention Strategy', 'PAF AI generates complete intervention plan using Oracle DB MCP tools', '07b_alerts_detail',
    ['Stage timeline: Market Monitor → Alert Trigger → Portfolio Analysis → AI Synthesis', 'Root cause explanation with specific metric values', 'Immediate actions (0–48 hours) with concrete steps', 'RM communication script — ready to read to the customer']);

  // Alert Types Guide
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'Alert Types — Meaning & Required Actions', 'What each alert means and exactly what the RM must do', { barColor: C.red });

    const alerts = [
      { type: 'Portfolio Loss', icon: '📉', sev: 'HIGH', color: C.red,
        meaning: 'Customer portfolio return < -7% (actual loss)', action: 'Call within 2 hours. Present rebalancing options. Use AI-generated communication script.' },
      { type: 'Deposit Maturity', icon: '⏰', sev: 'HIGH', color: C.amber,
        meaning: 'Deposit expires in < 14 days with no renewal discussed', action: 'Call immediately to discuss renewal or reinvestment alternatives.' },
      { type: 'Underperform vs Benchmark', icon: '📊', sev: 'MEDIUM', color: C.gold,
        meaning: 'Product return trails benchmark by > 2% over 3 months', action: 'Schedule review call. Prepare switch recommendation using Product Reco module.' },
      { type: 'Idle Money', icon: '💤', sev: 'MEDIUM', color: C.blue,
        meaning: '> 40% of AUM sitting in savings — not invested', action: 'Identify suitable investment products. Present AUM growth opportunity to customer.' },
      { type: 'Concentration Risk', icon: '⚠️', sev: 'MEDIUM', color: C.purple,
        meaning: 'Single asset class > 50% of portfolio — overexposed', action: 'Recommend diversification. Prepare rebalancing proposal.' },
      { type: 'Upgrade Opportunity', icon: '🚀', sev: 'LOW', color: C.teal,
        meaning: 'Customer AUM ≥ Rp 250M but not yet in Privilege/Prioritas tier', action: 'Present tier upgrade benefits. Involve Branch Manager for Prioritas upgrade.' },
      { type: 'Churn Risk', icon: '🔴', sev: 'CRITICAL', color: C.red,
        meaning: 'Customer engagement low + portfolio loss + no recent contact', action: 'Escalate to RM Manager. Personal visit required within 24 hours.' },
    ];

    // Table header
    s.addShape('rect', { x: 0.25, y: 1.25, w: 12.83, h: 0.42, fill: { color: C.red }, line: { color: C.red } });
    ['Alert Type', 'Severity', 'Business Meaning', 'RM Required Action'].forEach((h, i) => {
      const widths = [1.8, 0.95, 5.2, 4.68];
      const xs = [0.35, 2.2, 3.2, 8.45];
      s.addText(h, { x: xs[i], y: 1.27, w: widths[i], h: 0.38, fontSize: 10, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    });

    alerts.forEach((a, i) => {
      const y = 1.7 + i * 0.73;
      s.addShape('rect', { x: 0.25, y, w: 12.83, h: 0.7, fill: { color: i % 2 === 0 ? C.white : C.offWhite }, line: { color: C.lightGray } });
      s.addShape('rect', { x: 0.25, y: y + 0.3, w: 0.06, h: 0.08, fill: { color: a.color }, line: { color: a.color } });
      s.addText(`${a.icon} ${a.type}`, { x: 0.35, y, w: 1.8, h: 0.7, fontSize: 9.5, bold: true, color: C.darkText, fontFace: 'Calibri', valign: 'middle' });
      const sevColor = a.sev === 'CRITICAL' || a.sev === 'HIGH' ? C.red : a.sev === 'MEDIUM' ? C.amber : C.teal;
      const sevLightColor = a.sev === 'CRITICAL' || a.sev === 'HIGH' ? C.redLight : a.sev === 'MEDIUM' ? C.amberLight : C.tealLight;
      s.addShape('rect', { x: 2.2, y: y + 0.15, w: 0.9, h: 0.4, fill: { color: sevLightColor }, line: { color: sevColor } });
      s.addText(a.sev, { x: 2.2, y: y + 0.15, w: 0.9, h: 0.4, fontSize: 8, bold: true, color: sevColor, fontFace: 'Calibri', align: 'center', valign: 'middle' });
      s.addText(a.meaning, { x: 3.2, y, w: 5.2, h: 0.7, fontSize: 9.5, color: C.darkText, fontFace: 'Calibri', valign: 'middle' });
      s.addText(a.action,  { x: 8.45, y, w: 4.55, h: 0.7, fontSize: 9.5, color: C.subText, fontFace: 'Calibri', valign: 'middle', lineSpacingMultiple: 1.1 });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 6: AI COPILOT
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '06', 'AI Copilot', 'Your intelligent banking assistant — ask anything, get instant expert answers');

  splitScreenshotSlide(pptx, 'AI Copilot — Intelligent RM Assistant', 'Conversational AI powered by OCI Generative AI and customer data', '08_copilot',
    [
      bullet('WHAT IT CAN DO'),
      bullet('Answer questions about any customer in your portfolio', 1),
      bullet('Generate call scripts and email templates', 1),
      bullet('Explain market conditions affecting portfolios', 1),
      bullet('Summarize customer meeting history', 1),
      bullet('Calculate investment projections', 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet('EXAMPLE QUESTIONS TO ASK'),
      bullet('"What are the top 3 risks for Budi Karya\'s portfolio?"', 1),
      bullet('"Draft a renewal pitch for Dewi Lestari\'s deposit"', 1),
      bullet('"Which customers should I call today for campaigns?"', 1),
      bullet('"Explain the ORI024 underperformance to me"', 1),
      { text: ' ', options: { fontSize: 5 } },
      bullet('💡 TIP: Be specific — include customer names and product names for best results'),
    ], C.purple);

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 7: INTELLIGENCE DASHBOARDS
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '07', 'Intelligence Dashboards', 'Executive, Performance, and Compliance views for managers and branch leadership');

  screenshotSlide(pptx, 'Executive Dashboard — Branch Intelligence Command Center', 'Complete branch-wide portfolio intelligence for RM Managers and Branch Management', '09_executive',
    ['AUM velocity chart with 12-month trend and forecast', 'Customer Health Score distribution radar', 'RM Productivity cockpit with engagement rates', 'Risk flags panel and alert intelligence analytics']);

  screenshotSlide(pptx, 'Performance Monitor — RM Productivity Tracker', 'Track individual and team performance against targets', '10_performance',
    ['AUM growth per RM vs monthly target', 'Customer engagement rate (contacts / total customers)', 'Alert resolution velocity', 'Campaign conversion rates per RM']);

  screenshotSlide(pptx, 'Compliance Dashboard — KYC & Audit Monitoring', 'KYC status, expiry tracking, and complete audit trail', '11_compliance',
    ['KYC status matrix: Verified / Pending / Expired counts', 'Days-to-expiry for all customers requiring renewal', 'Audit log of all user actions (last 30 days)', 'Compliance score by RM and by customer segment']);

  screenshotSlide(pptx, 'Calendar — Appointment & Activity Management', 'Plan and track all customer interactions', '03_calendar',
    ['Upcoming appointments with customer names and meeting type', 'Activity log with call outcomes and follow-up notes', 'Integration with Portfolio Alerts for same-day scheduling', 'RM Manager can view team calendar for coaching']);

  screenshotSlide(pptx, 'Admin Console — Platform Configuration', 'System settings and user management for platform administrators', '12_admin',
    ['User management: RM accounts, roles, branch assignments', 'Alert threshold configuration for all alert types', 'System settings, audit logs, and platform health monitoring', 'Product catalog and campaign eligibility rules management']);

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 8: DAILY SOP
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '08', 'Daily Operating Procedures', 'Step-by-step SOP for every RM — morning, midday, and end of day');

  // Morning SOP
  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'Start of Day — Morning Routine (07:45–09:00)', 'What every RM must do before making the first customer call', { barColor: C.blue });

    const steps = [
      { time: '07:45', step: '1. Open RM Dashboard', action: 'Review KPI cards: customers, AUM, alerts. Note any overnight changes.', outcome: 'You know the big picture before talking to any customer' },
      { time: '07:55', step: '2. Review Priority Actions', action: 'Read the AI-generated "Today\'s Priority Actions" list. Identify the top 3 URGENT items.', outcome: 'Morning call list is ready' },
      { time: '08:05', step: '3. Check New Alerts', action: 'Open Portfolio Alerts. Filter by "High" severity. Run AI analysis on any new critical alert.', outcome: 'You know which customers are at risk today' },
      { time: '08:20', step: '4. Check Maturities', action: 'Open Maturity Reminder. Any deposit < 7 days to maturity moves to immediate call list.', outcome: 'No deposit matures without a renewal conversation' },
      { time: '08:30', step: '5. Review Campaign Pipeline', action: 'Open Campaign Mgmt. Check for newly eligible customers. Add to call plan if ≥ 3 new eligibles.', outcome: 'Campaign opportunities captured before the day starts' },
      { time: '08:45', step: '6. Prepare Call Scripts', action: 'For each URGENT customer, use AI Copilot to generate a personalized script.', outcome: 'Confident and prepared for every call' },
    ];

    steps.forEach((step, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = 0.25 + col * 6.55;
      const y = 1.25 + row * 1.98;
      s.addShape('rect', { x, y, w: 6.3, h: 1.88, fill: { color: C.white }, line: { color: C.lightGray } });
      s.addShape('rect', { x, y, w: 1.1, h: 1.88, fill: { color: C.blue }, line: { color: C.blue } });
      s.addText(step.time, { x, y: y+0.1, w: 1.1, h: 0.5, fontSize: 13, bold: true, color: C.white, fontFace: 'Calibri', align: 'center', valign: 'middle' });
      s.addText(step.step, { x: 1.2 + col * 6.55, y: y+0.08, w: 5.05, h: 0.48, fontSize: 10.5, bold: true, color: C.darkText, fontFace: 'Calibri', valign: 'middle' });
      s.addText('→ ' + step.action, { x: 1.2 + col * 6.55, y: y+0.58, w: 5.05, h: 0.72, fontSize: 9.5, color: C.subText, fontFace: 'Calibri', lineSpacingMultiple: 1.2, valign: 'top' });
      s.addShape('rect', { x: 1.2 + col * 6.55, y: y+1.38, w: 5.05, h: 0.42, fill: { color: C.blueLight }, line: { color: C.blue } });
      s.addText('✅ ' + step.outcome, { x: 1.22 + col * 6.55, y: y+1.4, w: 5.0, h: 0.38, fontSize: 9, color: C.blue, fontFace: 'Calibri', bold: true, valign: 'middle' });
    });
  }

  // During the day and End of day (combined)
  twoColContent(pptx,
    'During the Day & End-of-Day Review',
    'Customer engagement process and daily wrap-up activities',
    [
      { text: '☀️  DURING THE DAY (09:00–16:30)', options: { fontSize: 12, bold: true, color: C.blue, fontFace: 'Calibri', paraSpaceAfter: 8 } },
      bullet('CUSTOMER CONTACT PROTOCOL'),
      bullet('Open customer\'s 360 profile before every call', 1),
      bullet('Review last 3 interactions and current portfolio status', 1),
      bullet('Note any active alerts or upcoming maturities', 1),
      bullet('Use AI-prepared conversation script as guide', 1),
      { text: ' ', options: { fontSize: 6 } },
      bullet('AFTER EVERY CUSTOMER CONTACT'),
      bullet('Log outcome in Calendar (duration, result, next step)', 1),
      bullet('If product discussed → add to customer\'s opportunity pipeline', 1),
      bullet('If alert discussed → update alert status to "Acknowledged"', 1),
      bullet('If referral given → create follow-up task in Alert Actions', 1),
      { text: ' ', options: { fontSize: 6 } },
      bullet('OPPORTUNITY MANAGEMENT'),
      bullet('Identify upsell/cross-sell from every conversation', 1),
      bullet('Log opportunity amount and expected close date', 1),
      bullet('Update campaign conversion tracker for eligible customers', 1),
    ],
    [
      { text: '🌙  END OF DAY (16:30–17:15)', options: { fontSize: 12, bold: true, color: C.teal, fontFace: 'Calibri', paraSpaceAfter: 8 } },
      bullet('MANDATORY CLOSE-OF-DAY TASKS'),
      bullet('Review all unresolved HIGH severity alerts — any new ones?', 1),
      bullet('Check that all URGENT priority actions were addressed', 1),
      bullet('Update task list: mark completed, reschedule uncompleted', 1),
      bullet('Log any new intelligence from customer conversations', 1),
      { text: ' ', options: { fontSize: 6 } },
      bullet('TOMORROW\'S PREPARATION'),
      bullet('Review tomorrow\'s Calendar appointments', 1),
      bullet('Identify customers to proactively contact tomorrow', 1),
      bullet('Any deposits maturing in 24h → note for morning priority', 1),
      { text: ' ', options: { fontSize: 6 } },
      bullet('RM MANAGER CHECK-IN (Friday)'),
      bullet('Submit weekly summary: contacts made, conversions, open alerts', 1),
      bullet('Escalate any critical customer situations to manager', 1),
      bullet('Review performance dashboard together for coaching', 1),
    ],
    { leftTitle: '', rightTitle: '', leftColor: C.blue, rightColor: C.teal, barColor: C.amber });

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 9: PERFORMANCE KPIs
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '09', 'Performance KPIs & Metrics', 'How RM performance is measured — formulas, targets, and improvement actions');

  {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, 'RM Performance Metrics — Complete KPI Reference', 'All performance metrics with formulas, targets, and improvement actions', { barColor: C.blue });

    const kpis = [
      { kpi: 'AUM Growth Rate', formula: '(Current AUM − Previous AUM) / Previous AUM × 100', target: '≥ 2% MoM / 15% YoY', green: 'AUM growing above target', red: 'AUM declining for 2+ consecutive months' },
      { kpi: 'Customer Engagement Rate', formula: 'Customers Contacted ÷ Total Customers × 100', target: '≥ 80% per month', green: '>80% engaged', red: '<60% — coaching required' },
      { kpi: 'Alert Resolution Rate', formula: 'Alerts Resolved ÷ Alerts Generated × 100', target: '≥ 90% within 48 hours', green: 'All High alerts resolved < 24h', red: 'High alerts > 48h open' },
      { kpi: 'Campaign Conversion Rate', formula: 'Converted ÷ Eligible Customers Contacted × 100', target: '≥ 25% per campaign', green: '>30% conversion', red: '<15% — review pitch approach' },
      { kpi: 'Deposit Renewal Rate', formula: 'Deposits Renewed ÷ Deposits Matured × 100', target: '≥ 85%', green: '>90% renewal (excellent retention)', red: '<70% — systematic follow-up failure' },
      { kpi: 'NTB (New-to-Bank) Referrals', formula: 'New customers referred by existing portfolio', target: '≥ 1 per RM per month', green: '2+ referrals per month', red: '0 referrals for 2+ months' },
    ];

    s.addShape('rect', { x: 0.25, y: 1.25, w: 12.83, h: 0.42, fill: { color: C.blue }, line: { color: C.blue } });
    ['KPI', 'Formula', 'Target', 'Green Zone', 'Red Zone (Action)'].forEach((h, i) => {
      const xs = [0.3, 2.35, 5.9, 7.55, 10.0];
      const ws = [1.95, 3.45, 1.55, 2.35, 2.95];
      s.addText(h, { x: xs[i], y: 1.27, w: ws[i], h: 0.38, fontSize: 9, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    });

    kpis.forEach((k, i) => {
      const y = 1.7 + i * 0.83;
      s.addShape('rect', { x: 0.25, y, w: 12.83, h: 0.8, fill: { color: i % 2 === 0 ? C.white : C.offWhite }, line: { color: C.lightGray } });
      s.addText(k.kpi, { x: 0.3, y, w: 1.95, h: 0.8, fontSize: 9, bold: true, color: C.darkText, fontFace: 'Calibri', valign: 'middle' });
      s.addText(k.formula, { x: 2.35, y, w: 3.45, h: 0.8, fontSize: 8.5, color: C.subText, fontFace: 'Calibri', valign: 'middle', lineSpacingMultiple: 1.15 });
      s.addShape('rect', { x: 5.9, y: y+0.18, w: 1.55, h: 0.44, fill: { color: C.blueLight2 }, line: { color: C.blue } });
      s.addText(k.target, { x: 5.9, y: y+0.18, w: 1.55, h: 0.44, fontSize: 8, bold: true, color: C.blue, fontFace: 'Calibri', align: 'center', valign: 'middle' });
      s.addText('✅ ' + k.green, { x: 7.55, y, w: 2.35, h: 0.8, fontSize: 8.5, color: C.green, fontFace: 'Calibri', valign: 'middle' });
      s.addText('🔴 ' + k.red,  { x: 10.0, y, w: 2.95, h: 0.8, fontSize: 8.5, color: C.red, fontFace: 'Calibri', valign: 'middle', lineSpacingMultiple: 1.1 });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 10: BEST PRACTICES
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '10', 'Best Practices & Habits', 'Practical recommendations for top-performing Relationship Managers');

  twoColContent(pptx,
    'Best Practices — Daily & Weekly Habits',
    'Habits that separate top-performing RMs from average performers',
    [
      { text: '📅  DAILY HABITS', options: { fontSize: 11, bold: true, color: C.blue, fontFace: 'Calibri', paraSpaceAfter: 6 } },
      bullet('Open RM Dashboard before first customer call — no exceptions'),
      bullet('Review alerts before meetings — know your customers\' current status'),
      bullet('Log EVERY customer contact same day — data quality = AI quality'),
      bullet('Use the AI-generated script, but personalize it with customer\'s name and specific situation'),
      bullet('End every call with a clear next action and schedule it in Calendar'),
      { text: ' ', options: { fontSize: 7 } },
      { text: '📆  WEEKLY HABITS', options: { fontSize: 11, bold: true, color: C.blue, fontFace: 'Calibri', paraSpaceAfter: 6 } },
      bullet('Review campaign pipeline on Monday — plan outreach for the week'),
      bullet('Run AI Copilot session on top 5 customers — refresh your knowledge'),
      bullet('Check compliance tab — flag any KYC approaching expiry'),
      bullet('Friday: reconcile all open tasks and carry forward unfinished items'),
      bullet('Submit weekly activity report to RM Manager before 5PM Friday'),
    ],
    [
      { text: '📊  MONTHLY REVIEW PROCESS', options: { fontSize: 11, bold: true, color: C.teal, fontFace: 'Calibri', paraSpaceAfter: 6 } },
      bullet('Review AUM movement for each customer — identify declines > 10%'),
      bullet('Assess customer tier progression — any customers ready to upgrade?'),
      bullet('Evaluate campaign performance — which campaigns converted best?'),
      bullet('Review product recommendation acceptance rate — refine your pitch'),
      bullet('Set next month\'s engagement plan based on performance data'),
      { text: ' ', options: { fontSize: 7 } },
      { text: '🏆  PORTFOLIO GROWTH STRATEGIES', options: { fontSize: 11, bold: true, color: C.teal, fontFace: 'Calibri', paraSpaceAfter: 6 } },
      bullet('Idle money = biggest untapped AUM growth opportunity — always ask "where is the unused cash?"'),
      bullet('Never let a deposit mature without a reinvestment conversation'),
      bullet('For concentrated portfolios — rebalancing is both risk management AND AUM growth'),
      bullet('Tier upgrade conversation = retention + AUM growth + relationship deepening'),
      bullet('Use market events (IHSG movement, BI rate changes) to initiate proactive outreach'),
    ],
    { leftTitle: '', rightTitle: '', leftColor: C.blue, rightColor: C.teal, barColor: C.green });

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 11: FAQ
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '11', 'Frequently Asked Questions', 'Most common questions from Relationship Managers about the platform');

  const faqGroups = [
    {
      title: 'Dashboard & Navigation',
      color: C.blue,
      faqs: [
        { q: 'How often does the dashboard data refresh?', a: 'The dashboard refreshes every time you navigate to it. Market data (IHSG, USD/IDR, BI Rate) updates every 5 minutes automatically. Alert data is live from the Oracle database.' },
        { q: 'Why does my AUM total differ from the core banking system?', a: 'The platform shows AUM as of last night\'s data sync. Real-time product valuations may differ slightly. For exact values, confirm with the core banking portal.' },
        { q: 'Can I see other RM\'s customers?', a: 'No. The system shows only customers assigned to your RM User ID. RM Managers can view consolidated data for their team, but not individual customer details of other RMs.' },
      ],
    },
    {
      title: 'Alerts & Risk',
      color: C.red,
      faqs: [
        { q: 'An alert shows HIGH severity but the customer seems fine — what do I do?', a: 'Run the AI Analysis first to understand the full context. Sometimes alerts are triggered by short-term market movements. The AI will help you assess whether intervention is truly needed and provide talking points if so.' },
        { q: 'How do I mark an alert as resolved?', a: 'Open the alert, click "Actions" bar → "Resolve Alert." The system asks for a resolution note. This removes it from your active list and records it in the audit trail.' },
        { q: 'Who gets notified when a Critical alert appears?', a: 'The assigned RM receives a notification badge. If the alert remains unresolved after 48 hours, the RM Manager is automatically alerted via the Executive Dashboard.' },
        { q: 'Can I set my own alert preferences for specific customers?', a: 'Yes. Use the Alert Subscription Settings (⚙ Langganan button on the Alerts page) to configure which alert types and severity levels you receive per customer segment.' },
      ],
    },
    {
      title: 'Campaigns & Products',
      color: C.teal,
      faqs: [
        { q: 'A customer appears in multiple campaigns — which one should I present first?', a: 'Present the campaign with the highest AUM uplift potential and strongest match score. You can discuss multiple campaigns in one call, but lead with the most relevant one for the customer\'s profile.' },
        { q: 'The product recommendation AI suggested a product the customer already has — is this a bug?', a: 'If the customer holds a similar but different product, the AI may suggest an upgrade or a different tenor. Check the specific product ID. If it\'s truly a duplicate, mark the recommendation as "Not Applicable" so the AI learns.' },
        { q: 'How long does a campaign stay active?', a: 'Campaigns run until the end date set by Marketing. Eligible customers are scanned daily — a customer who didn\'t qualify yesterday may qualify today based on AUM changes.' },
      ],
    },
    {
      title: 'AI & Data',
      color: C.purple,
      faqs: [
        { q: 'Can I trust the AI-generated communication scripts?', a: 'The scripts are based on real customer data and banking best practices. Always review and personalize before using. The AI provides a starting point — your relationship knowledge makes it complete.' },
        { q: 'What happens if the AI Copilot gives wrong information?', a: 'AI Copilot responses are based on available data in the system. If it mentions incorrect product details, the underlying product catalog data may be outdated. Report discrepancies to your Admin via the Admin Console feedback.' },
        { q: 'Why does the AI sometimes say "data not available"?', a: 'Certain fields require complete customer data to function. If a customer profile is incomplete (missing risk profile, income, or KYC data), AI capabilities are limited. Complete customer profiles enable full AI functionality.' },
      ],
    },
  ];

  faqGroups.forEach(group => {
    const s = pptx.addSlide();
    s.background = { color: C.offWhite };
    topBar(s, `FAQ — ${group.title}`, 'Frequently asked questions from Relationship Managers', { barColor: group.color });

    let yPos = 1.25;
    group.faqs.forEach((faq, i) => {
      const boxH = 1.55;
      s.addShape('rect', { x: 0.25, y: yPos, w: 12.83, h: boxH, fill: { color: C.white }, line: { color: C.lightGray } });
      s.addShape('rect', { x: 0.25, y: yPos, w: 0.08, h: boxH, fill: { color: group.color }, line: { color: group.color } });
      s.addShape('rect', { x: 0.38, y: yPos + 0.1, w: 0.62, h: 0.5, fill: { color: group.color }, line: { color: group.color } });
      s.addText('Q' + (i + 1), { x: 0.38, y: yPos + 0.1, w: 0.62, h: 0.5, fontSize: 12, bold: true, color: C.white, fontFace: 'Calibri', align: 'center', valign: 'middle' });
      s.addText(faq.q, { x: 1.1, y: yPos + 0.1, w: 11.85, h: 0.48, fontSize: 11, bold: true, color: C.darkText, fontFace: 'Calibri', valign: 'middle' });
      s.addText('→ ' + faq.a, { x: 1.1, y: yPos + 0.65, w: 11.7, h: 0.82, fontSize: 10, color: C.subText, fontFace: 'Calibri', valign: 'top', lineSpacingMultiple: 1.2 });
      yPos += boxH + 0.1;
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // SECTION 12: QUICK REFERENCE
  // ────────────────────────────────────────────────────────────────────────
  sectionDivider(pptx, '12', 'Quick Reference Guide', 'Everything an RM needs to know on one page — print and keep at your desk');

  {
    const s = pptx.addSlide();
    s.background = { color: C.navyBg };
    // Header
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.95, fill: { color: C.red }, line: { color: C.red } });
    s.addText('⚡  QUICK REFERENCE CARD — DANAMON INTELLIGENCE RM PLATFORM', { x: 0.3, y: 0.05, w: 12, h: 0.85, fontSize: 15, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle', charSpacing: 1 });
    s.addText('Print & keep at your desk', { x: 10.5, y: 0.55, w: 2.7, h: 0.35, fontSize: 9, color: 'FFE0E0', fontFace: 'Calibri', italic: true, align: 'right' });

    const qrSections = [
      {
        title: '🌅 MORNING (07:45–09:00)', color: C.blue, x: 0.18, y: 1.0, w: 3.15,
        items: ['1. RM Dashboard → Check KPIs', '2. Priority Actions → Identify URGENT', '3. Portfolio Alerts → Filter HIGH', '4. Maturity Reminder → Check < 7 days', '5. Campaign Mgmt → New eligibles', '6. AI Copilot → Prepare scripts'],
      },
      {
        title: '☀️ DURING DAY (09:00–16:30)', color: C.teal, x: 3.52, y: 1.0, w: 3.15,
        items: ['→ Open 360 profile before EVERY call', '→ Use AI-generated conversation script', '→ Log contact in Calendar immediately', '→ Update campaign conversion tracker', '→ Flag opportunities for follow-up', '→ Resolve alerts within 48 hours'],
      },
      {
        title: '🌙 END OF DAY (16:30–17:15)', color: C.purple, x: 6.86, y: 1.0, w: 3.15,
        items: ['→ Resolve all URGENT items', '→ Update unfinished task status', '→ Note new intelligence gathered', '→ Plan tomorrow\'s priority calls', '→ Friday: Submit weekly report'],
      },
      {
        title: '🚨 ALERT RESPONSE', color: C.red, x: 10.2, y: 1.0, w: 2.95,
        items: ['Critical → Manager + call < 1h', 'HIGH → Call < 2 hours', 'MEDIUM → Call < 24 hours', 'LOW → This week', '', 'Always: Run AI Analysis first'],
      },
    ];

    qrSections.forEach(sec => {
      s.addShape('rect', { x: sec.x, y: sec.y, w: sec.w, h: 3.4, fill: { color: C.cardBg }, line: { color: sec.color, pt: 1.5 } });
      s.addShape('rect', { x: sec.x, y: sec.y, w: sec.w, h: 0.5, fill: { color: sec.color }, line: { color: sec.color } });
      s.addText(sec.title, { x: sec.x + 0.08, y: sec.y, w: sec.w - 0.1, h: 0.5, fontSize: 9, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
      sec.items.forEach((item, i) => {
        if (item) s.addText(item, { x: sec.x + 0.1, y: sec.y + 0.58 + i * 0.465, w: sec.w - 0.18, h: 0.44, fontSize: 9, color: C.white, fontFace: 'Calibri', valign: 'middle' });
      });
    });

    // KPI targets bar
    s.addShape('rect', { x: 0.18, y: 4.55, w: 12.97, h: 0.38, fill: { color: C.darkBg }, line: { color: C.gold } });
    s.addText('🎯 TARGETS:', { x: 0.3, y: 4.57, w: 1.0, h: 0.32, fontSize: 9, bold: true, color: C.gold, fontFace: 'Calibri', valign: 'middle' });
    const targets = ['AUM Growth ≥ 2%/mth', 'Engagement ≥ 80%', 'Alert Resolution ≥ 90%<48h', 'Campaign Conv. ≥ 25%', 'Deposit Renewal ≥ 85%', 'NTB ≥ 1/month'];
    targets.forEach((t, i) => {
      s.addText('✓ ' + t, { x: 1.45 + i * 2.0, y: 4.57, w: 1.9, h: 0.32, fontSize: 8.5, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    });

    // Navigation guide
    const navItems = [
      { icon: '🏠', name: 'RM Dashboard', key: 'Start here daily' },
      { icon: '👥', name: 'Customer 360', key: 'Before every call' },
      { icon: '⚡', name: 'Portfolio Alerts', key: 'Check every morning' },
      { icon: '📅', name: 'Maturity Reminder', key: 'Check daily' },
      { icon: '💡', name: 'Product Reco', key: 'Cross-sell opportunities' },
      { icon: '🎯', name: 'Campaign Mgmt', key: 'Check Monday' },
      { icon: '🤖', name: 'AI Copilot', key: 'Prepare call scripts' },
      { icon: '📊', name: 'Executive', key: 'Manager view' },
    ];

    s.addShape('rect', { x: 0.18, y: 5.05, w: 12.97, h: 0.35, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText('🗺️ NAVIGATION GUIDE', { x: 0.3, y: 5.07, w: 3, h: 0.3, fontSize: 9, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });

    navItems.forEach((nav, i) => {
      const x = 0.18 + i * 1.62;
      s.addShape('rect', { x, y: 5.43, w: 1.58, h: 1.77, fill: { color: C.cardBg }, line: { color: '1A3A5C' } });
      s.addText(nav.icon, { x, y: 5.48, w: 1.58, h: 0.55, fontSize: 18, align: 'center', valign: 'middle' });
      s.addText(nav.name, { x, y: 6.05, w: 1.58, h: 0.42, fontSize: 8.5, bold: true, color: C.white, align: 'center', fontFace: 'Calibri', valign: 'middle' });
      s.addText(nav.key, { x, y: 6.5, w: 1.58, h: 0.62, fontSize: 7.5, color: C.lightBlue, align: 'center', fontFace: 'Calibri', valign: 'top', lineSpacingMultiple: 1.1 });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // CLOSING SLIDE
  // ────────────────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: C.darkBg };
    s.addShape('rect', { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: C.red }, line: { color: C.red } });
    s.addShape('rect', { x: 0.22, y: 0, w: 13.11, h: 7.5, fill: { color: C.navyBg }, line: { color: C.navyBg } });

    s.addShape('rect', { x: 0.5, y: 0.4, w: 2.4, h: 0.75, fill: { color: C.red }, line: { color: C.red } });
    s.addText('DANAMON', { x: 0.52, y: 0.42, w: 2.35, h: 0.68, fontSize: 22, bold: true, color: C.white, fontFace: 'Arial', align: 'center', valign: 'middle' });

    s.addText('Thank You', { x: 0.5, y: 1.65, w: 12, h: 1.4, fontSize: 58, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
    s.addShape('rect', { x: 0.5, y: 3.1, w: 6, h: 0.07, fill: { color: C.red }, line: { color: C.red } });

    s.addText('For support and questions about the Intelligence RM Platform:', { x: 0.5, y: 3.35, w: 11, h: 0.45, fontSize: 13, color: 'A0B4CC', fontFace: 'Calibri' });

    const contacts = [
      { icon: '📧', label: 'Technical Support', val: 'rm-platform-support@danamon.co.id' },
      { icon: '📱', label: 'RM Helpdesk', val: 'Ext. 4500 (08:00 – 17:00 WIB)' },
      { icon: '📚', label: 'Training Resources', val: 'Available in Admin Console → Help Center' },
      { icon: '🔄', label: 'Platform Updates', val: 'Version notes posted in Admin Console notifications' },
    ];

    contacts.forEach((c, i) => {
      s.addShape('rect', { x: 0.5, y: 3.95 + i * 0.72, w: 0.55, h: 0.55, fill: { color: C.red }, line: { color: C.red } });
      s.addText(c.icon, { x: 0.5, y: 3.96 + i * 0.72, w: 0.55, h: 0.52, fontSize: 14, align: 'center', valign: 'middle' });
      s.addText(c.label + ': ', { x: 1.15, y: 3.98 + i * 0.72, w: 2.1, h: 0.48, fontSize: 11, bold: true, color: C.white, fontFace: 'Calibri', valign: 'middle' });
      s.addText(c.val, { x: 3.3, y: 3.98 + i * 0.72, w: 7.5, h: 0.48, fontSize: 11, color: 'A0B4CC', fontFace: 'Calibri', valign: 'middle' });
    });

    s.addShape('rect', { x: 0.5, y: 6.9, w: 12.4, h: 0.4, fill: { color: '0A1520' }, line: { color: '0A1520' } });
    s.addText('Bank Danamon Indonesia  ●  Intelligence RM Platform v2.0  ●  Confidential — For Internal Use Only  ●  © 2026', {
      x: 0.5, y: 6.92, w: 12.4, h: 0.36, fontSize: 8.5, color: C.gray, fontFace: 'Calibri', align: 'center', valign: 'middle',
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  await pptx.writeFile({ fileName: OUT });
  console.log(`\n✅ PowerPoint saved: ${OUT}`);
  console.log(`   Slides: ${pptx.slides?.length || '~35'} slides`);
}

buildPPTX().catch(err => {
  console.error('❌ PPTX generation failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
