export interface AcceptedQuoteLine {
  id: string;
  description: string;
  quantity: number | string;
  unit_price?: number | string;
  tax_rate?: number | string;
  item_type: "labour" | "parts";
  service_id?: string | null;
}

export interface PlannedWorkcardEntry {
  business_id: string;
  job_id: string;
  created_by: string;
  source_quote_item_id: string;
  entry_type: "labour" | "parts";
  description: string;
  quantity: number;
  quantity_required: number;
  quantity_used: number;
  quantity_ordered: number;
  quantity_received: number;
  part_order_status: "not_ordered" | "not_required";
  unit_price: number;
  cost_unit_price: number;
  tax_rate: number;
  line_total: number;
  service_id: string | null;
  customer_visible: false;
  invoiceable: false;
}

export function buildPlannedWorkEntries(
  quoteItems: AcceptedQuoteLine[],
  context: { businessId: string; jobId: string; createdBy: string }
): PlannedWorkcardEntry[];

export function getInitialWorkcardState(
  quoteItems: Array<Pick<AcceptedQuoteLine, "item_type">>,
  bookingStatus: string | null | undefined
): { status: "scheduled" | "pending"; bookingConfirmed: boolean; enquiryStage: string };

export function getEnquiryStageForWorkcardStatus(status: string): string | null;

export function canTransitionWorkcardStatus(currentStatus: string, nextStatus: string): boolean;
