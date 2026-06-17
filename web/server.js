'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const db = require('./backend/config/database');
const { errorHandler } = require('./backend/middleware/errorHandler');
const audit = require('./backend/services/auditService');

// ─── Routes ──────────────────────────────────────────────────────────
const authRoutes           = require('./backend/routes/auth');
const dashboardRoutes      = require('./backend/routes/dashboard');
const customersRoutes      = require('./backend/routes/customers');
const maturityRoutes       = require('./backend/routes/maturity');
const recommendationRoutes = require('./backend/routes/recommendations');
const campaignRoutes       = require('./backend/routes/campaigns');
const alertRoutes          = require('./backend/routes/alerts');
const copilotRoutes        = require('./backend/routes/copilot');
const executiveRoutes      = require('./backend/routes/executive');
const aiHistoryRoutes      = require('./backend/routes/aiHistory');
const adminRoutes              = require('./backend/routes/admin');
const productManagementRoutes  = require('./backend/routes/productManagement');
const callTranscriptRoutes     = require('./backend/routes/callTranscripts');
const appointmentRoutes        = require('./backend/routes/appointments');
const goalRoutes               = require('./backend/routes/goals');
const schedulerRoutes          = require('./backend/routes/scheduler');
const notificationRoutes       = require('./backend/routes/notifications');
const marketRoutes             = require('./backend/routes/market');
const performanceRoutes        = require('./backend/routes/performance');
const calendarActionsRoutes    = require('./backend/routes/calendarActions');
const portfolioAnalysisRoutes  = require('./backend/routes/portfolioAnalysis');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:55354', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(audit.middleware);

// ─── API Routes ───────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/dashboard',       dashboardRoutes);
app.use('/api/customers',       customersRoutes);
app.use('/api/maturity',        maturityRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/campaigns',       campaignRoutes);
app.use('/api/alerts',          alertRoutes);
app.use('/api/copilot',         copilotRoutes);
app.use('/api/executive',       executiveRoutes);
app.use('/api/ai-history',      aiHistoryRoutes);
app.use('/api/admin',            adminRoutes);
app.use('/api/product-management', productManagementRoutes);
app.use('/api/call-transcripts',   callTranscriptRoutes);
app.use('/api/appointments',       appointmentRoutes);
app.use('/api/goals',              goalRoutes);
app.use('/api/scheduler',          schedulerRoutes);
app.use('/api/notifications',      notificationRoutes);
app.use('/api/market',             marketRoutes);
app.use('/api/performance',        performanceRoutes);
app.use('/api/calendar/actions',   calendarActionsRoutes);
app.use('/api/portfolio',          portfolioAnalysisRoutes);

// ─── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Intelligence RM Platform', timestamp: new Date().toISOString() });
});

// ─── Static SPA ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// ─── Boot ─────────────────────────────────────────────────────────────
async function start() {
  // Initialize Oracle DB pool (skip gracefully if not configured)
  const dbConfigured = !!(process.env.DB_CONNECT_STRING && process.env.DB_PASSWORD);
  if (dbConfigured) {
    try {
      await db.initialize();
      console.log('[DB] Oracle ADB pool ready');
    } catch (err) {
      console.warn('[DB] Pool init failed (UI-only mode):', err.message);
      console.warn('[DB] Set DB_CONNECT_STRING and DB_PASSWORD in .env to enable full backend.');
    }
  } else {
    console.warn('[DB] No DB_CONNECT_STRING set — running in UI-only mode (all /api calls will fail)');
  }

  app.listen(PORT, () => {
    console.log('\n  ╔══════════════════════════════════════════════════╗');
    console.log('  ║  Oracle AI · Intelligence RM Platform             ║');
    console.log('  ║  Bank Danamon POC · 2026                          ║');
    console.log('  ╠══════════════════════════════════════════════════╣');
    console.log(`  ║  App     →  http://localhost:${PORT}                   ║`);
    console.log('  ║  Health  →  /api/health                           ║');
    console.log('  ╠══════════════════════════════════════════════════╣');
    console.log('  ║  Logins  anisa / budi / dewi / manager            ║');
    console.log('  ║  All passwords: danamon2026                       ║');
    console.log('  ╚══════════════════════════════════════════════════╝\n');
  });

  // Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

async function shutdown() {
  console.log('\n[Server] Shutting down...');
  try { await db.close(); } catch (_) {}
  process.exit(0);
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
