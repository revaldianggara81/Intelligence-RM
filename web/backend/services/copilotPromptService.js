'use strict';
/**
 * copilotPromptService.js
 * CRUD for COPILOT_SUGGESTED_PROMPTS.
 */
const db = require('../config/database');

// ---------------------------------------------------------------------------
// List prompts (active only by default, ordered by SORT_ORDER)
// ---------------------------------------------------------------------------
async function getPrompts({ activeOnly = true } = {}) {
  const where = activeOnly ? ' WHERE IS_ACTIVE = 1' : '';
  const rs = await db.execute(
    `SELECT PROMPT_ID, PROMPT_TEXT, CATEGORY, ICON, SORT_ORDER, IS_ACTIVE,
            TO_CHAR(CREATED_AT, 'DD Mon YYYY') AS CREATED_AT_FMT
       FROM COPILOT_SUGGESTED_PROMPTS${where}
       ORDER BY SORT_ORDER ASC, PROMPT_ID ASC`,
    []
  );
  return rs.rows || [];
}

// ---------------------------------------------------------------------------
// Add a new prompt
// ---------------------------------------------------------------------------
async function addPrompt({ promptText, category = 'general', icon = '💡', sortOrder = 0 }) {
  if (!promptText || !promptText.trim()) throw new Error('promptText diperlukan.');
  await db.execute(
    `INSERT INTO COPILOT_SUGGESTED_PROMPTS (PROMPT_TEXT, CATEGORY, ICON, SORT_ORDER)
     VALUES (:1, :2, :3, :4)`,
    [promptText.trim(), category, icon, Number(sortOrder) || 0],
    { autoCommit: true }
  );
}

// ---------------------------------------------------------------------------
// Update an existing prompt
// ---------------------------------------------------------------------------
async function updatePrompt(id, { promptText, category, icon, sortOrder, isActive }) {
  const sets  = [];
  const binds = [];
  let   p     = 1;

  if (promptText !== undefined) { sets.push(`PROMPT_TEXT = :${p++}`); binds.push(promptText); }
  if (category   !== undefined) { sets.push(`CATEGORY    = :${p++}`); binds.push(category);   }
  if (icon       !== undefined) { sets.push(`ICON        = :${p++}`); binds.push(icon);        }
  if (sortOrder  !== undefined) { sets.push(`SORT_ORDER  = :${p++}`); binds.push(Number(sortOrder)); }
  if (isActive   !== undefined) { sets.push(`IS_ACTIVE   = :${p++}`); binds.push(isActive ? 1 : 0); }

  if (!sets.length) return;
  binds.push(Number(id));

  await db.execute(
    `UPDATE COPILOT_SUGGESTED_PROMPTS SET ${sets.join(', ')} WHERE PROMPT_ID = :${p}`,
    binds,
    { autoCommit: true }
  );
}

// ---------------------------------------------------------------------------
// Delete a prompt
// ---------------------------------------------------------------------------
async function deletePrompt(id) {
  await db.execute(
    `DELETE FROM COPILOT_SUGGESTED_PROMPTS WHERE PROMPT_ID = :1`,
    [Number(id)],
    { autoCommit: true }
  );
}

module.exports = { getPrompts, addPrompt, updatePrompt, deletePrompt };
