'use strict';
/**
 * Embedding Service — OCI Generative AI Cohere Embed v4.0
 *
 * The oci-generativeaiinference SDK uses plain JS objects (TypeScript interfaces),
 * NOT class constructors.  servingMode must be a literal object with servingType.
 */
const oci = require('../config/oci');

const INPUT_TYPE_DOC   = 'SEARCH_DOCUMENT';
const INPUT_TYPE_QUERY = 'SEARCH_QUERY';

/**
 * Generate embeddings for an array of text strings.
 * @param {string[]} texts
 * @param {'SEARCH_DOCUMENT'|'SEARCH_QUERY'} inputType
 * @returns {Promise<number[][]>}  — array of 1024-dim float arrays
 */
async function embedTexts(texts, inputType = INPUT_TYPE_DOC) {
  if (!texts || texts.length === 0) return [];

  const client = oci.getGenAIClient();

  const request = {
    embedTextDetails: {
      compartmentId: oci.COMPARTMENT_ID,
      // Plain object — servingType is a string literal, NOT a constructor
      servingMode: {
        servingType: 'ON_DEMAND',
        modelId:     oci.EMBED_MODEL,
      },
      inputs:           texts.map(t => String(t).substring(0, 4096)),
      inputType,
      truncate:         'END',
    },
  };

  try {
    const response = await client.embedText(request);
    const embeddings = response?.embedTextResult?.embeddings;
    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embeddings returned from OCI GenAI');
    }
    return embeddings; // number[][] — each row is a 1024-dim float array
  } catch (err) {
    console.error('[EMBED] embedTexts error:', err.message || err);
    throw err;
  }
}

/**
 * Embed a single document string (for storing in DB).
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedDocument(text) {
  const results = await embedTexts([text], INPUT_TYPE_DOC);
  return results[0];
}

/**
 * Embed a single query string (for similarity search).
 * @param {string} query
 * @returns {Promise<number[]>}
 */
async function embedQuery(query) {
  const results = await embedTexts([query], INPUT_TYPE_QUERY);
  return results[0];
}

/**
 * Convert a float[] to Oracle TO_VECTOR() compatible string: "[v1,v2,...]"
 * @param {number[]} vec
 * @returns {string}
 */
function vectorToString(vec) {
  return '[' + vec.join(',') + ']';
}

module.exports = {
  embedTexts,
  embedDocument,
  embedQuery,
  vectorToString,
  INPUT_TYPE_DOC,
  INPUT_TYPE_QUERY,
};
