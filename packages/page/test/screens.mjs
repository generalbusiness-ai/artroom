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
// An act is answered by its path, so the refusal the browser sees is the one the Worker gave to the same act signed in the
// recorder; a session request is answered by its path and the key that asks. A request the recorder did not make fails the script.
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

execFileSync("npm", ["run", "build"], { cwd: page, stdio: "inherit" });
const log = execFileSync("npx", ["vitest", "run", "--project", "scope", "page/test/record", "--silent=false", "--reporter=verbose"], {
  cwd: root, env: { ...process.env, PAGE_RECORD: "1" }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
});
const parts = [...log.matchAll(/^PAGE-RECORD (\d+) (\S+)$/gm)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]);
if (parts.length === 0 || !/^PAGE-RECORD end$/m.test(log)) throw new Error("The recorder printed no whole record.");
const record = JSON.parse(Buffer.from(parts.join(""), "base64url").toString("utf8"));

const browser = await chromium.launch({ executablePath: browserPath });
const browserVersion = browser.version();
const unanswered = [];
const sizes = [];
const consoleErrors = [];
const layoutChecks = [];
const contexts = [];
const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
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
  tab.on("pageerror", (error) => consoleErrors.push(error.message));
  tab.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
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
    controls: [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter((element) => element.getBoundingClientRect().width > 0)
      .map((element) => ({ name: element.getAttribute("name"), fontSize: parseFloat(getComputedStyle(element).fontSize) })),
  }));
  if (!check.meaningful || check.overlay || check.horizontalOverflow) throw new Error(`${name}: invalid rendered layout ${JSON.stringify(check)}`);
  if (viewport.width <= 390 && check.controls.some((control) => control.fontSize < 16)) throw new Error(`${name}: editable phone text is smaller than 16px.`);
  layoutChecks.push({ name, url: tab.url(), viewport, ...check });
  await tab.screenshot({ path: file, ...(height ? { clip: { x: 0, y: 0, width: viewport.width, height } } : { fullPage: true }) });
  sizes.push([name, statSync(file).size]);
};

const una = await as("una");
await una.goto(`${record.service}/page/#/`);
await una.getByRole("heading", { name: "Issues", exact: true }).waitFor({ state: "attached" });
await una.getByRole("link", { name: /The handbook is empty/ }).waitFor();
await shot(una, "issues-desktop");
await una.goto(`${record.service}/page/#/issue/${record.issue}`);
await una.getByRole("heading", { name: /The handbook is empty/ }).waitFor();

await shot(una, "issue");
const comment = una.locator('form[data-act="comment"]');
const commentDetails = una.locator("details", { has: comment }).last();
await commentDetails.locator("summary").first().click();
const draftText = "A local draft that is not submitted.";
await comment.locator('[name="field:body"]').fill(draftText);
await una.goto(`${record.service}/page/#/`);
await una.getByRole("heading", { name: "Issues", exact: true }).waitFor({ state: "attached" });
await una.getByRole("link", { name: /The handbook is empty/ }).click();
await una.getByRole("heading", { name: /The handbook is empty/ }).waitFor();
await una.locator("details", { has: una.locator('form[data-act="comment"]') }).last().locator("summary").first().click();
if (await una.locator('form[data-act="comment"] [name="field:body"]').inputValue() !== draftText) throw new Error("Comment draft was lost during room navigation.");

const paul = await as("paul");
await paul.goto(`${record.service}/page/#/change/${record.agents}`);
await paul.getByRole("heading", { name: /Rules for agents/ }).waitFor();

const review = paul.locator('form[data-act="review-verdict"]');
// Own-author review is offered only in the inspection surface. This still
// submits the real recorded signed act and displays its guard refusal.
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
  await phone.getByRole("link", { name: /The handbook is empty/ }).click();
  await phone.getByRole("heading", { name: /The handbook is empty/ }).waitFor();
  await shot(phone, width === 390 ? "issue-mobile" : "issue-narrow");
}
const dark = await as("paul", { width: 390, height: 844, colorScheme: "dark" });
await dark.goto(`${record.service}/page/#/rules`);
await dark.getByRole("heading", { name: "Rules", exact: true }).waitFor();
await shot(dark, "rules-mobile-dark");

for (const context of contexts) await context.close();
await browser.close();
if (consoleErrors.length > 0) throw new Error(`Browser errors: ${consoleErrors.join("; ")}`);
writeFileSync(join(out, "checks.json"), `${JSON.stringify({
  source, sourceTree, playwrightVersion, browserVersion,
  executablePath: browserPath, fallback: "Browser plugin not available", layoutChecks,
  consoleErrors, unanswered,
}, null, 2)}\n`);
if (unanswered.length > 0) throw new Error(`The browser asked for what the recorder did not read: ${unanswered.join("; ")}`);
for (const [name, size] of sizes) if (size > MOST) throw new Error(`${name}.png is ${size} bytes, over ${MOST}.`);
const shows = {
  "issues-desktop": "The actual room’s Issues list at 1024 CSS pixels, from recorded native room answers.",
  issue: "Signed in as @una (who joined on the page with an invitation link): the issue she opened through the page, paul's comment, and the acts she may sign on it.",
  "change-refused": "Signed in as @paul: the change that AGENTS.md is, waiting for the rules extent's approval (policy not met), its one-file version, the merge the destination refused (rules-not-met:rules), and paul's own review refused by the lane, author-cannot-review.",
  "change-refused-record": "The same refusal with Inspect change record expanded, retaining native policy refusal and outside operation history separately from the main condition.",
  "change-published": "Signed in as @paul: the change that rita's artroom edit README.md made, merged and published, its one-file version and recorded publication commit; immutable version rendering is unavailable, with separate Pages navigation to the latest site.",
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
  "These files describe this recorder invocation only; they do not establish a live deployment or immutable version preview.",
  `Source at invocation: \`${source}\`; tree \`${sourceTree}\`. Uncommitted shared source, if present, is not described as that committed tree.`,
  `Environment: Playwright ${playwrightVersion}, Chromium ${browserVersion}; desktop 1024px, phones 390px and 320px, dark Rules. Browser plugin not available.`,
  "The flow under test is: recorded room → issue/list navigation → native refused own-review → confirmed change → latest Pages navigation.",
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
  "| 1. One default home | issues-desktop/mobile and change-published: visible room switch and selected navigation; inspect record carries deeper native facts. Visual inspection is required to judge duplication. |",
  "| 2. Controls explain actions | issue and change-refused: real action controls; the own-review submission exercises Review change. Unsupported affordances are omitted by production views. |",
  "| 3. Consistent outcome language | change-published comes from the recorded lane/destination publication, not an internal operation success. change-refused retains the native guard refusal. |",
  "| 4. Requirements at decisions | change-refused exercises the actual author-cannot-review answer. Unknown outcomes require separate acceptance witnesses; this recorder does not invent one. |",
  "| 5. Content over notices | issue records Paul’s real comment and the actual room’s issue; visual inspection checks presentation. Creation and rule-save behavior are outside this recorder. |",
  "| 6. Real affordances | Pages is separate latest navigation. No exact-version Open page is shown because immutable selected-version rendering is unsupported in this source. |",
  "| 7. Preserve subject | Review form is checked against the recorded manifest and rules extent before sending. Published screenshot identifies the selected recorded version; latest Pages makes no immutable claim. |",
  "| 8. Designed narrow layouts | issues/issue at 390px and 320px, dark Rules at 390px; checks.json records overflow and editable-text checks. Touch target and keyboard checks remain separate. |",
  "",
].join("\n"));
console.log(sizes.map(([name, size]) => `${name}.png ${size} bytes`).join("\n"));
