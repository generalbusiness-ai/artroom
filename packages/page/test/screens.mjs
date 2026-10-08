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
const { chromium } = createRequire(join(process.env.PLAYWRIGHT_CORE, "package.json"))("playwright-core");
const browserPath = process.env.CHROMIUM ?? join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers", "chromium-1194/chrome-linux/chrome");

execFileSync("npm", ["run", "build"], { cwd: page, stdio: "inherit" });
const log = execFileSync("npx", ["vitest", "run", "--project", "scope", "page/test/record", "--silent=false", "--reporter=verbose"], {
  cwd: root, env: { ...process.env, PAGE_RECORD: "1" }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
});
const parts = [...log.matchAll(/^PAGE-RECORD (\d+) (\S+)$/gm)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]);
if (parts.length === 0 || !/^PAGE-RECORD end$/m.test(log)) throw new Error("The recorder printed no whole record.");
const record = JSON.parse(Buffer.from(parts.join(""), "base64url").toString("utf8"));

const browser = await chromium.launch({ executablePath: browserPath });
const unanswered = [];
const sizes = [];
mkdirSync(out, { recursive: true });

/** A browser context signed in as one person: the page's settings kept as the page keeps them, every request answered from the record. */
async function as(person) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
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
  await context.addInitScript((kept) => localStorage.setItem("artroom-page", JSON.stringify(kept)), { service: "", place: record.place, secret: record.people[person] });
  return context.newPage();
}
/** A screenshot of the whole page, or of its top `height` pixels. */
const shot = async (tab, name, height = null) => {
  const file = join(out, `${name}.png`);
  await tab.screenshot({ path: file, ...(height ? { clip: { x: 0, y: 0, width: 1000, height } } : { fullPage: true }) });
  sizes.push([name, statSync(file).size]);
};

const una = await as("una");
await una.goto(`${record.service}/page/#/issue/${record.issue}`);
await una.getByRole("heading", { name: /The handbook is empty/ }).waitFor();
await una.getByText("What you may do here").waitFor();
await shot(una, "issue");

const paul = await as("paul");
await paul.goto(`${record.service}/page/#/change/${record.agents}`);
await paul.getByRole("heading", { name: /Rules for agents/ }).waitFor();
await paul.getByText("What you may do here").waitFor();
const review = paul.locator('form[data-act="review-verdict"]');
await paul.locator("details", { has: review }).locator("summary").click();
await review.locator('input[name="field:manifest"]').fill(String(record.manifest));
await review.locator('input[name="field:verdict"]').fill("approve");
await review.locator('input[name="field:extent"]').fill("rules");
await review.getByRole("button").click();
await paul.getByRole("status").filter({ hasText: "Known answer for review-verdict" })
  .filter({ hasText: /Refused:.*author-cannot-review/ }).waitFor();
await shot(paul, "change-refused");

await paul.goto(`${record.service}/page/#/change/${record.readme}`);
await paul.getByRole("heading", { name: /Write the handbook/ }).waitFor();
await paul.getByText("What you may do here").waitFor();
await shot(paul, "change-published", 1500);

await paul.goto(`${record.service}/page/#/rules`);
await paul.getByRole("heading", { name: "The rules of this room" }).waitFor();
await paul.getByText("What you may do here").waitFor();
await shot(paul, "rules");

// Latest-site navigation is separate from the recorded version. It makes
// no immutable-preview claim; the current view explicitly refuses one.
await paul.goto(`${record.service}/page/#/change/${record.readme}`);
await paul.getByRole("heading", { name: /Write the handbook/ }).waitFor();
await paul.getByText("Rendering this published version is not available yet.", { exact: true }).waitFor();
await paul.getByRole("link", { name: "Latest published site", exact: true }).click();
await paul.getByRole("heading", { name: "The handbook" }).waitFor();
await shot(paul, "site-readme");

await browser.close();
if (unanswered.length > 0) throw new Error(`The browser asked for what the recorder did not read: ${unanswered.join("; ")}`);
for (const [name, size] of sizes) if (size > MOST) throw new Error(`${name}.png is ${size} bytes, over ${MOST}.`);
const shows = {
  issue: "Signed in as @una (who joined on the page with an invitation link): the issue she opened through the page, paul's comment, and the acts she may sign on it.",
  "change-refused": "Signed in as @paul: the change that AGENTS.md is, waiting for the rules extent's approval (policy not met), its one-file version, the merge the destination refused (rules-not-met:rules), and paul's own review refused by the lane, author-cannot-review.",
  "change-published": "Signed in as @paul: the change that rita's artroom edit README.md made, merged and published, its one-file version and recorded publication commit; immutable version rendering is unavailable, with separate latest-site navigation (the top 1,500 pixels).",
  rules: "Signed in as @paul: the rules of this room, who may change them, and that paul may sign no act that changes them.",
  "site-readme": "README.md as the site route renders the latest published branch, reached by the separate Latest published site link; this is not an immutable version preview.",
};
writeFileSync(join(out, "README.md"), [
  "# Screenshots of the page",
  "",
  "Written by `node packages/page/test/screens.mjs`, which says how they are made: the page as the scope Worker serves it at",
  "`/page/`, in Chromium, answered with the test Worker's recorded answers in the demo story, after README.md is published and",
  "while AGENTS.md waits for the controller.",
  "These files describe this recorder invocation only; they do not establish a live deployment or immutable version preview.",
  "",
  "| File | Shows | Bytes |",
  "|---|---|---:|",
  ...sizes.map(([name, size]) => `| \`${name}.png\` | ${shows[name]} | ${size} |`),
  "",
].join("\n"));
console.log(sizes.map(([name, size]) => `${name}.png ${size} bytes`).join("\n"));
