import { calculateDocumentTotals } from "./commercial-money.mjs";

export function canAcceptJobAssignment(status) {
  return status === "assigned";
}
export function canStartWorkOrder(jobStatus, assignmentStatus, canManage = false) {
  return (canManage || assignmentStatus === "accepted") && ["pending", "scheduled"].includes(jobStatus);
}
export function canFinishWorkOrder(jobStatus, assignmentStatus, canManage = false) {
  return (canManage || assignmentStatus === "accepted") && jobStatus === "in_progress";
}
export function calculateWorkOrderTotals(items) {
  const billable = items.filter(item => !["note", "test"].includes(item.entry_type));
  return calculateDocumentTotals(billable);
}
