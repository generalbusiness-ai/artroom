#!/usr/bin/env -S node --import tsx --no-warnings
// The demo's page captures: PNG files of the room's page, in Chromium, for the recording and its rehearsal.
//
//   PLAYWRIGHT_CORE=<directory holding playwright-core> node --import tsx --no-warnings scripts/demo-captures.ts \
//     <base-url> --home <a person's config directory> --room <room.json of demo-run.ts> --out <directory>
//   PLAYWRIGHT_CORE=<...> node --import tsx --no-warnings scripts/demo-captures.ts --recorded --out <directory>
//
// The first form opens the deployment's page at <base-url>/page/, signed in with the key that the config directory keeps (the
// founder's, from demo-run.ts), on the room that room.json names. The second form runs the rehearsal on the test Worker instead
// (`packages/lanes/test/demo.scope.test.ts` with DEMO_RECORD=1) and answers the browser with what the Worker answered there,
// request by request, as `packages/page/test/screens.mjs` does; a request the recorder did not make fails the script.
//
// It saves six captures in the output directory, each at most 300 kB: the room, the issue, the refused change, the published
// change, the rules view, and the page that the edit published as the site renders it. The key goes only into the browser's
// local storage, as the page keeps it; it is never printed.
//
// playwright-core is not a dependency of this repository: install it in a scratch directory, outside the checkout. The browser
// is CHROMIUM, or the chromium under PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers). Without either, the script says it
// skipped and makes no capture: it exits 0 in the recorded form and 2 against a deployment.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { b64url, keyIdOfSecret } from "@generalbusiness/artroom-bytes";
import { fileStore } from "../packages/cli/src/files.ts";
import type { Config } from "../packages/cli/src/store.ts";
import { CAPTURE_CONTEXT, captureBinding, captureSource, initializeCapture, ownerJson, type CaptureObservations } from "./demo/capture-context.ts";
import type { Room } from "./demo/rehearse.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOST = 300 * 1024;
const USAGE = "Usage: scripts/demo-captures.ts <base-url> --home <config directory> --room <room.json> --out <directory>, or scripts/demo-captures.ts --recorded --out <directory>";

/** The few parts of playwright-core that this script uses. */
interface Locator { waitFor(options?: { timeout?: number; state?: "attached" | "visible" }): Promise<void>; first(): Locator }
interface Tab {
  url(): string;
  goto(url: string): Promise<unknown>;
  getByRole(role: string, options: { name: string | RegExp }): Locator;
  getByText(text: string | RegExp): Locator;
  screenshot(options: { path: string }): Promise<unknown>;
  evaluate<T>(f: () => T): Promise<T>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
}
interface Route { request(): { url(): string; method(): string; postData(): string | null }; fulfill(answer: { status: number; headers?: Record<string, string>; contentType?: string; body: string }): Promise<void> }
interface BrowserContext { route(pattern: string, handler: (route: Route) => unknown): Promise<void>; addInitScript<A>(f: (arg: A) => void, arg: A): Promise<void>; newPage(): Promise<Tab> }
interface Browser { newContext(options: object): Promise<BrowserContext>; close(): Promise<void> }
interface Chromium { launch(options: { executablePath: string }): Promise<Browser> }

/** What the browser needs: the service's base URL, the room, the key, and the recorded answers when there is no service. */
interface Sitting { service: string; place: { directory: string; membership: unknown }; room: Room; secret: string; answers: Record<string, { status: number; headers: Record<string, string>; body: string }> | null; observation?: { source: string; config: string; actor: string } }

function browserPath(): string | null {
  if (process.env["CHROMIUM"]) return existsSync(process.env["CHROMIUM"]) ? process.env["CHROMIUM"] : null;
  const base = process.env["PLAYWRIGHT_BROWSERS_PATH"] || "/opt/pw-browsers";
  if (!existsSync(base)) return null;
  const found = readdirSync(base).filter((name) => /^chromium-\d+$/.test(name)).sort().map((name) => join(base, name, "chrome-linux", "chrome")).filter((path) => existsSync(path));
  return found.at(-1) ?? null;
}

function chromiumOf(): Chromium | null {
  const dir = process.env["PLAYWRIGHT_CORE"];
  if (!dir) return null;
  try {
    return (createRequire(join(resolve(dir), "package.json"))("playwright-core") as { chromium: Chromium }).chromium;
  } catch {
    return null;
  }
}

/** The recorded form: the rehearsal on the test Worker, with its answers to the page's reads. */
function recordedSitting(): Sitting {
  const log = execFileSync("npx", ["vitest", "run", "--project", "scope", "lanes/test/demo", "--silent=false", "--reporter=verbose"], {
    cwd: ROOT, env: { ...process.env, DEMO_RECORD: "1" }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  const parts = [...log.matchAll(/^DEMO-RECORD (\d+) (\S+)$/gm)].sort((a, b) => Number(a[1]) - Number(b[1])).map((m) => m[2]);
  if (parts.length === 0 || !/^DEMO-RECORD end$/m.test(log)) throw new Error("The recorder printed no whole record.");
  return JSON.parse(Buffer.from(parts.join(""), "base64url").toString("utf8")) as Sitting;
}

/** The live form: the key and the room from a person's config directory, and the IDs from room.json. */
async function liveSitting(service: string, home: string, roomFile: string): Promise<Sitting> {
  const config = ownerJson(resolve(home), "config.json") as Config;
  const observed = ownerJson(resolve(home), CAPTURE_CONTEXT) as CaptureObservations;
  const room = JSON.parse(readFileSync(roomFile, "utf8")) as Room;
  const bound = captureBinding(config, observed, service, room, captureSource());
  const store = fileStore(resolve(home));
  const secret = await store.secret(config.key);
  if (!secret || keyIdOfSecret(secret) !== bound.actor) throw new Error("Capture key does not match the owner-home observation.");
  return { ...bound, secret: b64url(secret), answers: null, observation: { source: observed.source, config: observed.config, actor: observed.actor } };
}

async function captures(chromium: Chromium, executablePath: string, sitting: Sitting, out: string): Promise<{ name: string; bytes: number }[]> {
  const { service, room } = sitting;
  for (const name of ["directory", "issue", "published", "refused"] as const) if (!room[name]) throw new Error(`room.json names no ${name}: the rehearsal did not get that far.`);
  const browser = await chromium.launch({ executablePath });
  const unanswered: string[] = [];
  const sizes: { name: string; bytes: number }[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
    if (sitting.answers) {
      const answers = sitting.answers;
      await context.route(`${service}/**`, (route) => {
        const request = route.request();
        const path = request.url().slice(service.length);
        const actor = path.endsWith("/sessions") ? ` ${(JSON.parse(request.postData() ?? "{}") as { request?: { actor?: string } }).request?.actor}` : "";
        const answer = answers[`${request.method() === "POST" ? "POST" : "GET"} ${path}${actor}`];
        if (!answer) {
          unanswered.push(`${request.method()} ${path}${actor}`);
          return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not-found" }) });
        }
        return route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body });
      });
    }
    // The page's settings, as it keeps them: the page's own origin, the room, and the key.
    await context.addInitScript(initializeCapture, { service, place: sitting.place, secret: sitting.secret });
    const tab = await context.newPage();
    // The whole content, down to its lowest element and at most 1,400 pixels: the viewport is set to that height for the capture.
    const shot = async (name: string) => {
      const path = join(out, `${name}.png`);
      const bottom = await tab.evaluate(() => Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll("body *")].map((e) => e.getBoundingClientRect().bottom + window.scrollY)));
      await tab.setViewportSize({ width: 1000, height: Math.min(Math.ceil(bottom) + 24, 1400) });
      await tab.screenshot({ path });
      await tab.setViewportSize({ width: 1000, height: 800 });
      sizes.push({ name, bytes: statSync(path).size });
    };
    const screen = async (hash: string, heading: string | RegExp, name: string) => {
      await tab.goto(`${service}/page/#${hash}`);
      if (new URL(tab.url()).origin !== new URL(service).origin || new URL(tab.url()).pathname !== new URL(`${service}/page/`).pathname) throw new Error("Capture document left the configured page address.");
      await tab.getByRole("heading", { name: heading }).first().waitFor({ timeout: 30_000, state: "attached" });
      await tab.getByRole("navigation", { name: "Room" }).first().waitFor({ timeout: 30_000, state: "attached" });
      await shot(name);
    };
    await screen("/", "Issues", "room");
    await screen(`/issue/${room.issue}`, /Add a getting-started page/, "issue");
    await screen(`/change/${room.refused}`, /outside\.md/, "change-refused");
    await screen(`/change/${room.published}`, /guide\/start\.md/, "change-published");
    await screen("/rules", "Rules", "rules");
    await tab.goto(`${service}/site/${room.directory}/HEAD/guide/start.md`);
    if (new URL(tab.url()).origin !== new URL(service).origin || new URL(tab.url()).pathname !== new URL(`${service}/site/${room.directory}/HEAD/guide/start.md`).pathname) throw new Error("Capture document left the configured site address.");
    await tab.getByRole("heading", { name: "Getting started" }).first().waitFor({ timeout: 30_000 });
    await shot("site-page");
  } finally {
    await browser.close();
  }
  if (unanswered.length > 0) throw new Error(`The browser asked for what the recorder did not read: ${unanswered.join("; ")}`);
  const over = sizes.filter((size) => size.bytes > MOST);
  if (over.length > 0) throw new Error(`Over ${MOST} bytes: ${over.map((size) => `${size.name}.png ${size.bytes}`).join(", ")}.`);
  return sizes;
}

const SHOWS: Record<string, string> = {
  room: "The room’s Issues destination, with recorded issue states and the actions the signed-in person may sign on the directory.",
  issue: "Observed issue screen for the rehearsal's issue lane.",
  "change-refused": "Observed change screen for the rehearsal's outside.md lane.",
  "change-published": "Observed change screen for the rehearsal's guide/start.md lane.",
  rules: "The rules of this room, and who may change them.",
  "site-page": "Observed guide/start.md site response. Screenshots do not establish publication receipts.",
};

async function main(argv: readonly string[]): Promise<number> {
  const words: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--recorded") flags.set("recorded", "true");
    else if (arg.startsWith("--")) { const value = argv[++i]; if (value === undefined) { process.stderr.write(`${arg} needs a value.\n${USAGE}\n`); return 2; } flags.set(arg.slice(2), value); }
    else words.push(arg);
  }
  const recorded = flags.has("recorded");
  const out = flags.get("out");
  if (!out || (recorded ? words.length > 0 || flags.has("home") || flags.has("room") : words.length !== 1 || !flags.get("home") || !flags.get("room"))) { process.stderr.write(`${USAGE}\n`); return 2; }
  const executablePath = browserPath();
  const chromium = chromiumOf();
  if (!executablePath || !chromium) {
    process.stdout.write(`Skipped: ${!chromium ? "no playwright-core: set PLAYWRIGHT_CORE to a directory that holds it, installed outside this checkout" : "no Chromium: set CHROMIUM, or PLAYWRIGHT_BROWSERS_PATH"}. No capture was made.\n`);
    return recorded ? 0 : 2;
  }
  const sitting = recorded ? recordedSitting() : await liveSitting(words[0]!, flags.get("home")!, flags.get("room")!);
  mkdirSync(resolve(out), { recursive: true });
  const sizes = await captures(chromium, executablePath, sitting, resolve(out));
  writeFileSync(join(resolve(out), "captures.md"), [
    "# Page captures",
    "",
    `Written by scripts/demo-captures.ts ${recorded ? "--recorded: the page answered with the test Worker's recorded answers on the rehearsal's room" : `against ${sitting.service}, on the room bound to the selected owner home`}, in Chromium. These are screen observations. Authoritative outcome and publication proof must be established separately from retained native histories and receipts; this capture does not establish it.`,
    "",
    ...(sitting.observation ? [`Capture association: source ${sitting.observation.source}; config ${sitting.observation.config}; actor ${sitting.observation.actor}; directory ${sitting.place.directory}; membership ${JSON.stringify(sitting.place.membership)}; lane IDs ${JSON.stringify(sitting.room)}.`, ""] : []),
    "| File | Shows | Bytes |",
    "|---|---|---:|",
    ...sizes.map((size) => `| \`${size.name}.png\` | ${SHOWS[size.name]} | ${size.bytes} |`),
    "",
  ].join("\n"));
  process.stdout.write(`${sizes.map((size) => `${size.name}.png ${size.bytes} bytes`).join("\n")}\n`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
