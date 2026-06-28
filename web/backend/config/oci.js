'use strict';
require('dotenv').config();
const common = require('oci-common');
const genai  = require('oci-generativeaiinference');
const fs     = require('fs');
const path   = require('path');

let _provider = null;
let _genaiClient = null;

function getProvider() {
  if (_provider) return _provider;

  const keyFile = path.resolve(process.env.OCI_KEY_FILE || './oci_api_key.pem');
  if (!fs.existsSync(keyFile)) {
    throw new Error(`OCI API key not found at ${keyFile}. Set OCI_KEY_FILE in .env or disable GenAI fallback.`);
  }
  const privateKey = fs.readFileSync(keyFile, 'utf8');

  _provider = new common.SimpleAuthenticationDetailsProvider(
    process.env.OCI_TENANCY_ID,
    process.env.OCI_USER_ID,
    process.env.OCI_FINGERPRINT,
    privateKey,
    process.env.OCI_KEY_PASSPHRASE || null,
    common.Region.fromRegionId(process.env.OCI_REGION || 'ap-singapore-1')
  );

  return _provider;
}

function getGenAIClient() {
  if (_genaiClient) return _genaiClient;

  _genaiClient = new genai.GenerativeAiInferenceClient({
    authenticationDetailsProvider: getProvider(),
  });

  // Override endpoint if needed
  if (process.env.OCI_GENAI_LLM_ENDPOINT) {
    _genaiClient.endpoint = process.env.OCI_GENAI_LLM_ENDPOINT;
  }

  return _genaiClient;
}

module.exports = {
  getProvider,
  getGenAIClient,
  COMPARTMENT_ID: process.env.OCI_COMPARTMENT_ID,
  LLM_MODEL:      process.env.OCI_GENAI_LLM_MODEL  || 'cohere.command-r-plus-08-2024',
  EMBED_MODEL:    process.env.OCI_GENAI_EMBED_MODEL || 'cohere.embed-v4.0',
  EMBED_DIM:      parseInt(process.env.OCI_GENAI_EMBED_DIM) || 1024,
  MAX_TOKENS:     parseInt(process.env.OCI_GENAI_MAX_TOKENS) || 3000,
  TEMPERATURE:    parseFloat(process.env.OCI_GENAI_TEMPERATURE) || 0.3,
  REGION:         process.env.OCI_REGION || 'ap-singapore-1',
};
