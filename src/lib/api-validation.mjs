const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function readTrimmedString(value, options = {}) {
  const { min = 0, max = 5000, optional = false, label = "Value" } = options;
  if (value == null && optional) return null;
  if (typeof value !== "string") throw new TypeError(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized && optional) return null;
  if (normalized.length < min || normalized.length > max) {
    throw new RangeError(`${label} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

export function readFiniteNumber(value, options = {}) {
  const { min = -Infinity, max = Infinity, optional = false, label = "Value" } = options;
  if ((value == null || value === "") && optional) return null;
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TypeError(`${label} must be a number.`);
  }
  if (typeof value === "string" && !value.trim()) {
    throw new TypeError(`${label} must be a number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RangeError(`${label} must be a finite number between ${min} and ${max}.`);
  }
  return number;
}
