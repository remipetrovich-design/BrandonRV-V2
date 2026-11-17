import test from "node:test";
import assert from "node:assert/strict";

test("bundled customer emails use the V2 URL and hide the unverified email address", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousEmail = process.env.BRANDONRV_PUBLIC_EMAIL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.BRANDONRV_PUBLIC_EMAIL;
  try {
    const { renderBrandonRvEmail } = await import("./templates.mjs?v2-default-url");
    const message = renderBrandonRvEmail("welcome", { firstname: "Customer" });
    assert.match(message.html, /https:\/\/brandon-rv-v2\.vercel\.app/);
    assert.doesNotMatch(message.html, /brandon-rv\.vercel\.app/);
    assert.doesNotMatch(message.html, /enquires@brandonrv\.com\.au/i);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    if (previousEmail === undefined) delete process.env.BRANDONRV_PUBLIC_EMAIL;
    else process.env.BRANDONRV_PUBLIC_EMAIL = previousEmail;
  }
});

test("configured app URL overrides the V2 fallback", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://customer.example.test/";
  try {
    const { renderBrandonRvEmail } = await import("./templates.mjs?configured-app-url");
    const message = renderBrandonRvEmail("welcome", { firstname: "Customer" });
    assert.match(message.html, /https:\/\/customer\.example\.test/);
    assert.doesNotMatch(message.html, /brandon-rv-v2\.vercel\.app/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
  }
});
