import { priceDocumentLines } from "./commercial-money.mjs";

export function prepareQuoteLines(items, defaultTaxRate = 0) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
    throw new RangeError("Add between 1 and 30 quote lines.");
  }

  const normalized = items.map((item, index) => {
    const description = String(item?.description ?? "").trim();
    if (description.length < 3 || description.length > 500) {
      throw new RangeError("Each quote line needs a description between 3 and 500 characters.");
    }

    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      throw new RangeError("Each quote line needs a positive quantity no greater than 10000.");
    }

    const unitPrice = Number(item?.unit_price ?? item?.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10000000) {
      throw new RangeError("Each quote line needs a valid unit price between 0 and 10000000.");
    }

    const itemType = String(item?.item_type ?? item?.itemType ?? "labour");
    if (!["labour", "parts"].includes(itemType)) {
      throw new RangeError("Quote line type must be labour or parts.");
    }

    const serviceId = item?.service_id ?? item?.serviceId ?? null;
    if (serviceId && itemType !== "labour") {
      throw new RangeError("A service preset must be quoted as labour/service, not as a parts line.");
    }

    return {
      description,
      quantity,
      unit_price: unitPrice,
      tax_rate: Number(item?.tax_rate ?? item?.taxRate ?? defaultTaxRate),
      sort_order: index,
      item_type: itemType,
      service_id: serviceId ? String(serviceId) : null
    };
  });

  return priceDocumentLines(normalized);
}

export function validateQuoteTaxPolicy(taxRates, pricing = {}) {
  const rates = Array.isArray(taxRates) ? taxRates : [taxRates];
  const gstStatus = String(pricing?.gst_status ?? "not_configured");
  const configuredGstRate = Number(pricing?.gst_rate ?? 10);

  if (!Number.isFinite(configuredGstRate) || configuredGstRate < 0 || configuredGstRate > 100) {
    throw new RangeError("The configured GST rate in Business Settings is invalid.");
  }
  if (rates.some(rate => Number(rate) > 0) && gstStatus !== "registered") {
    throw new Error("GST cannot be added until the business is confirmed as GST registered.");
  }
  if (gstStatus === "registered" && rates.some(rate => Math.abs(Number(rate) - configuredGstRate) > 0.001)) {
    throw new Error("Use the configured GST rate from Business Settings.");
  }

  return { gstStatus, configuredGstRate };
}

export function nextQuoteRevision(prior, { enquiryId, customerId }) {
  if (!prior || prior.enquiry_id !== enquiryId || prior.customer_id !== customerId) {
    throw new Error("A quote revision must belong to the same customer and Jobcard relationship.");
  }
  if (["accepted", "converted", "declined", "superseded"].includes(String(prior.status))) {
    throw new Error("This quote is no longer eligible for revision. Use the current active quote or the Workcard variation workflow.");
  }
  if (prior.status === "draft" && prior.senior_approval_status !== "changes_requested") {
    throw new Error("A draft quote can only be revised after senior review has requested changes.");
  }
  if (!["sent", "expired", "draft"].includes(String(prior.status))) {
    throw new Error("Only an issued, expired, or returned-for-changes quote can be revised.");
  }

  const revision = Number(prior.revision_number ?? 1);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("The previous quote revision number is invalid.");
  }
  return revision + 1;
}

export function defaultQuoteExpiryDate(validityDays, today = new Date().toISOString().slice(0, 10), explicitDate = null) {
  if (explicitDate) return String(explicitDate);
  if (validityDays === null || validityDays === undefined || validityDays === "") return null;
  const days = Number(validityDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new RangeError("Quote validity must be a whole number between 1 and 365 days.");
  }
  const base = new Date(String(today) + "T00:00:00.000Z");
  if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== String(today)) {
    throw new RangeError("The quote issue date must be a valid calendar date.");
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
