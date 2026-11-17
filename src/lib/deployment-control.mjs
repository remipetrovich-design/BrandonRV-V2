export function isManualDeployAvailable({ enabledFlag, dispatchToken } = {}) {
  const activated = String(enabledFlag ?? "").trim().toLowerCase() === "true";
  const configured = typeof dispatchToken === "string" && dispatchToken.trim().length > 0;
  return { activated, configured, available: activated && configured };
}

// Manual workflow links remain usable without an in-app GitHub dispatch token.
export function isManualOperationDisabled({ busy } = {}) {
  return Boolean(busy);
}
