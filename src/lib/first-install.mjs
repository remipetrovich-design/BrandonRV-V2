export function requiresFirstOwnerSetup(userCount) {
  return Number.isInteger(userCount) && userCount === 0;
}

export function canCreateFirstOwner(userCount) {
  return Number.isInteger(userCount) && userCount === 0;
}
