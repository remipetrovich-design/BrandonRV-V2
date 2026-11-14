const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function buildAuditEvent(input = {}) {
  const businessId = String(input.businessId ?? "").trim();
  const action = String(input.action ?? "").trim();
  const entityType = String(input.entityType ?? "").trim();
  const actorUserId = input.actorUserId == null || input.actorUserId === "" ? null : String(input.actorUserId).trim();
  const entityId = input.entityId == null || input.entityId === "" ? null : String(input.entityId).trim();
  const details = input.details === undefined ? {} : input.details;

  if (!businessId) throw new TypeError("Audit event business ID is required.");
  if (!action || action.length > 120) throw new TypeError("Audit event action must be between 1 and 120 characters.");
  if (!entityType || entityType.length > 80) throw new TypeError("Audit event entity type must be between 1 and 80 characters.");
  if (actorUserId !== null && !actorUserId) throw new TypeError("Audit event actor user ID is invalid.");
  if (entityId !== null && !entityId) throw new TypeError("Audit event entity ID is invalid.");
  if (!isPlainObject(details)) throw new TypeError("Audit event details must be a plain object.");

  let serialized;
  try {
    serialized = JSON.stringify(details);
  } catch {
    throw new TypeError("Audit event details must be JSON serializable.");
  }
  if (serialized === undefined || serialized.length > 32768) {
    throw new RangeError("Audit event details exceed the 32 KB size limit.");
  }

  return {
    business_id: businessId,
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details
  };
}

export async function writeAuditEvent(database, input) {
  if (!database || typeof database.from !== "function") {
    throw new TypeError("A database client is required to write an audit event.");
  }
  const event = buildAuditEvent(input);
  const { error } = await database.from("audit_events").insert(event);
  if (error) throw new Error("Could not write audit event.", { cause: error });
  return event;
}
