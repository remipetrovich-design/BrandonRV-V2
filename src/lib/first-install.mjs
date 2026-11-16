export function requiresFirstOwnerSetup(userCount) {
  return Number.isInteger(userCount) && userCount === 0;
}

export function canCreateFirstOwner(userCount) {
  return Number.isInteger(userCount) && userCount === 0;
}

export function firstInstallDecision(userCount, pathname) {
  if (!Number.isInteger(userCount) || userCount < 0) return "unavailable";
  if (requiresFirstOwnerSetup(userCount)) {
    return pathname === "/setup" || pathname === "/api/auth/bootstrap-owner" ? "allow" : "setup";
  }
  return pathname === "/setup" ? "sign-in" : "allow";
}
