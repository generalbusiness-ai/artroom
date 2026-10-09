// The page's screenshots: the issue, the change with a refusal, the rules view and a rendered page of the published site, in a
// real browser.
//
//   PLAYWRIGHT_CORE=<a directory holding playwright-core> [CHROMIUM=<a chromium executable>] node packages/page/test/screens.mjs
//
// playwright-core is not a dependency of this repository: install it in a scratch directory, outside the checkout. The browser
// is the one PLAYWRIGHT_BROWSERS_PATH holds, or CHROMIUM.
//
// What the browser talks to. No service runs here. The script runs the recorder, `record.scope.test.ts`, with PAGE_RECORD=1: the
// story on real scopes in the test Worker, with every read of the page's screens, paul's refused review and the site page sent
// through the Worker's routes, and the page's own two files as the deployed Worker's entry serves them at /page/, with their
// headers. The browser opens the page at the service's /page/ and is answered with those recorded answers, request by request.
// An act is answered by its path; the refusal is a native recorder answer, not a new admission of the browser intent.
// No browser POST body/signature is verified by playback; a session request is answered by its path and the key that asks. A request the recorder did not make fails the script.
import { execFileSync } from "node:child_process";
import { statSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const page = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(page, "../..");
const out = join(page, "test/screenshots");
const MOST = 300 * 1024;

if (!process.env.PLAYWRIGHT_CORE) throw new Error("Set PLAYWRIGHT_CORE to a directory that holds playwright-core, installed outside this checkout.");
const playwrightRequire = createRequire(join(process.env.PLAYWRIGHT_CORE, "package.json"));
const { chromium } = playwrightRequire("playwright-core");
const playwrightVersion = playwrightRequire("playwright-core/package.json").version;
const browserPath = process.env.CHROMIUM ?? join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers", "chromium-1194/chrome-linux/chrome");

// Root builds and commits page-assets before capture. This script never mutates
// tracked source as a preflight; a stale asset fails the existing assets witness.
const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceDirty = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim();
if (sourceDirty) throw new Error("Capture requires a clean tracked source/build-assets head; commit preparation before recording.");
const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();

const log = execFileSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run", "--project", "scope", "page/test/record", "--silent=false", "--reporter=verbose"], {
  cwd: root, env: { ...process.env, PAGE_RECORD: "1" }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
});
const parts = [...log.matchAll(/^PAGE-RECORD (\d+) (\S+)$/gm)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]);
if (parts.length === 0 || !/^PAGE-RECORD end$/m.test(log)) throw new Error("The recorder printed no whole record.");
const record = JSON.parse(Buffer.from(parts.join(""), "base64url").toString("utf8"));

if (playwrightVersion !== "1.63.0") throw new Error(`Capture expects pinned cached Playwright 1.63.0; got ${playwrightVersion}.`);
const browser = await chromium.launch({ executablePath: browserPath });
const browserVersion = browser.version();
const unanswered = [];
const sizes = [];
const consoleErrors = [];
const expectedNetworkRefusals = [];
const layoutChecks = [];
const contexts = [];
const previewChecks = [];
const taskChecks = [];
const navigationChecks = [];
const keyboardChecks = [];
mkdirSync(out, { recursive: true });

/** A browser context signed in as one person: the page's settings kept as the page keeps them, every request answered from the record. */
async function as(person, { width = 1024, height = 800, colorScheme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme });
  contexts.push(context);
  await context.route(`${record.service}/**`, (route) => {
    const request = route.request();
    const path = request.url().slice(record.service.length);
    const actor = path.endsWith("/sessions") ? ` ${JSON.parse(request.postData() ?? "{}").request?.actor}` : "";
    const answer = record.answers[`${request.method() === "POST" ? "POST" : "GET"} ${path}${actor}`];
    if (!answer) {
      unanswered.push(`${request.method()} ${path}${actor}`);
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not-found" }) });
    }
    return route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body });
  });
  await context.addInitScript((kept) => localStorage.setItem("artroom-page", JSON.stringify(kept)), { place: record.place, secret: record.people[person] });
  const tab = await context.newPage();
  const requests = [];
  tab.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  tab.recordedRequests = requests;
  tab.on("pageerror", (error) => consoleErrors.push(error.message));
  tab.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const path = location.url?.startsWith(record.service) ? location.url.slice(record.service.length) : null;
    const answer = path ? record.answers[`POST ${path}`] : null;
    let body = null;
    try { body = answer ? JSON.parse(answer.body) : null; } catch { /* HTML/script responses are not a refusal. */ }
    const refusal = body && typeof body.answer === "object" ? body.answer : body;
    if (answer?.status === 422 && refusal?.answer === "refused" && refusal?.name === "author-cannot-review" && /^Failed to load resource: the server responded with a status of 422/.test(message.text())) {
      expectedNetworkRefusals.push({ text: message.text(), url: location.url, status: answer.status, refusal });
    } else consoleErrors.push({ text: message.text(), location });
  });
  return tab;
}
/** A screenshot of the whole page, or of its top `height` pixels. */
const shot = async (tab, name, height = null) => {
  const file = join(out, `${name}.png`);
  const viewport = tab.viewportSize();
  const check = await tab.evaluate(() => ({
    title: document.title,
    origin: location.origin,
    pathname: location.pathname,
    meaningful: document.querySelector("main")?.textContent?.trim().length > 0,
    selectedNavigation: document.querySelector('nav [aria-current="page"]')?.textContent?.trim() ?? null,
    roomSwitches: [...document.querySelectorAll(".room-switch")].filter((element) => element.getBoundingClientRect().width > 0).length,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    overlay: !!document.querySelector("vite-error-overlay, nextjs-portal"),
    touchTargets: [...document.querySelectorAll("button,.icon-button,.room-switch")].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(element => ({ label: element.getAttribute("aria-label") ?? element.textContent?.trim(), height: element.getBoundingClientRect().height })),
    controls: [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter((element) => element.getBoundingClientRect().width > 0)
      .map((element) => ({ name: element.getAttribute("name"), fontSize: parseFloat(getComputedStyle(element).fontSize) })),
  }));
  if (check.origin !== new URL(record.service).origin || !(check.pathname === "/page/" || check.pathname.startsWith("/site/"))) throw new Error(`${name}: document left the recorded service routes.`);
  if (check.pathname === "/page/" && check.title !== "Artroom") throw new Error(`${name}: unexpected page title ${check.title}.`);
  if (!check.meaningful || check.overlay || check.horizontalOverflow) throw new Error(`${name}: invalid rendered layout ${JSON.stringify(check)}`);
  if (viewport.width <= 390 && check.touchTargets.some(control => control.height < 43)) throw new Error(`${name}: a core task target is below 44px effective height.`);
  if (viewport.width <= 390 && check.controls.some((control) => control.fontSize < 16)) throw new Error(`${name}: editable phone text is smaller than 16px.`);
  layoutChecks.push({ name, url: tab.url(), viewport, ...check });
  const expectedNavigation = name.startsWith("issues") || name.startsWith("issue") ? "Issues" : name.startsWith("change") ? "Changes" : name.startsWith("rules") ? "Rules" : null;
  if (expectedNavigation && (check.selectedNavigation !== expectedNavigation || check.roomSwitches !== 1)) throw new Error(`${name}: duplicate room identity or wrong selected destination.`);
  await tab.screenshot({ path: file, ...(height ? { clip: { x: 0, y: 0, width: viewport.width, height } } : { fullPage: true }) });
  sizes.push([name, statSync(file).size]);
};

const una = await as("una");
await una.goto(`${record.service}/page/#/`);
await una.getByRole("heading", { name: "Issues", exact: true }).waitFor({ state: "attached" });
await una.getByRole("link", { name: /The handbook is empty/ }).waitFor();
await shot(una, "issues-desktop");
const create = una.locator('[data-action-slot="create"]').getByRole("button", { name: "Create issue", exact: true });
await create.click();
const issueDialog = una.getByRole("dialog", { name: "Create issue", exact: true });
await issueDialog.waitFor();
if (await issueDialog.locator('input:not([type="hidden"]),textarea').count() !== 2) throw new Error("Create issue exposes unexpected ordinary fields.");
await issueDialog.locator('[name="field:title"]').fill("Capture draft only");
await issueDialog.locator('[name="field:body"]').fill("No recorded mutation is submitted.");
await shot(una, "create-issue-desktop");
for (let turn = 0; turn < 5; turn++) {
  await una.keyboard.press("Tab");
  if (!await issueDialog.evaluate(element => element.contains(document.activeElement))) throw new Error("Create issue keyboard focus escaped its dialog.");
}
await una.keyboard.press("Escape");
if (await issueDialog.count() !== 0 || !await create.evaluate(element => document.activeElement === element)) throw new Error("Create issue Escape/focus return failed.");
keyboardChecks.push({ flow: "Create issue", escapeCloses: true, returnsFocus: true, tabContained: true, submitted: false });
const query = una.getByRole("searchbox", { name: "Search issues", exact: true });
await query.fill("handbook");
await una.getByRole("button", { name: "All", exact: true }).click();
await una.getByRole("link", { name: /The handbook is empty/ }).click();
await una.getByRole("heading", { name: /The handbook is empty/ }).waitFor();
await una.getByRole("link", { name: "Back to issue list", exact: true }).click();
await query.waitFor();
if (await query.inputValue() !== "handbook" || await una.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("List context was lost on detail back.");
await una.reload();
await query.waitFor();
if (await query.inputValue() !== "handbook" || await una.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("List context was lost on refresh.");
navigationChecks.push({ kind: "issue", query: "handbook", filter: "all", back: true, refresh: true });
await query.fill("");
await una.getByRole("button", { name: "Open", exact: true }).click();
await una.goto(`${record.service}/page/#/issue/${record.issue}`);
await una.getByRole("heading", { name: /The handbook is empty/ }).waitFor();

await shot(una, "issue");
const comment = una.locator('form[data-act="comment"]');
if (await comment.locator("xpath=ancestor::details").count()) throw new Error("Routine comment composer remains hidden in Inspect.");
const draftText = "A local draft that is not submitted.";
await comment.locator('[name="field:body"]').fill(draftText);
await una.goto(`${record.service}/page/#/`);
await una.getByRole("heading", { name: "Issues", exact: true }).waitFor({ state: "attached" });
await una.getByRole("link", { name: /The handbook is empty/ }).click();
await una.getByRole("heading", { name: /The handbook is empty/ }).waitFor();
if (await una.locator('form[data-act="comment"] [name="field:body"]').inputValue() !== draftText) throw new Error("Comment draft was lost during room navigation.");

const rita = await as("rita");
await rita.goto(`${record.service}/page/#/change/${record.agents}`);
await rita.getByRole("heading", { name: /Rules for agents/ }).waitFor();
const primaryReview = rita.locator('[data-action-slot="next"] form[data-act="review-verdict"]');
await primaryReview.getByRole("button", { name: "Review change", exact: true }).waitFor();
if (await primaryReview.locator("xpath=ancestor::details").count()) throw new Error("Qualified review is hidden in Inspect.");
const reviewManifest = primaryReview.locator('[name="field:manifest"]');
if (await reviewManifest.inputValue() !== String(record.manifest)) throw new Error("Primary review changed selected version.");
taskChecks.push({ task: "Review change", role: "recorded admin nonauthor", inlinePrimary: true, exactManifest: record.manifest, submitted: false });
await shot(rita, "change-primary-review");

const paul = await as("paul");
await paul.goto(`${record.service}/page/#/change/${record.agents}`);
await paul.getByRole("heading", { name: /Rules for agents/ }).waitFor();

const review = paul.locator('form[data-act="review-verdict"]');
// Own-author review is offered only in the inspection surface. This still
// displays the native recorder refusal through path-based POST playback; the browser signature/body is not admitted again.
const reviewDetails = paul.locator("details", { has: review });
await reviewDetails.first().locator("summary").first().click();
const nestedReview = reviewDetails.last();
if (await nestedReview.evaluate((element) => !element.open)) await nestedReview.locator("summary").first().click();
const manifest = review.locator('[name="field:manifest"]');
if (await manifest.getAttribute("type") !== "hidden") await manifest.fill(String(record.manifest));
else if (await manifest.inputValue() !== String(record.manifest)) throw new Error("Review form names another version.");
const verdict = review.locator('[name="field:verdict"]');
if (await verdict.evaluate((element) => element.tagName === "SELECT")) await verdict.selectOption("approve");
else await verdict.fill("approve");
const extent = review.locator('[name="field:extent"]');
if (await extent.evaluate((element) => element.tagName === "SELECT")) await extent.selectOption("rules");
else if (await extent.getAttribute("type") !== "hidden") await extent.fill("rules");
else if (await extent.inputValue() !== "rules") throw new Error("Review form names another extent.");
await review.getByRole("button").click();
const lastRequest = paul.locator("details.action-record");
await lastRequest.waitFor();
await lastRequest.locator("summary").click();
await paul.getByRole("status").filter({ hasText: "Known answer for review-verdict" })
  .filter({ hasText: /Refused:.*author-cannot-review/ }).waitFor();
await shot(paul, "change-refused");
await paul.getByText("Inspect change record", { exact: true }).click();
await paul.getByText(/rules-not-met:rules/).first().waitFor();
await shot(paul, "change-refused-record");

await paul.goto(`${record.service}/page/#/change/${record.readme}`);
await paul.getByRole("heading", { name: /Write the handbook/ }).waitFor();

await shot(paul, "change-published");
const sourcePreview = paul.locator("details.source-preview");
const selectedVersion = await sourcePreview.locator(".version-label").textContent();
const currentVersion = (await paul.locator(".detail-meta").textContent())?.match(/Version (\d+)/)?.[1];
if (!currentVersion || selectedVersion !== `Version ${currentVersion} · README.md`) throw new Error("Source preview did not preserve its selected version and file.");
const requestCountBeforePreview = paul.recordedRequests.length;
await sourcePreview.locator("summary").click();
const sourceCode = await sourcePreview.locator("pre code").textContent();
if (sourceCode !== "# The handbook\n\nWritten by the room.\n") throw new Error("Source preview did not show the retained selected-version bytes.");
if (paul.recordedRequests.length !== requestCountBeforePreview) throw new Error("Opening source preview performed another network read.");
previewChecks.push({ selectedVersion, path: "README.md", exactContent: true, extraRequests: 0 });
await shot(paul, "change-source-preview");
const editor = paul.getByRole("region", { name: "Propose a text edit" });
await editor.getByRole("button", { name: "Propose an edit", exact: true }).click();
await editor.getByRole("textbox", { name: "Edited text", exact: true }).fill("# Capture draft\n");
await editor.getByRole("textbox", { name: "Target file path", exact: true }).fill("docs/capture.md");
const beforePreparePosts = paul.recordedRequests.filter(request => request.method === "POST" && request.url.endsWith("/acts")).length;
await editor.getByRole("button", { name: "Prepare proposal", exact: true }).click();
await editor.getByRole("button", { name: "Confirm new proposal", exact: true }).waitFor();
if (!await editor.getByText(/Current file comparison is unavailable/).first().isVisible() || !await editor.getByText(/may overwrite existing content/).first().isVisible() || !await editor.getByText(/Reloading or closing it loses/).isVisible()) throw new Error("Editor preparation omitted its actual limits.");
if (paul.recordedRequests.filter(request => request.method === "POST" && request.url.endsWith("/acts")).length !== beforePreparePosts) throw new Error("Prepare proposal performed a mutation.");
taskChecks.push({ task: "Prepare retained-text proposal", originalSource: selectedVersion, target: "docs/capture.md", comparisonUnavailable: true, overwriteWarning: true, oldPathRetained: true, loadedPageRecoveryOnly: true, mutationPosts: 0, confirmed: false });
await shot(paul, "change-editor-prepared");
await editor.getByRole("button", { name: "Back to edit", exact: true }).click();


await paul.goto(`${record.service}/page/#/rules`);
await paul.getByRole("heading", { name: "Rules", exact: true }).waitFor();

await shot(paul, "rules");

// Latest-site navigation is separate from the recorded version. It makes
// no immutable-preview claim; the current view explicitly refuses one.
await paul.goto(`${record.service}/page/#/change/${record.readme}`);
await paul.getByRole("heading", { name: /Write the handbook/ }).waitFor();
await paul.getByRole("link", { name: "Pages", exact: true }).filter({ visible: true }).click();
await paul.getByRole("heading", { name: "The handbook" }).waitFor();
await shot(paul, "site-readme");

// Same room and native recorded answers at phone and narrow widths. No
// sample state or provider outcome is substituted for the responsive view.
for (const width of [390, 320]) {
  const phone = await as("una", { width, height: 844 });
  await phone.goto(`${record.service}/page/#/`);
  await phone.getByRole("heading", { name: "Issues", exact: true }).waitFor({ state: "attached" });
  await phone.getByRole("link", { name: /The handbook is empty/ }).waitFor();
  await shot(phone, width === 390 ? "issues-mobile" : "issues-narrow");
  await phone.locator('[data-action-slot="create"]').getByRole("button", { name: "Create issue", exact: true }).click();
  await phone.getByRole("dialog", { name: "Create issue", exact: true }).waitFor();
  await shot(phone, width === 390 ? "create-issue-mobile" : "create-issue-narrow");
  await phone.keyboard.press("Escape");
  await phone.getByRole("link", { name: /The handbook is empty/ }).click();
  await phone.getByRole("heading", { name: /The handbook is empty/ }).waitFor();
  await shot(phone, width === 390 ? "issue-mobile" : "issue-narrow");
}
const dark = await as("paul", { width: 390, height: 844, colorScheme: "dark" });
await dark.goto(`${record.service}/page/#/rules`);
await dark.getByRole("heading", { name: "Rules", exact: true }).waitFor();
await shot(dark, "rules-mobile-dark");

const zoom = await as("una", { width: 1024, height: 800 });
await zoom.goto(`${record.service}/page/#/`);
await zoom.getByRole("link", { name: /The handbook is empty/ }).waitFor();
// CSS zoom is a layout magnification witness, not OS/browser accessibility zoom.
await zoom.evaluate(() => { document.documentElement.style.zoom = "2"; });
await shot(zoom, "issues-layout-zoom-200");
keyboardChecks.push({ flow: "Issues", layoutZoom: "200% CSS", physicalBrowserZoom: false });

for (const context of contexts) await context.close();
await browser.close();
if (consoleErrors.length > 0) throw new Error(`Browser errors: ${JSON.stringify(consoleErrors)}`);
writeFileSync(join(out, "checks.json"), `${JSON.stringify({
  source, sourceTree, fixture: record.fixture, playwrightVersion, browserVersion,
  executablePath: browserPath, fallback: "Browser plugin not available", layoutChecks,
  consoleErrors, expectedNetworkRefusals, unanswered, previewChecks, taskChecks, navigationChecks, keyboardChecks, playbackBoundary: "Recorded native replies; POST replay is keyed by route and does not verify the browser intent/signature or re-admit it",
}, null, 2)}\n`);
if (unanswered.length > 0) throw new Error(`The browser asked for what the recorder did not read: ${unanswered.join("; ")}`);
for (const [name, size] of sizes) if (size > MOST) throw new Error(`${name}.png is ${size} bytes, over ${MOST}.`);
const shows = {
  "create-issue-desktop": "Create issue task dialog at desktop width, showing title/body and Escape/focus return without submitting.",
  "create-issue-mobile": "Create issue task dialog at390px, no mutation submitted.",
  "create-issue-narrow": "Create issue task dialog at320px, checked editable text and overflow.",
  "change-primary-review": "Recorded nonauthor admin sees Review change in the main next-action slot, exact selected version; no browser POST submitted.",
  "change-editor-prepared": "Retained-text draft preparation from recorded authenticated reads, warnings and named base; no new proposal confirmed or mutation submitted.",
  "issues-layout-zoom-200": "Issues at200% CSS magnification; not physical browser zoom or assistive-technology acceptance.",
  "issues-desktop": "The actual room’s Issues list at 1024 CSS pixels, from recorded native room answers.",
  issue: "Signed in as @una (who joined on the page with an invitation link): the issue she opened through the page, paul's comment, and the acts she may sign on it.",
  "change-refused": "Signed in as @paul: the change that AGENTS.md is, waiting for the rules extent's approval (policy not met), its one-file version, the merge the destination refused (rules-not-met:rules), and paul's own review refused by the lane, author-cannot-review.",
  "change-refused-record": "The same refusal with Inspect change record expanded, retaining native policy refusal and outside operation history separately from the main condition.",
  "change-published": "Signed in as @paul in the current CLI @3-destination recorder fixture with the legacy one-file change declaration: the recorded README.md change, merged result and selected retained source; Pages remains latest navigation, not an immutable result link.",
  "change-source-preview": "The selected README.md version’s authenticated retained source text, opened locally without an additional network read; this is not a rendered GitHub-Flavored Markdown or HEAD preview.",
  rules: "Signed in as @paul: the rules of this room, who may change them, and that paul may sign no act that changes them.",
  "site-readme": "README.md as the site route renders the latest published branch, reached by the separate Pages navigation; this is not an immutable version preview.",
  "issues-mobile": "The room’s Issues list at 390 CSS pixels, from the same recorded native room answers.",
  "issues-narrow": "The same Issues list at 320 CSS pixels, checked for horizontal overflow.",
  "issue-mobile": "The recorded issue opened from its list at 390 CSS pixels.",
  "issue-narrow": "The recorded issue opened from its list at 320 CSS pixels.",
  "rules-mobile-dark": "The same recorded room rules at 390 CSS pixels with a dark color scheme.",
};
writeFileSync(join(out, "README.md"), [
  "# Screenshots of the page",
  "",
  "Written by `node packages/page/test/screens.mjs`, which says how they are made: the page as the scope Worker serves it at",
  "`/page/`, in Chromium, answered with the test Worker's recorded answers in the demo story, after README.md is published and",
  "while AGENTS.md waits for the controller.",
  "These files describe this recorder invocation only. Browser POST replies are played by route; no browser intent/signature is verified or admitted again. Native form acceptance belongs to separate real-scope witnesses. They establish no live deployment or immutable rendered version acceptance.",
  `Source at invocation: \`${source}\`; tree \`${sourceTree}\`. Uncommitted shared source, if present, is not described as that committed tree.`,
  `Recorded fixture: destination ${record.fixture?.destinationDefinition ?? "unreported"}; change ${record.fixture?.changeDefinition ?? "unreported"}; ${record.fixture?.workflow ?? "unreported"}.`,
  `Environment: Playwright ${playwrightVersion}, Chromium ${browserVersion}; desktop 1024px, phones 390px/320px, dark Rules, Create issue dialog, inline comment/primary review, editor preparation, list back/refresh and 200% CSS layout zoom. Browser plugin not available.`,
  "The flow under test is: recorded current CLI cohort with legacy one-file change → Create issue dialog cancellation → list query/detail/back/refresh → inline comment draft → primary nonauthor review presentation → own-review refusal playback → retained editor preparation → latest Pages navigation. No new proposal is confirmed or published by browser playback.",
  "",
  "| File | Shows | Bytes |",
  "|---|---|---:|",
  ...sizes.map(([name, size]) => `| \`${name}.png\` | ${shows[name]} | ${size} |`),
  "",
  "## Design-rule witness map",
  "",
  "This map names the evidence available from this recorder. It does not extend the test Worker's stand-ins into live-provider acceptance.",
  "",
  "| Rule | Recorder evidence and limit |",
  "|---|---|",
  "| 1. One default home | issues-desktop/mobile and change-published: visible room switch and selected navigation; inspect record carries deeper native facts. `view.test.ts` “ordinary screens omit empty record panels” and “issue and rules keep their subject once” cover DOM duplication; visual inspection is still required. |",
  "| 2. Controls explain actions | Create issue cancellation, inline comment draft and primary nonauthor Review change are exercised; own-review POST replays a recorded native refusal without admitting the browser signature. `actions.test.ts` “review submits the exact observed version and typed controls once” covers the submitted subject and inspection fallback. |",
  "| 3. Consistent outcome language | change-published comes from the recorded lane/destination publication, not an internal operation success. change-refused retains the native guard refusal. `view.test.ts` “one current condition follows the selected version” rejects internal-operation and older-version success. |",
  "| 4. Requirements at decisions | change-refused exercises the actual author-cannot-review answer. `actions.test.ts` “unknown submission offers only a read refresh” blocks mutations in an unknown result; this recorder does not invent a native unknown outcome. |",
  "| 5. Content over notices | issue records Paul’s real comment and the actual room’s issue; visual inspection checks presentation. `view.test.ts` “ordinary screens omit empty record panels” covers empty metadata. Create issue dialog is exercised without submission; native creation admission and rule-save acceptance remain separate. |",
  "| 6. Real affordances | Pages is separate latest navigation. Open latest page remains the accurate Page link; immutable Site proof can exist independently but no selected-version Page link is claimed here. `actions.test.ts` “a single eligible choice is fixed” covers removal of a false picker. |",
  "| 7. Preserve subject | Review form is checked against the recorded manifest and rules extent before sending. Published/source-preview screenshots identify and check the selected recorded version and retained content, opening without new network reads; latest Pages makes no immutable claim. `shell.test.ts` “a late read from the previous room cannot replace the active room” and the comment-draft navigation interaction cover scope preservation. |",
  "| 8. Designed narrow layouts | issues/issue at 390px and 320px, dark Rules at 390px; checks.json records overflow and editable-text checks. Create issue Escape/focus return and 200% CSS layout zoom are recorded; physical zoom, virtual keyboard and assistive technology remain separate. |",
  "",
].join("\n"));
console.log(sizes.map(([name, size]) => `${name}.png ${size} bytes`).join("\n"));
