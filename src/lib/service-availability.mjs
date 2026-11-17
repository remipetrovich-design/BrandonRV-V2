export function isServiceAvailableForQuoting(service) {
  return service?.approval_status === 'approved_for_launch' && service?.is_active === true;
}
