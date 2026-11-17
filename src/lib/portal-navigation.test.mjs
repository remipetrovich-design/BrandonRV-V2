import test from "node:test";
import assert from "node:assert/strict";
import { PORTAL_NAV_GROUPS, isPortalNavActive } from "./portal-navigation.mjs";

test("customer navigation groups service records and account tools", () => {
  assert.deepEqual(PORTAL_NAV_GROUPS.map(group => group.title), [null, "Your service", "Your account"]);
  const hrefs = PORTAL_NAV_GROUPS.flatMap(group => group.items.map(item => item.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(hrefs.includes("/portal/jobcards"));
  assert.ok(hrefs.includes("/portal/quotes"));
  assert.ok(hrefs.includes("/portal/bookings"));
  assert.ok(hrefs.includes("/portal/invoices"));
});

test("overview is active only on the portal root", () => {
  assert.equal(isPortalNavActive("/portal", "/portal"), true);
  assert.equal(isPortalNavActive("/portal", "/portal/jobcards"), false);
});

test("nested customer record routes keep their parent navigation active", () => {
  assert.equal(isPortalNavActive("/portal/jobcards", "/portal/jobcards/123"), true);
  assert.equal(isPortalNavActive("/portal/profile", "/portal/profile/security"), true);
  assert.equal(isPortalNavActive("/portal/quotes", "/portal/bookings"), false);
});
