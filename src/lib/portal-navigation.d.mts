export type PortalNavItem = {
  href: string;
  label: string;
  icon: string;
};

export type PortalNavGroup = {
  title: string | null;
  items: PortalNavItem[];
};

export declare const PORTAL_NAV_GROUPS: PortalNavGroup[];
export declare function isPortalNavActive(href: string, pathname: string): boolean;
