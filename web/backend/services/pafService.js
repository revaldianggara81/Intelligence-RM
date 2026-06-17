'use strict';
/**
 * PAF Service — OCI Private Agent Factory
 * Calls the real PAF endpoint when PAF_ENABLED=true,
 * falls back to direct OCI GenAI chat otherwise.
 */
const https  = require('https');
const http   = require('http');
const oci    = require('../config/oci');
const llm    = require('./llmService');

const PAF_ENABLED       = process.env.PAF_ENABLED === 'true';
const PAF_BASE_URL      = process.env.PAF_BASE_URL || '';
const PAF_ENDPOINT_ID   = process.env.PAF_AGENT_ENDPOINT_ID || '';

// Per-scenario agent OCIDs
const PAF_AGENTS = {
  maturity:       process.env.PAF_AGENT_MATURITY,
  recommendation: process.env.PAF_AGENT_RECOMMENDATION,
  campaign:       process.env.PAF_AGENT_CAMPAIGN,
  alert:          process.env.PAF_AGENT_ALERT,
  copilot:        process.env.PAF_AGENT_COPILOT,
};

/**
 * Call PAF with a session — streams status updates to res (SSE).
 * @param {string}   scenario    — maturity | recommendation | campaign | alert | copilot
 * @param {string}   prompt
 * @param {object}   res         — Express SSE response (or null for non-streaming)
 * @param {object}   context     — arbitrary JSON context passed as agent input
 * @returns {Promise<string>}    — final text response
 */
// backend/services/pafService.js  — update callPAF()

async function callPAF(scenario, prompt, res, context = {}) {
  if (!process.env.PAF_ENABLED || process.env.PAF_ENABLED !== 'true') {
    return callFallback(scenario, prompt, res, context);
  }

  const agentIdMap = {
    maturity:        process.env.PAF_AGENT_MATURITY,
    recommendations: process.env.PAF_AGENT_RECOMMENDATION,
    alerts:          process.env.PAF_AGENT_ALERTS,
  };
  const agentId = agentIdMap[scenario];
  if (!agentId) return callFallback(scenario, prompt, res, context);

  const baseUrl  = process.env.PAF_BASE_URL;
  const user     = process.env.PAF_AUTH_USER;
  const pass     = process.env.PAF_AUTH_PASS;
  const basicB64 = Buffer.from(`${user}:${pass}`).toString('base64');

  // Step 1: Authenticate — get session
  await fetch(`${baseUrl}/loginValidation`, {
    headers: { 'Authorization': `Basic ${basicB64}` },
  });

  // Step 2: Call agent
  const body = { message: prompt, roomId: context.roomId };
  const resp = await fetch(`${baseUrl}/agentBuilder/run/${agentId}`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${basicB64}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`PAF returned ${resp.status}`);
  const data = await resp.json();

  // Emit as SSE token then done
  const text = data?.message || data?.result || JSON.stringify(data);
  emitToken(res, text);
  emitDone(res);
}
/**
 * Call OCI Agent Runtime API endpoint.
 */
async function callPAFEndpoint(agentId, prompt, res, context) {
  return new Promise(async (resolve, reject) => {
    try {
      const provider = oci.getProvider();
      const region   = oci.REGION;

      // Build the request body
      const body = JSON.stringify({
        agentEndpointId: PAF_ENDPOINT_ID,
        input: {
          text:    prompt,
          context: JSON.stringify(context),
        },
        sessionId: `sess_${Date.now()}`,
        isStream:  true,
      });

      // Sign request with OCI API key
      const url       = new URL(`${PAF_BASE_URL}/agentEndpoints/${PAF_ENDPOINT_ID}/sessions`);
      const isHttps   = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const signer = await buildSigner(provider, 'POST', url, body);

      const options = {
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...signer,
        },
      };

      let fullText = '';

      const req = transport.request(options, (httpRes) => {
        httpRes.setEncoding('utf8');
        httpRes.on('data', (chunk) => {
          // Parse SSE chunks from PAF
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const token = data?.output?.text || data?.text || '';
                if (token) {
                  fullText += token;
                  if (res && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ token })}\n\n`);
                  }
                }
                if (data?.finishReason || data?.done) {
                  if (res && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                  }
                }
              } catch (_) {}
            }
          }
        });
        httpRes.on('end', () => resolve(fullText));
        httpRes.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Build OCI request signature headers.
 */
async function buildSigner(provider, method, url, body) {
  try {
    const { createHmac, createHash } = require('crypto');
    const date     = new Date().toUTCString();
    const bodyHash = createHash('sha256').update(body || '').digest('base64');

    return {
      'date':                     date,
      'x-content-sha256':         bodyHash,
      'authorization':            `Signature keyId="${provider.tenancyId}/${provider.user}/${provider.fingerprint}",algorithm="rsa-sha256",headers="(request-target) date host x-content-sha256"`,
    };
  } catch {
    return {};
  }
}

/**
 * Fallback — direct OCI GenAI chat without PAF.
 * Still streams tokens to res if provided.
 */
async function callFallback(scenario, prompt, res, context) {
  const preamble = llm.buildRMPreamble(context?.customerName);
  const ragDocs  = context?.ragDocs || [];

  if (res && !res.writableEnded) {
    // Stream mode
    await llm.chatStream(prompt, preamble, ragDocs, res);
    return ''; // streaming writes to res directly
  } else {
    // Non-streaming
    return await llm.chat(prompt, preamble, ragDocs);
  }
}

/**
 * Emit a pipeline stage update over SSE.
 * @param {object} res
 * @param {string} stage    — agent name / stage label
 * @param {'active'|'done'|'error'} status
 * @param {string} detail   — optional detail message
 */
function emitStage(res, stage, status, detail = '') {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'stage', stage, status, detail })}\n\n`);
}

/**
 * Emit a text chunk over SSE.
 */
function emitToken(res, token) {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
}

/**
 * Emit a structured result object over SSE.
 */
function emitResult(res, result) {
  if (!res || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type: 'result', result })}\n\n`);
}

/**
 * Emit done signal over SSE.
 */
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
