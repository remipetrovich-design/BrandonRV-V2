export interface QuoteLineInput {
  description: string;
  quantity: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
  tax_rate?: number | string;
  taxRate?: number | string;
  item_type?: string;
  itemType?: string;
  service_id?: string | null;
  serviceId?: string | null;
  [key: string]: unknown;
}

export interface PreparedQuote {
  lines: Array<QuoteLineInput & {
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    line_total: number;
    sort_order: number;
    item_type: string;
    service_id: string | null;
  }>;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function prepareQuoteLines(items: QuoteLineInput[], defaultTaxRate?: number): PreparedQuote;
export function validateQuoteTaxPolicy(taxRates: number[] | number, pricing?: { gst_status?: string; gst_rate?: number | string }): { gstStatus: string; configuredGstRate: number };
export function nextQuoteRevision(prior: { enquiry_id: string | null; customer_id: string | null; revision_number?: number; status: string } | null, context: { enquiryId: string | null; customerId: string | null }): number;
