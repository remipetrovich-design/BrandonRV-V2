import { authorizePermission, database, jsonError, sameOrigin } from "@/lib/auth";
import { isUuid } from "@/lib/api-validation.mjs";
import { normalizeSupplierInput } from "@/lib/supplier-directory.mjs";
import { writeAuditEvent } from "@/lib/audit-events.mjs";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const access = await authorizePermission("suppliers.manage");
  if (access.response) return access.response;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("Supplier not found.", 404);

  try {
    const body = await request.json();
    const update = normalizeSupplierInput(body, { partial: true });
    const db = database();
    const businessId = access.membership!.business_id;
    const { data: existing, error: loadError } = await db.from("suppliers")
      .select("id,name,contact_name,email,phone,account_reference,website,notes,is_active")
      .eq("id", id)
      .eq("business_id", businessId)
      .maybeSingle();
    if (loadError || !existing) return jsonError("Supplier not found.", 404);

    const { error } = await db.from("suppliers")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) return jsonError("Could not update the supplier record.", 500);

    try {
      await writeAuditEvent(db, {
        businessId,
        actorUserId: access.user!.id,
        action: "supplier.updated",
        entityType: "supplier",
        entityId: id,
        details: { changed_fields: Object.keys(update) }
      });
    } catch {
      await db.from("suppliers").update(existing).eq("id", id).eq("business_id", businessId);
      return jsonError("Could not record the supplier update in the audit history.", 500);
    }

    return Response.json({ success: true, id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update the supplier.", 400);
  }
}
