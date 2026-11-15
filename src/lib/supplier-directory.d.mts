export function normalizeSupplierInput(
  input: Record<string, unknown>,
  options?: { partial?: boolean }
): {
  name?: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  account_reference?: string | null;
  website?: string | null;
  notes?: string | null;
  is_active?: boolean;
};
