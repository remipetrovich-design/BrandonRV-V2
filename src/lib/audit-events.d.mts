export interface AuditEventInput {
  businessId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

export function buildAuditEvent(input?: AuditEventInput): {
  business_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
};

export function writeAuditEvent(database: { from: (table: string) => any }, input: AuditEventInput): Promise<{
  business_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
}>;
