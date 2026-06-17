'use strict';
const db = require('../config/database');

/** Get all active goal types from GOAL_TYPES reference table */
async function getGoalTypes() {
  const r = await db.execute(
    `SELECT GOAL_TYPE_ID, LABEL, DESCRIPTION, ICON, COLOR, SORT_ORDER
       FROM GOAL_TYPES
      WHERE IS_ACTIVE = 1
      ORDER BY SORT_ORDER`
  );
  return r.rows || [];
}

/** Get active goals for a customer (joined with GOAL_TYPES for labels/icons) */
async function getCustomerGoals(customerId) {
  const r = await db.execute(
    `SELECT cg.GOAL_ID, cg.CUSTOMER_ID, cg.GOAL_TYPE_ID,
            cg.TARGET_AMOUNT, cg.TARGET_YEAR, cg.PRIORITY,
            cg.NOTES, cg.STATUS,
            TO_CHAR(cg.CREATED_AT, 'YYYY-MM-DD') AS CREATED_AT,
            TO_CHAR(cg.UPDATED_AT, 'YYYY-MM-DD') AS UPDATED_AT,
            gt.LABEL, gt.DESCRIPTION AS TYPE_DESCRIPTION,
            gt.ICON, gt.COLOR
       FROM CUSTOMER_GOALS cg
       JOIN GOAL_TYPES gt ON cg.GOAL_TYPE_ID = gt.GOAL_TYPE_ID
      WHERE cg.CUSTOMER_ID = :1
        AND cg.STATUS = 'ACTIVE'
      ORDER BY cg.PRIORITY, gt.SORT_ORDER`,
    [customerId]
  );
  return r.rows || [];
}

/**
 * Bulk-replace all active goals for a customer.
 * Deactivates existing goals then activates/inserts each selected goalTypeId.
 * goalTypeIds = [] means clear all goals.
 */
async function setGoals(customerId, goalTypeIds, userId) {
  // Soft-delete all existing active goals
  await db.execute(
    `UPDATE CUSTOMER_GOALS
        SET STATUS = 'Inactive', UPDATED_AT = CURRENT_TIMESTAMP
      WHERE CUSTOMER_ID = :1 AND STATUS = 'ACTIVE'`,
    [customerId]
  );

  // Upsert (activate or insert) each selected goal type
  for (const gtId of goalTypeIds) {
    await db.execute(
      `MERGE INTO CUSTOMER_GOALS g
       USING DUAL ON (g.CUSTOMER_ID = :1 AND g.GOAL_TYPE_ID = :2)
       WHEN MATCHED THEN
         UPDATE SET STATUS = 'ACTIVE', UPDATED_AT = CURRENT_TIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (CUSTOMER_ID, GOAL_TYPE_ID, STATUS, CREATED_BY)
         VALUES (:3, :4, 'Active', :5)`,
      [customerId, gtId, customerId, gtId, userId]
    );
  }

  await db.execute('COMMIT');
}

/**
 * Upsert a single goal with optional target details.
 */
async function upsertGoal(customerId, goalTypeId, data, userId) {
  const { targetAmount = null, targetYear = null, priority = 1, notes = null } = data || {};
  await db.execute(
    `MERGE INTO CUSTOMER_GOALS g
     USING DUAL ON (g.CUSTOMER_ID = :1 AND g.GOAL_TYPE_ID = :2)
     WHEN MATCHED THEN
       UPDATE SET TARGET_AMOUNT = :3, TARGET_YEAR = :4, PRIORITY = :5,
                  NOTES = :6, STATUS = 'ACTIVE', UPDATED_AT = CURRENT_TIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (CUSTOMER_ID, GOAL_TYPE_ID, TARGET_AMOUNT, TARGET_YEAR,
               PRIORITY, NOTES, STATUS, CREATED_BY)
       VALUES (:7, :8, :9, :10, :11, :12, 'Active', :13)`,
    [
      customerId, goalTypeId,
      targetAmount, targetYear, priority, notes,
      customerId, goalTypeId, targetAmount, targetYear, priority, notes, userId,
    ]
  );
  await db.execute('COMMIT');
}

/**
 * Soft-delete (deactivate) a single customer goal.
 */
async function removeGoal(customerId, goalTypeId) {
  await db.execute(
    `UPDATE CUSTOMER_GOALS
        SET STATUS = 'Inactive', UPDATED_AT = CURRENT_TIMESTAMP
      WHERE CUSTOMER_ID = :1 AND GOAL_TYPE_ID = :2`,
    [customerId, goalTypeId]
  );
  await db.execute('COMMIT');
}

module.exports = { getGoalTypes, getCustomerGoals, setGoals, upsertGoal, removeGoal };
