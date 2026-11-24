const { AuditLog } = require("../models");

/**
 * Records an entry into the audit_log collection.
 * Never throws an unhandled error so auditing does not block the primary operation unless desired.
 *
 * @param {Object} params
 * @param {string|Object} [params.actorUserId]
 * @param {string} params.action - e.g. RIDER_REGISTERED, STEP_UPDATED, ADMIN_READ_DETAIL, ADMIN_REVIEWED
 * @param {string} params.entity - e.g. rider_profiles, kyc_records, bank_accounts
 * @param {string} params.entityId
 * @param {Object} [params.meta] - Metadata, without PII
 * @param {Object} [session] - Optional Mongoose ClientSession
 */
async function recordAudit({ actorUserId = null, action, entity, entityId, meta = {} }, session = null) {
  try {
    const doc = {
      actorUserId: actorUserId || null,
      action,
      entity,
      entityId: String(entityId),
      meta,
    };
    if (session) {
      await AuditLog.create([doc], { session });
    } else {
      await AuditLog.create(doc);
    }
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

module.exports = {
  recordAudit,
};
