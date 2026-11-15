export function isManualDeployAvailable({ enabledFlag, dispatchToken } = {}) {
  const activated = String(enabledFlag ?? "").trim().toLowerCase() === "true";
  const configured = typeof dispatchToken === "string" && dispatchToken.trim().length > 0;
  return { activated, configured, available: activated && configured };
}
