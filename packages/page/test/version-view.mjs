// Focused DOM witness for the actual view module, with views MADE BY HAND.
// No scope, publication, provider or network request exists. This shows what
// the view offers from records, not publication eligibility or a live route.
//
// PLAYWRIGHT_CORE=<scratch directory holding playwright-core> CHROMIUM=<executable> node packages/page/test/version-view.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

if (!process.env.PLAYWRIGHT_CORE || !process.env.CHROMIUM) throw new Error("Set PLAYWRIGHT_CORE and CHROMIUM to tooling outside the checkout.");
const { chromium } = createRequire(`${process.env.PLAYWRIGHT_CORE}/package.json`)("playwright-core");
const built = await build({ stdin: { contents: 'import { changeScreen } from "./src/view.ts"; window.showVersion = (room, view) => document.body.replaceChildren(changeScreen(room, view, null));', resolveDir: fileURLToPath(new URL("../", import.meta.url)) }, bundle: true, format: "iife", platform: "browser", target: "es2022", write: false, logLevel: "silent" });
const room = { session: { service: "https://scopes.test", secret: [] }, directory: "sc_scripted", reader: null, me: null, key: "scripted", unsessioned: "scripted" };
const file = { path: "README.md", digest: "sha256:scripted", size: 10, page: "https://scopes.test/site/sc_scripted/HEAD/README.md" };
const manifest = { id: 5, state: "current", integrator: null, authors: [], base: "a".repeat(40), integration: "b".repeat(40), tree: null, complete: true, file };
const publication = { id: 12, state: "published", reason: null, operations: [] };
const merge = { id: 6, state: "published", manifest: 5, reason: null, commit: "c".repeat(40), publication };
const view = { scope: "sc_scripted-change", head: { seq: 10 }, number: 1, title: "Scripted version", body: null, state: "merged", author: null, manifests: [manifest], reviews: [], requests: [], jobs: [], links: [], merges: [merge], rules: null, comments: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
try {
  const context = await browser.newContext();
  context.setDefaultTimeout(10_000);
  await context.route("**/*", (route) => route.abort());
  const tab = await context.newPage();
  await tab.setContent("<!doctype html><body></body>");
  await tab.addScriptTag({ content: built.outputFiles[0].text });
  const show = (value) => tab.evaluate(({ room, value }) => window.showVersion(room, value), { room, value });
  const version = tab.locator("section").filter({ has: tab.getByRole("heading", { name: "Version", exact: true }) });
  // A refused invalid path has no rendered link, even if legacy file.page
  // supplied a HEAD address that the browser would normalize through '..'.
  await show({ ...view, state: "open", manifests: [{ ...manifest, file: { ...file, path: "../outside.md", page: "https://scopes.test/site/sc_scripted/HEAD/../outside.md" } }], merges: [{ ...merge, state: "refused", reason: "path-invalid", commit: null, publication: { ...publication, state: "not-reserved" } }] });
  assert.equal(await version.getByRole("link").count(), 0, "invalid proposed path must not offer a rendered link");
  assert.ok((await version.textContent()).includes("Not available for an invalid path."));
  await show({ ...view, state: "open", merges: [{ ...merge, state: "committed", commit: null, publication: { ...publication, state: "publishing" } }] });
  assert.equal(await version.getByRole("link").count(), 0, "an unpublished version must not offer a rendered link");
  assert.ok((await version.textContent()).includes("Not published."));
  await show(view);
  assert.equal(await version.getByRole("link").count(), 0, "published version must not masquerade mutable HEAD as immutable rendering");
  assert.ok((await version.textContent()).includes("Rendering this published version is not available yet."));
  const recorded = version.locator(".field").filter({ has: tab.locator("dt", { hasText: "Recorded publication commit" }) });
  assert.equal(await recorded.locator("code").textContent(), merge.commit, "show recorded merge publication commit, not manifest integration or receipt commit");
  assert.equal(await tab.getByRole("link", { name: "Latest published site", exact: true }).getAttribute("href"), "https://scopes.test/site/sc_scripted/HEAD/", "mutable latest-site navigation remains separate");
  console.log("PASS: actual version DOM suppresses invalid/unpublished/mutable rendered links, shows the recorded publication commit, and separates latest-site navigation (views made by hand).");
} finally {
  await browser.close();
}
