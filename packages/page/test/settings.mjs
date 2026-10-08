// Focused UI witness: the invitation survives Make a new key and Join, but
// is absent from durable browser settings and cleared after save or join.
// The browser runs the page's source bundle. Every HTTP reply is SCRIPTED;
// no scope, provider or live service runs, and no join is judged here.
//
// PLAYWRIGHT_CORE=<scratch directory holding playwright-core> CHROMIUM=<executable> node packages/page/test/settings.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pageFiles } from "../scripts/assets.mjs";

if (!process.env.PLAYWRIGHT_CORE || !process.env.CHROMIUM) throw new Error("Set PLAYWRIGHT_CORE and CHROMIUM to tooling outside the checkout.");
const { chromium } = createRequire(`${process.env.PLAYWRIGHT_CORE}/package.json`)("playwright-core");
const files = await pageFiles();
const origin = "https://page.test";
const invitationSecret = "scripted-invitation-secret";
const place = { directory: { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "directory" }, membership: { scope: `sc_${"b".repeat(51)}a`, inc: `in_${"a".repeat(26)}`, kind: "membership" } };
const link = `artroom-invite:${Buffer.from(JSON.stringify({ v: 1, service: origin, repository: place, invitation: 3, secret: invitationSecret, handle: "@scripted", definition: "platform:membership@2" })).toString("base64url")}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
try {
  const context = await browser.newContext();
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(10_000);
  let joined = null;
  await context.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/page/") return route.fulfill({ contentType: "text/html", body: files.html });
    if (path === "/page/page.js") return route.fulfill({ contentType: "text/javascript", body: files.js });
    if (path.endsWith("/acts")) {
      joined = request.postDataJSON();
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ answer: "accepted", receipt: { fact: { at: place.membership, seq: 1, hash: `sha256:${"0".repeat(64)}` }, definition: "platform:membership@2", intent: null, effects: [], sends: [], epoch: 0 } }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not-found" }) });
  });
  const tab = await context.newPage();
  const leaked = [];
  tab.on("console", (message) => { if (message.text().includes(invitationSecret) || message.text().includes(link)) leaked.push("console"); });
  tab.on("pageerror", (error) => { if (error.message.includes(invitationSecret) || error.message.includes(link)) leaked.push("error"); });
  const room = tab.locator('textarea[name="room"]');
  const privateDraft = async () => {
    const kept = await tab.evaluate(() => JSON.stringify({ storage: { ...localStorage }, hash: location.hash }));
    assert.ok(!kept.includes(invitationSecret) && !kept.includes(link), "invitation must remain absent from storage and URL");
    assert.ok(leaked.length === 0, "invitation must remain absent from console and errors");
  };
  await tab.goto(`${origin}/page/#/settings`);
  await room.fill(link);
  await tab.getByRole("button", { name: "Make a new key" }).click();
  await tab.getByText(/^This browser keeps key/).waitFor();
  assert.ok(await room.inputValue() === link, "key-generation redraw must preserve the invitation");
  await privateDraft();
  await tab.reload();
  await tab.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.ok(await room.inputValue() === "", "reload must discard the unsaved invitation draft");
  const editedLink = `artroom-invite:${Buffer.from(JSON.stringify({ v: 1, service: origin, repository: place, invitation: 4, secret: invitationSecret, handle: "@scripted", definition: "platform:membership@2" })).toString("base64url")}`;
  await room.fill(link);
  await tab.getByRole("button", { name: "Make a new key" }).click();
  await room.fill(editedLink);
  await tab.getByRole("button", { name: "Make a new key" }).click();
  assert.ok(await room.inputValue() === editedLink, "another key-generation redraw must preserve the latest edited invitation");
  const kept = await tab.evaluate(() => JSON.parse(localStorage.getItem("artroom-page")));
  assert.ok(typeof kept.secret === "string" && kept.place.directory === place.directory.scope, "new key and nonsecret place must be saved");
  const keyLine = await tab.getByText(/^This browser keeps key/).textContent();
  await tab.getByRole("button", { name: "Join with the invitation link" }).click();
  await tab.waitForURL(`${origin}/page/#/`);
  assert.ok(joined?.signed?.intent?.kind === "join" && joined.signed.intent.fields.secret === invitationSecret && joined.signed.intent.fields.invitation === 4, "join must send the preserved invitation");
  assert.ok(typeof joined.signed.intent.actor === "string" && keyLine.includes(joined.signed.intent.actor), "join must be signed by the latest generated key");
  await privateDraft();
  await tab.evaluate(() => { location.hash = "#/settings"; });
  await tab.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.ok(await room.inputValue() === "", "accepted join must clear the transient draft");
  await room.fill(link);
  await tab.getByRole("button", { name: "Make a new key" }).click();
  await tab.getByText(/^This browser keeps key/).waitFor();
  await tab.getByRole("button", { name: "Keep in this browser" }).click();
  await tab.waitForURL(`${origin}/page/#/`);
  await tab.evaluate(() => { location.hash = "#/settings"; });
  await tab.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.ok(await room.inputValue() === "", "saving settings must clear the transient draft");
  await privateDraft();
  await tab.reload();
  await tab.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.ok(await room.inputValue() === "", "reload must not recover an invitation from browser storage");
  console.log("PASS: settings UI preserves an invitation through key generation and clears it after join/save without persisting it (scripted HTTP).");
} finally {
  await browser.close();
}
