const allowedFields = new Set([
  "name",
  "contact_name",
  "email",
  "phone",
  "account_reference",
  "website",
  "notes",
  "is_active"
]);

const limits = {
  name: 160,
  contact_name: 120,
  email: 254,
  phone: 40,
  account_reference: 120,
  website: 500,
  notes: 5000
};

function optionalText(value, field) {
  if (value == null) return null;
  if (typeof value !== "string") throw new TypeError(`${field} must be text.`);
  const text = value.trim();
  if (text.length > limits[field]) throw new RangeError(`${field} exceeds the allowed length.`);
  return text || null;
}

export function normalizeSupplierInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Supplier details must be an object.");
  }
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) throw new TypeError(`Unknown supplier field: ${key}.`);
  }

  const result = {};
  if (!partial || Object.hasOwn(input, "name")) {
    if (typeof input.name !== "string") throw new TypeError("Supplier name is required.");
    const name = input.name.trim();
    if (!name || name.length > limits.name) throw new RangeError("Supplier name is required and must be 160 characters or fewer.");
    result.name = name;
  }

  for (const field of ["contact_name", "email", "phone", "account_reference", "website", "notes"]) {
    if (partial && !Object.hasOwn(input, field)) continue;
    let value = optionalText(input[field], field);
    if (field === "email" && value) {
      value = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new TypeError("Enter a valid supplier email address.");
    }
    if (field === "website" && value) {
      let parsed;
      try { parsed = new URL(value); } catch { throw new TypeError("Enter a valid supplier website URL."); }
      if (!["http:", "https:"].includes(parsed.protocol)) throw new TypeError("Supplier website must use http or https.");
      value = parsed.toString();
    }
    result[field] = value;
  }

  if (!partial || Object.hasOwn(input, "is_active")) {
    if (input.is_active !== undefined && typeof input.is_active !== "boolean") {
      throw new TypeError("Supplier active state must be true or false.");
    }
    result.is_active = input.is_active ?? true;
  }
  if (partial && Object.keys(result).length === 0) throw new TypeError("No supplier changes supplied.");
  return result;
}
