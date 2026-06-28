'use strict';
/**
 * PAF Service — OCI Private Agent Factory
 *
 * Port of the Python PAFClient pattern:
 *   1. GET /loginValidation with Basic auth → receive session cookie
 *   2. POST /agentBuilder/run/{agentId} with cookie
 *   3. On 303 redirect → re-login, then retry the POST
 *
 * Falls back to direct OCI GenAI chat when PAF_ENABLED !== 'true'.
 */
const https = require('https');
const llm   = require('./llmService');

const PAF_ENABLED = process.env.PAF_ENABLED === 'true';

const AGENT_MAP = {
  maturity:       () => process.env.PAF_AGENT_MATURITY,
  recommendation: () => process.env.PAF_AGENT_RECOMMENDATION,
  campaign:       () => process.env.PAF_AGENT_CAMPAIGN,
  alert:          () => process.env.PAF_AGENT_ALERT,
  copilot:        () => process.env.PAF_AGENT_COPILOT,
};

const TLS_AGENT = new https.Agent({ rejectUnauthorized: false });

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      agent:    TLS_AGENT,
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        resolve({
          status:  res.statusCode,
          ok:      res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers,
          text:    () => Promise.resolve(body),
          json:    () => Promise.resolve(JSON.parse(body)),
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/* ─── PAFClient (mirrors the Python class) ─────────────────────────── */

class PAFClient {
  constructor(agentId) {
    const base = process.env.PAF_BASE_URL;
    this.loginUrl = `${base}/loginValidation`;
    this.apiUrl   = `${base}/agentBuilder/run/${agentId}`;
    this.user     = process.env.PAF_AUTH_USER;
    this.pass     = process.env.PAF_AUTH_PASS;
    this.cookies  = '';
    this.roomId   = null;
  }

  async login() {
    const basicB64 = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    const resp = await makeRequest(this.loginUrl, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${basicB64}` },
    });
    const raw = resp.headers['set-cookie'];
    if (raw) {
      const arr = Array.isArray(raw) ? raw : [raw];
      this.cookies = arr.map(c => c.split(';')[0]).join('; ');
    }
    console.log('[PAF] Login OK — session cookie acquired');
  }

  async send(message, roomId) {
    const payload = { message };
    if (this.roomId || roomId) {
      payload.roomId = this.roomId || roomId;
    }

    let resp = await this._post(payload);

    if (resp.status === 303) {
      console.log('[PAF] Got 303 — session expired, re-authenticating...');
      await this.login();
      resp = await this._post(payload);
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`PAF returned ${resp.status}: ${body}`);
    }

    const result = await resp.json();
    if (!this.roomId && result.roomId) {
      this.roomId = result.roomId;
    }
    return result;
  }

  async _post(payload) {
    const parsed = new URL(this.apiUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return makeRequest(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Origin':        origin,
        'Referer':       origin + '/',
        ...(this.cookies ? { 'Cookie': this.cookies } : {}),
      },
      body: JSON.stringify(payload),
    });
  }
}

/* ─── Main entry point ─────────────────────────────────────────────── */

async function callPAF(scenario, prompt, res, context = {}) {
  if (!PAF_ENABLED) {
    return callFallback(scenario, prompt, res, context);
  }

  const getAgentId = AGENT_MAP[scenario];
  const agentId = getAgentId?.();
  if (!agentId) {
    console.warn(`[PAF] No agent ID for scenario "${scenario}", falling back to LLM`);
    return callFallback(scenario, prompt, res, context);
  }

  try {
    const client = new PAFClient(agentId);
    await client.login();

    const data = await client.send(prompt, context.roomId || null);

    const text = data?.message || data?.result || data?.output || JSON.stringify(data);
    emitToken(res, text);
    emitDone(res);
    return text;
  } catch (err) {
    console.error(`[PAF] callPAF(${scenario}) error:`, err.message);
    console.warn(`[PAF] Falling back to direct LLM for scenario "${scenario}"`);
    return callFallback(scenario, prompt, res, context);
  }
}

/* ─── Fallback — direct OCI GenAI ──────────────────────────────────── */

async function callFallback(scenario, prompt, res, context) {
  const preamble = llm.buildRMPreamble(context?.customerName);
  const ragDocs  = context?.ragDocs || [];

  if (res && !res.writableEnded) {
    await llm.chatStream(prompt, preamble, ragDocs, res);
    return '';
  } else {
    return await llm.chat(prompt, preamble, ragDocs);
  }
}

/* ─── SSE helpers ──────────────────────────────────────────────────── */

function emitStage(res, stage, status, detail = '') {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'stage', stage, status, detail })}\n\n`);
}

function emitToken(res, token) {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
}

function emitResult(res, result) {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'result', result })}\n\n`);
}

function emitDone(res) {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

module.exports = {
  callPAF,
  callFallback,
  emitStage,
  emitToken,
  emitResult,
  emitDone,
  PAF_ENABLED,
};
