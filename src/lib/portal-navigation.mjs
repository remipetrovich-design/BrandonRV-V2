export const PORTAL_NAV_GROUPS = [
  {
    title: null,
    items: [{ href: '/portal', label: 'Overview', icon: 'home' }],
  },
  {
    title: 'Your service',
    items: [
      { href: '/portal/jobcards', label: 'My Jobcards', icon: 'document' },
      { href: '/portal/quotes', label: 'Quotes & approvals', icon: 'quote' },
      { href: '/portal/bookings', label: 'Bookings & visits', icon: 'calendar' },
      { href: '/portal/enquiries', label: 'Messages & support', icon: 'message' },
    ],
  },
  {
    title: 'Your account',
    items: [
      { href: '/portal/vehicles', label: 'My vehicles', icon: 'vehicle' },
      { href: '/portal/documents', label: 'Documents', icon: 'document' },
      { href: '/portal/invoices', label: 'Invoices & payments', icon: 'payment' },
      { href: '/portal/profile', label: 'Personal details', icon: 'user' },
    ],
  },
];

export function isPortalNavActive(href, pathname) {
  if (!href || !pathname) return false;
  if (href === '/portal') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
