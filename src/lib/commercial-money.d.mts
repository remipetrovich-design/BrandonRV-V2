export interface CommercialLineInput {
  quantity: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
  tax_rate?: number | string;
  taxRate?: number | string;
  line_total?: number | string;
  lineTotal?: number | string;
  [key: string]: unknown;
}

export type PricedCommercialLine<T extends CommercialLineInput = CommercialLineInput> =
  T & {
    quantity: number;
    unit_price: number;
    tax_rate: number;
    line_total: number;
  };

export interface CommercialDocumentTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function calculateDocumentTotals(
  lines: Array<Pick<CommercialLineInput, "line_total" | "lineTotal" | "tax_rate" | "taxRate">>
): CommercialDocumentTotals;

export function priceDocumentLines<T extends CommercialLineInput>(
  lines: T[]
): { lines: Array<PricedCommercialLine<T>> } & CommercialDocumentTotals;
