export function buildPlannedWorkEntries(quoteItems, { businessId, jobId, createdBy }) {
  if (!Array.isArray(quoteItems) || quoteItems.length < 1) {
    throw new RangeError("An accepted quote must contain at least one line before a Workcard can be created.");
  }
  if (!businessId || !jobId || !createdBy) {
    throw new TypeError("Business, Workcard and creating staff IDs are required.");
  }

  return quoteItems.map((item) => {
    const itemType = String(item?.item_type ?? "");
    if (!["labour", "parts"].includes(itemType)) {
      throw new RangeError("Accepted quote lines must be labour or parts.");
    }

    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unit_price ?? 0);
    const taxRate = Number(item?.tax_rate ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      throw new RangeError("Accepted quote line quantity must be greater than zero and no more than 10000.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new RangeError("Accepted quote line pricing is invalid.");
    }

    return {
      business_id: businessId,
      job_id: jobId,
      created_by: createdBy,
      source_quote_item_id: item.id,
      entry_type: itemType,
      description: String(item.description ?? "").trim(),
      quantity,
      quantity_required: quantity,
      quantity_used: 0,
      quantity_ordered: 0,
      quantity_received: 0,
      part_order_status: itemType === "parts" ? "not_ordered" : "not_required",
      unit_price: unitPrice,
      cost_unit_price: 0,
      tax_rate: taxRate,
      line_total: 0,
      service_id: item.service_id ?? null,
      customer_visible: false,
      invoiceable: false
    };
  });
}

export function getInitialWorkcardState(quoteItems, bookingStatus) {
  const hasQuotedParts = Array.isArray(quoteItems) && quoteItems.some(item => item?.item_type === "parts");
  const bookingConfirmed = ["confirmed", "rescheduled"].includes(String(bookingStatus ?? ""));
  const enquiryStage = hasQuotedParts
    ? "parts_required"
    : bookingConfirmed
      ? "booked"
      : bookingStatus === "requested"
        ? "booking_requested"
        : "workcard_created";

  return {
    status: bookingConfirmed ? "scheduled" : "pending",
    bookingConfirmed,
    enquiryStage
  };
}

export function getEnquiryStageForWorkcardStatus(status) {
  const stages = {
    waiting_parts: "parts_required",
    scheduled: "booked",
    in_progress: "work_in_progress",
    completed: "quality_check",
    cancelled: "cancelled"
  };
  return stages[String(status)] ?? null;
}
