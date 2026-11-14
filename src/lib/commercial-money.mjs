function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return number;
}

function toCents(value, label) {
  const amount = finiteNumber(value, label);
  if (amount < 0) {
    throw new RangeError(`${label} cannot be negative.`);
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

function toBasisPoints(value) {
  const rate = finiteNumber(value, "Tax rate");
  if (rate < 0 || rate > 100) {
    throw new RangeError("Tax rate must be between 0 and 100.");
  }
  return Math.round(rate * 100);
}

function fromCents(value) {
  return Number((value / 100).toFixed(2));
}

/**
 * Calculates a document total from already-rounded line totals.
 * Tax is accumulated at basis-point precision and rounded once for the
 * document, matching the existing quote/invoice calculation policy.
 */
export function calculateDocumentTotals(lines) {
  if (!Array.isArray(lines)) {
    throw new TypeError("Document lines must be an array.");
  }

  let subtotalCents = 0;
  let taxNumerator = 0;

  for (const line of lines) {
    const lineTotal = line?.line_total ?? line?.lineTotal;
    const taxRate = line?.tax_rate ?? line?.taxRate ?? 0;
    const lineCents = toCents(lineTotal, "Line total");
    const rateBasisPoints = toBasisPoints(taxRate);

    subtotalCents += lineCents;
    taxNumerator += lineCents * rateBasisPoints;
  }

  const taxCents = Math.round(taxNumerator / 10000);
  return {
    subtotal: fromCents(subtotalCents),
    taxAmount: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents)
  };
}

/**
 * Prices line items using integer cents, then calculates document totals.
 * Extra line metadata (description, item type, service ID, sort order, etc.)
 * is preserved for the caller.
 */
export function priceDocumentLines(lines) {
  if (!Array.isArray(lines)) {
    throw new TypeError("Document lines must be an array.");
  }

  const pricedLines = lines.map((line) => {
    const quantity = finiteNumber(line?.quantity, "Quantity");
    if (quantity <= 0) {
      throw new RangeError("Quantity must be greater than zero.");
    }

    const unitPrice = finiteNumber(line?.unit_price ?? line?.unitPrice, "Unit price");
    if (unitPrice < 0) {
      throw new RangeError("Unit price cannot be negative.");
    }

    const taxRate = finiteNumber(line?.tax_rate ?? line?.taxRate ?? 0, "Tax rate");
    const rateBasisPoints = toBasisPoints(taxRate);
    const lineTotal = fromCents(toCents(quantity * unitPrice, "Line amount"));

    return {
      ...line,
      quantity,
      unit_price: unitPrice,
      tax_rate: rateBasisPoints / 100,
      line_total: lineTotal
    };
  });

  return {
    lines: pricedLines,
    ...calculateDocumentTotals(pricedLines)
  };
}
