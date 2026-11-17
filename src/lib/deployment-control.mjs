export function isManualDeployAvailable({ dispatchToken } = {}) {
  const configured = typeof dispatchToken === "string" && dispatchToken.trim().length > 0;
  return { configured, available: true };
}
