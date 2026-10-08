// The page's screenshots: the issue, the change with a refusal, and the rules view, rendered by a real browser.
//
//   PLAYWRIGHT_CORE=<a directory holding playwright-core> [CHROMIUM=<a chromium executable>] node packages/page/test/screens.mjs
//
// playwright-core is not a dependency of this repository: install it in a scratch directory, outside the checkout. The browser
// is the one PLAYWRIGHT_BROWSERS_PATH holds, or CHROMIUM.
//
// What the browser talks to. No service runs here. The script runs the recorder, `record.scope.test.ts`, with PAGE_RECORD=1: the
// story on real scopes in the test Worker, to the point where the first merge was not reserved, with every read of the page's
// screens and una's refused review sent through the Worker's HTTP routes. The browser is then answered with those recorded
// answers, request by request. An act is answered by its path, so the refusal the browser sees is the one the Worker gave to the
// same act signed in the recorder. A request the recorder did not make fails the script. The page itself is built first, and is
// the page as built.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
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
const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
const unanswered = [];
await context.route(`${record.service}/**`, (route) => {
  const request = route.request();
  const path = request.url().slice(record.service.length);
  const answer = record.answers[request.method() === "POST" ? `POST ${path}` : `GET ${path}`];
  if (!answer) {
    unanswered.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not-found" }) });
  }
  return route.fulfill({ status: answer.status, contentType: "application/json", body: answer.body });
});
await context.route("http://page.test/**", (route) => {
  const name = new URL(route.request().url()).pathname === "/page.js" ? "page.js" : "index.html";
  return route.fulfill({ status: 200, contentType: name === "page.js" ? "text/javascript" : "text/html", body: readFileSync(join(page, "dist", name)) });
});
await context.addInitScript((kept) => localStorage.setItem("artroom-page", JSON.stringify(kept)), { service: record.service, directory: record.directory, secret: record.secret });

const tab = await context.newPage();
mkdirSync(out, { recursive: true });
const shot = async (name) => {
  const file = join(out, `${name}.png`);
  await tab.screenshot({ path: file, fullPage: true });
  return [name, statSync(file).size];
};
const sizes = [];

await tab.goto(`http://page.test/#/issue/${record.issue}`);
await tab.getByRole("heading", { name: /The parser drops comments/ }).waitFor();
await tab.getByText("What you may do here").waitFor();
sizes.push(await shot("issue"));

await tab.goto(`http://page.test/#/change/${record.change}`);
await tab.getByText("What you may do here").waitFor();
const review = tab.locator('form[data-act="review-verdict"]');
await tab.locator("details", { has: review }).locator("summary").click();
await review.locator('input[name="field:manifest"]').fill(String(record.manifest));
await review.locator('input[name="field:verdict"]').fill("approve");
await review.locator('input[name="field:extent"]').fill("source");
await review.getByRole("button").click();
await tab.locator(".answer.bad").waitFor();
sizes.push(await shot("change-refused"));

await tab.goto("http://page.test/#/rules");
await tab.getByRole("heading", { name: "The rules of this room" }).waitFor();
await tab.getByText("What you may do here").waitFor();
sizes.push(await shot("rules"));

await browser.close();
if (unanswered.length > 0) throw new Error(`The browser asked for what the recorder did not read: ${unanswered.join("; ")}`);
for (const [name, size] of sizes) if (size > MOST) throw new Error(`${name}.png is ${size} bytes, over ${MOST}.`);
writeFileSync(join(out, "README.md"), [
  "# Screenshots of the page",
  "",
  "Written by `node packages/page/test/screens.mjs`, which says how they are made: the page as built, in Chromium, answered with",
  "the test Worker's recorded answers at the point in the demo story where the first merge was not reserved. Signed in as @una.",
  "",
  "| File | Shows | Bytes |",
  "|---|---|---:|",
  ...sizes.map(([name, size]) => `| \`${name}.png\` | ${{ issue: "The issue, with its comment, assignee and state, and the acts una may sign on it.", "change-refused": "The change: where it stands (policy not met for the rules extent), its review by extent, the refused merge with the destination's operations, and una's own review refused by the lane, author-cannot-review.", rules: "The rules of this room, who may change them, and that una may sign no act on the rules scope." }[name]} | ${size} |`),
  "",
].join("\n"));
console.log(sizes.map(([name, size]) => `${name}.png ${size} bytes`).join("\n"));
