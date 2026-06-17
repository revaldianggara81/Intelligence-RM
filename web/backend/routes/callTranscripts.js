'use strict';
/**
 * callTranscripts.js
 * Mounted at /api/call-transcripts in server.js
 *
 * GET  /:customerId           — list transcripts (newest first)
 * POST /                      — add a transcript (admin / integration)
 * GET  /:customerId/ai-summary — SSE-streamed AI summary of recent calls
 */
const express          = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const svc              = require('../services/callTranscriptService');
const llm              = require('../services/llmService');
const paf              = require('../services/pafService');

const router = express.Router();

function sseHeaders(res) {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/**
 * GET /api/call-transcripts/:customerId
 * Returns all transcripts for a customer (newest first).
 */
router.get('/:customerId', requireAuth, asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const transcripts = await svc.getTranscripts(req.params.customerId, {
    limit: Math.min(parseInt(limit || '20', 10), 50),
  });
  res.json({ transcripts });
}));

/**
 * POST /api/call-transcripts
 * Add a new transcript.
 * Body: { customerId, callDate, duration, agentName, callType, topic,
 *         transcriptText, sentiment, resolution }
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { customerId, transcriptText } = req.body;
  if (!customerId)     return res.status(400).json({ error: 'customerId diperlukan.' });
  if (!transcriptText) return res.status(400).json({ error: 'transcriptText diperlukan.' });
  await svc.addTranscript(req.body);
  res.json({ ok: true });
}));

/**
 * GET /api/call-transcripts/:customerId/ai-summary  [SSE]
 * Streams an AI-generated summary of the customer's recent call transcripts.
 */
router.get('/:customerId/ai-summary', requireAuth, (req, res) => {
  sseHeaders(res);
  _streamSummary(req.params.customerId, res).catch(err => {
    console.error('[callTranscripts] ai-summary error:', err.message);
    if (!res.writableEnded) {
      paf.emitStage(res, 'Error', 'error', err.message);
      res.end();
    }
  });
});

async function _streamSummary(customerId, res) {
  paf.emitStage(res, 'AI Summary', 'active', 'Membaca riwayat percakapan call center...');

  const prompt = await svc.buildSummaryPrompt(customerId, 5);
  if (!prompt) {
    paf.emitStage(res, 'AI Summary', 'error', 'Tidak ada transcript tersedia untuk nasabah ini.');
    if (!res.writableEnded) res.end();
    return;
  }

  paf.emitStage(res, 'AI Summary', 'done', 'Transcript ditemukan — membuat ringkasan...');
  await llm.chatStream(prompt, '', [], res, { maxTokens: 800 });
}

module.exports = router;
