import { authorizePermission, database, jsonError, sameOrigin } from "@/lib/auth";
import { normalizeSupplierInput } from "@/lib/supplier-directory.mjs";
import { writeAuditEvent } from "@/lib/audit-events.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const access = await authorizePermission("suppliers.manage");
  if (access.response) return access.response;

  try {
    const body = await request.json();
    const supplier = normalizeSupplierInput(body);
    const db = database();
    const businessId = access.membership!.business_id;
    const { data, error } = await db.from("suppliers")
      .insert({ ...supplier, business_id: businessId })
      .select("id")
      .single();
    if (error || !data) return jsonError("Could not create the supplier record.", 500);

    try {
      await writeAuditEvent(db, {
        businessId,
        actorUserId: access.user!.id,
        action: "supplier.created",
        entityType: "supplier",
        entityId: data.id,
        details: { name: supplier.name }
      });
    } catch {
      await db.from("suppliers").delete().eq("id", data.id).eq("business_id", businessId);
      return jsonError("Could not record the supplier creation in the audit history.", 500);
    }

    return Response.json({ success: true, id: data.id }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create the supplier.", 400);
  }
}
