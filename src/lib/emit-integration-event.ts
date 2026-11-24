import "server-only";
import { randomUUID } from "node:crypto";
import { dispatchIntegrationEvent } from "@/lib/integration-runtime";
import type { CoreIntegrationEvent } from "@/lib/integration-events";

/** Dispatch only after the business operation has committed; email failures never undo business work. */
export async function emitIntegrationEvent(event: CoreIntegrationEvent, payload: Record<string, unknown>) {
  try {
    const eventId = randomUUID();
    const results = await dispatchIntegrationEvent(event, { ...payload, eventId });
    const failed = results.filter((result) => !result.ok);
    if (failed.length) console.error("[business-event] Integration handlers failed.", {
      event, integrations: failed.map((result) => result.integrationId),
    });
    return { handled: results.some((result) => result.ok), results };
  } catch (error) {
    console.error("[business-event] Integration dispatch failed.", {
      event, message: error instanceof Error ? error.message : "Unknown integration error.",
    });
    return { handled: false, results: [] };
  }
}
