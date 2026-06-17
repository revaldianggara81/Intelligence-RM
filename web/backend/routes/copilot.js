'use strict';
const express        = require('express');
const { requireAuth }  = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const llm            = require('../services/llmService');
const rag            = require('../services/ragService');
const paf            = require('../services/pafService');
const audit          = require('../services/auditService');
const historySvc     = require('../services/aiHistoryService');
const promptSvc      = require('../services/copilotPromptService');

const router = express.Router();

function captureSSEResult(res, onComplete) {
  let accumulated = '';
  const _write = res.write.bind(res);
  const _end   = res.end.bind(res);
  res.write = function () {
    try {
      const str = Buffer.isBuffer(arguments[0])
        ? arguments[0].toString('utf8') : String(arguments[0] || '');
      for (const line of str.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try { const d = JSON.parse(line.slice(6)); if (d.token) accumulated += d.token; } catch (_) {}
      }
    } catch (_) {}
    return _write.apply(null, arguments);
  };
  res.end = function () {
    if (accumulated.trim() && onComplete)
      onComplete(accumulated).catch(e => console.error('[captureSSE/copilot]', e.message));
    return _end.apply(null, arguments);
  };
}

/**
 * POST /api/copilot/chat
 * Body: { message, customerId? }
 * SSE stream — RAG-enhanced copilot response.
 */
router.post('/chat', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { message, customerId } = req.body;

  if (!message || !message.trim()) {
    res.write(`data: ${JSON.stringify({ error: 'Message is required' })}\n\n`);
    return res.end();
  }

  audit.log(req.user.userId, 'AI_COPILOT_CHAT', 'CUSTOMER', customerId || null, { message: message.substring(0, 200) }, req.ip).catch(() => {});

  const titleSnippet = message.slice(0, 80) + (message.length > 80 ? '…' : '');
  captureSSEResult(res, async (text) => {
    await historySvc.save({
      module:     'copilot',
      userId:     req.user.userId,
      customerId: customerId || null,
      title:      `Copilot: ${titleSnippet}`,
      result:     `Q: ${message}\n\n${text}`,
    });
  });

  (async () => {
    try {
      // RAG retrieval with source health tracking
      const { docs: ragDocs, sources, totalDocs, failCount } =
        await rag.retrieveForCopilot(message, customerId || null);

      // Emit source metadata (strip docs arrays — send only label/count/status)
      const sourcesMeta = Object.fromEntries(
        Object.entries(sources).map(([k, s]) => [k, { label: s.label, count: s.count, status: s.status }])
      );
      res.write(`data: ${JSON.stringify({ type: 'sources', sources: sourcesMeta, totalDocs, failCount })}\n\n`);

      // Build source availability note so LLM knows what data it has
      const availableSources = Object.values(sources)
        .filter(s => s.status === 'ok')
        .map(s => `${s.label} (${s.count} chunk)`)
        .join(', ') || 'Tidak ada sumber tersedia';
      const unavailableSources = Object.values(sources)
        .filter(s => s.status === 'error')
        .map(s => s.label)
        .join(', ');

      const preamble = llm.buildRMPreamble(null) + `\n
Anda memiliki akses ke data nasabah, produk, dan catatan meeting sebagai konteks.
Berikan jawaban yang spesifik, actionable, dan berbasis data yang tersedia.
Jika data tidak tersedia, katakan dengan jelas dan berikan panduan umum terbaik.

SUMBER DATA YANG TERSEDIA UNTUK PERTANYAAN INI:
✅ Tersedia: ${availableSources}
${unavailableSources ? `❌ Tidak tersedia: ${unavailableSources}` : ''}

Setiap klaim spesifik WAJIB ditandai dengan sumber dalam kurung kotak, contoh: [Profil Nasabah], [Katalog Produk], [Catatan Meeting].`;

      await llm.chatStream(message, preamble, ragDocs, res, { maxTokens: 1500 });
    } catch (err) {
      console.error('[Copilot] chat error:', err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'AI service error: ' + err.message })}\n\n`);
        res.end();
      }
    }
  })();
});

/**
 * POST /api/copilot/chat-sync
 * Non-streaming version (for simple integrations).
 */
router.post('/chat-sync', requireAuth, asyncHandler(async (req, res) => {
  const { message, customerId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const { docs: ragDocs, totalDocs } = await rag.retrieveForCopilot(message, customerId || null);
  const preamble = llm.buildRMPreamble();
  const response = await llm.chat(message, preamble, ragDocs, { maxTokens: 1000 });

  res.json({ response, ragDocsUsed: totalDocs });
}));

// ─── Suggested Prompts CRUD ───────────────────────────────────────────────

/**
 * GET /api/copilot/suggested-prompts
 * Returns active prompts (add ?all=1 to include inactive).
 */
router.get('/suggested-prompts', requireAuth, asyncHandler(async (req, res) => {
  const prompts = await promptSvc.getPrompts({ activeOnly: req.query.all !== '1' });
  res.json({ prompts });
}));

/**
 * POST /api/copilot/suggested-prompts
 * Body: { promptText, category?, icon?, sortOrder? }
 */
router.post('/suggested-prompts', requireAuth, asyncHandler(async (req, res) => {
  const { promptText, category, icon, sortOrder } = req.body;
  if (!promptText) return res.status(400).json({ error: 'promptText diperlukan.' });
  await promptSvc.addPrompt({ promptText, category, icon, sortOrder });
  res.json({ ok: true });
}));

/**
 * PUT /api/copilot/suggested-prompts/:id
 * Body: { promptText?, category?, icon?, sortOrder?, isActive? }
 */
router.put('/suggested-prompts/:id', requireAuth, asyncHandler(async (req, res) => {
  await promptSvc.updatePrompt(req.params.id, req.body);
  res.json({ ok: true });
}));

/**
 * DELETE /api/copilot/suggested-prompts/:id
 */
router.delete('/suggested-prompts/:id', requireAuth, asyncHandler(async (req, res) => {
  await promptSvc.deletePrompt(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
