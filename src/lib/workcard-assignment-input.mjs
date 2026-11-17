import { isUuid } from "./api-validation.mjs";

/**
 * Validate the submitted staff identifiers for a Workcard assignment.
 * Returns null for malformed input and a de-duplicated UUID list otherwise.
 * An empty list is valid and means an authorised manager is clearing assignments.
 */
export function normalizeWorkcardStaffIds(value) {
  if (!Array.isArray(value) || value.length > 20) return null;
  const ids = [];
  for (const id of value) {
    if (!isUuid(id)) return null;
    ids.push(id);
  }
  return [...new Set(ids)];
}
