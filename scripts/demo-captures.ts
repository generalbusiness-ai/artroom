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
import type { ScopeRef, SignedIntent, SignedRead } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, keyIdOfSecret, textDigest, verifySignedIntent, verifySignedRead } from "@generalbusiness/artroom-bytes";
import { fileStore } from "../packages/cli/src/files.ts";
import type { Config } from "../packages/cli/src/store.ts";
import { CAPTURE_CONTEXT, captureBinding, captureSource, initializeCapture, ownerJson, type CaptureObservations } from "./demo/capture-context.ts";
import type { Room } from "./demo/rehearse.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOST = 300 * 1024;
const USAGE = "Usage: scripts/demo-captures.ts <base-url> --home <config directory> --room <room.json> --out <directory>, or scripts/demo-captures.ts --recorded --out <directory>";

/** The few parts of playwright-core that this script uses. */
interface Locator {
  waitFor(options?: { timeout?: number; state?: "attached" | "visible" | "hidden" }): Promise<void>;
  first(): Locator; click(): Promise<void>; dblclick(): Promise<void>; fill(value: string): Promise<void>;
  count(): Promise<number>; isDisabled(): Promise<boolean>; filter(options: { visible: boolean }): Locator;
  evaluate<T>(f: (element: HTMLElement) => T): Promise<T>;
  inputValue(): Promise<string>; textContent(): Promise<string | null>;
  locator(selector: string): Locator;
  getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator;
}
interface Tab {
  url(): string;
  keyboard: { press(key: string): Promise<void> };
  waitForFunction(f: () => boolean): Promise<unknown>;
  on(event: "pageerror", listener: (error: Error) => void): void;
  on(event: "console", listener: (message: { type(): string; text(): string; location(): { url?: string } }) => void): void;
  on(event: "request", listener: (request: { method(): string; url(): string }) => void): void;
  reload(): Promise<unknown>;
  locator(selector: string): Locator;
  goto(url: string): Promise<unknown>;
  getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator;
  getByText(text: string | RegExp): Locator;
  screenshot(options: { path: string }): Promise<unknown>;
  evaluate<T>(f: () => T): Promise<T>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
}
interface Route { abort(reason: string): Promise<void>; request(): { url(): string; method(): string; postData(): string | null; headers(): Record<string, string> }; fulfill(answer: { status: number; headers?: Record<string, string>; contentType?: string; body: string }): Promise<void> }
interface BrowserContext { close(): Promise<void>; route(pattern: string, handler: (route: Route) => unknown): Promise<void>; addInitScript<A>(f: (arg: A) => void, arg: A): Promise<void>; newPage(): Promise<Tab> }
interface Browser { newContext(options: object): Promise<BrowserContext>; close(): Promise<void> }
interface Chromium { launch(options: { executablePath: string }): Promise<Browser> }

/** What the browser needs: the service's base URL, the room, the key, and the recorded answers when there is no service. */
interface ClaimActorRecord { recordedName?: string | null; place: { directory: string; membership: unknown }; secret: string; actor: string; answers: NonNullable<Sitting["answers"]> }
interface Sitting { claimWitness?: { register: ScopeRef; definition: string; founder: ClaimActorRecord; member: ClaimActorRecord & { refusal: string } }; service: string; place: { directory: string; membership: unknown }; room: Room; secret: string; answers: Record<string, { status: number; headers: Record<string, string>; body: string }> | null; observation?: { source: string; config: string; actor: string } }

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
  let log: string;
  try {
    log = execFileSync("npx", ["vitest", "run", "--project", "scope", "lanes/test/demo", "--silent=false", "--reporter=verbose"], {
      cwd: ROOT, env: { ...process.env, DEMO_RECORD: "1" }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    // The recorder's stdout contains ephemeral signing secrets. A child-process
    // Error includes that stdout, so it must never become a public diagnostic.
    const status = (error as { status?: number }).status;
    throw new Error(`The native demo recorder failed (exit ${status ?? "unknown"}); no private record was exported. Inspect the focused producer tests separately.`);
  }
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
  const consoleErrors: string[] = [];
  const checks: unknown[] = [];
  const interactions: unknown[] = [];
  const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: ROOT, encoding: "utf8" }).trim();
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
    const posted: string[] = [];
    tab.on("request", (request) => { if (request.method() === "POST") posted.push(request.url()); });
    tab.on("pageerror", (error) => consoleErrors.push(error.message));
    tab.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    // The whole content, down to its lowest element and at most 1,400 pixels: the viewport is set to that height for the capture.
    const shot = async (name: string) => {
      const path = join(out, `${name}.png`);
      const bottom = await tab.evaluate(() => Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll("body *")].map((e) => e.getBoundingClientRect().bottom + window.scrollY)));
      await tab.setViewportSize({ width: 1000, height: Math.min(Math.ceil(bottom) + 24, 1400) });
      const check = await tab.evaluate(() => ({ title: document.title,
        meaningful: !!document.querySelector("main")?.textContent?.trim(),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        overlay: !!document.querySelector("vite-error-overlay, nextjs-portal"),
      }));
      if (!check.meaningful || check.horizontalOverflow || check.overlay || (new URL(tab.url()).pathname === "/page/" && check.title !== "Artroom")) throw new Error(`Invalid rendered capture ${name}: ${JSON.stringify(check)}`);
      checks.push({ name, url: tab.url(), width: 1000, ...check });
      await tab.screenshot({ path });
      await tab.setViewportSize({ width: 1000, height: 800 });
      sizes.push({ name, bytes: statSync(path).size });
    };
    const screen = async (hash: string, heading: string | RegExp, name: string) => {
      await tab.goto(`${service}/page/#${hash}`);
      if (new URL(tab.url()).origin !== new URL(service).origin || new URL(tab.url()).pathname !== new URL(`${service}/page/`).pathname) throw new Error("Capture document left the configured page address.");
      await tab.getByRole("heading", { name: heading }).first().waitFor({ timeout: 30_000, state: "attached" });
      await tab.getByRole("navigation", { name: "Room" }).first().waitFor({ timeout: 30_000, state: "attached" });
      if (name === "room") {
        await tab.getByRole("button", { name: "All" }).click();
        await tab.getByRole("link", { name: /Add a getting-started page/ }).waitFor({ timeout: 30_000 });
        interactions.push({ name: "show recorded closed issue in All filter", scope: room.issue });
      }
      if (name === "rules") {
        const form = tab.locator("form.rules-editor");
        const approvals = form.locator('[name="approvals"]');
        const before = await approvals.inputValue();
        const after = String(Number(before) + 1);
        const requestsBefore = posted.length;
        await approvals.fill(after);
        await form.getByRole("button", { name: "Save changes", exact: true }).click();
        const confirmation = form.locator(".rules-confirmation");
        await confirmation.waitFor({ timeout: 30_000 });
        if (!(await confirmation.textContent())?.includes(`${before}\n→ ${after}`)) throw new Error("Rule confirmation does not name its observed before and edited after values.");
        await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
        await confirmation.waitFor({ state: "hidden" });
        if (posted.length !== requestsBefore) throw new Error("Cancelled rule edit sent a POST request.");
        await tab.reload();
        await tab.getByRole("heading", { name: "Rules" }).waitFor({ timeout: 30_000 });
        if (await tab.locator('form.rules-editor [name="approvals"]').inputValue() !== before) throw new Error("Cancelled rules edit changed the recorded approval count.");
        interactions.push({ name: "rule edit confirmation cancelled", before, after, extraPosts: 0, rereadOriginal: true });
      }
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
  if (consoleErrors.length > 0) throw new Error(`Browser errors: ${consoleErrors.join("; ")}`);
  writeFileSync(join(out, "checks.json"), `${JSON.stringify({ source, sourceTree, service,
    mode: sitting.answers ? "recorded native Worker answers; Git host and scheduler stand-ins" : "deployment",
    browserFallback: "Browser plugin not available", checks, interactions, consoleErrors, unanswered,
  }, null, 2)}\n`);
  if (unanswered.length > 0) throw new Error(`The browser asked for what the recorder did not read: ${unanswered.join("; ")}`);
  const over = sizes.filter((size) => size.bytes > MOST);
  if (over.length > 0) throw new Error(`Over ${MOST} bytes: ${over.map((size) => `${size.name}.png ${size.bytes}`).join(", ")}.`);
  return sizes;
}

/** Production Page UI over actor-bound native read records. Founding transport
 * loss is a labelled stand-in: intercepted requests never reach a Scope. */
async function claimWitness(chromium: Chromium, executablePath: string, sitting: Sitting, out: string): Promise<void> {
  const native = sitting.claimWitness;
  if (!native) throw new Error("The native recorder supplied no actor-bound claim eligibility.");
  const browser = await chromium.launch({ executablePath });
  const errors: string[] = [], explainedNetwork: string[] = [], unanswered: string[] = [];
  const attempts: string[] = [];
  let entered!: () => void, release!: () => void;
  const firstEntered = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const actPath = `/v1/scopes/${native.register.scope}/acts`;
  const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: ROOT, encoding: "utf8" }).trim();
  const watch = (tab: Tab): void => {
    tab.on("pageerror", (error) => errors.push(error.message));
    tab.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      const path = location.url?.startsWith(sitting.service) ? location.url.slice(sitting.service.length) : null;
      if (path === actPath && /net::ERR_FAILED/.test(message.text())) explainedNetwork.push("Intercepted founding request: transport loss stand-in, no Scope admission.");
      else if (path === `/v1/scopes/${native.register.scope}` && /status of 403/.test(message.text())) explainedNetwork.push("Member register read refused in its own native record.");
      else errors.push(message.text());
    });
  };
  const as = async (person: "founder" | "member", width = 390): Promise<BrowserContext> => {
    const actor = native[person];
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
    await context.route(`${sitting.service}/**`, async (route) => {
      const request = route.request();
      const path = request.url().slice(sitting.service.length);
      if (request.method() === "GET" && path === `/v1/scopes/${native.register.scope}`) {
        const header = request.headers()["authorization"];
        const signed = header?.startsWith("Signed ") ? JSON.parse(Buffer.from(header.slice(7), "base64url").toString("utf8")) as SignedRead : null;
        if (!signed || !verifySignedRead(signed) || signed.request.actor !== actor.actor || signed.request.to !== native.register.scope || signed.request.read !== "summary") throw new Error("Register response was requested by a different signed caller or subject.");
      }
      if (request.method() === "POST" && path === actPath) {
        if (person !== "founder") throw new Error("Member attempted founding without an offer.");
        const body = JSON.parse(request.postData() ?? "null") as { signed?: SignedIntent };
        const signed = body?.signed;
        if (!signed || !verifySignedIntent(signed) || signed.intent.actor !== actor.actor || signed.intent.kind !== "found" || canonicalize(signed.intent.to) !== canonicalize(native.register)) throw new Error("Intercepted founding request does not match the configured native subject and caller.");
        const bytes = canonicalize(signed);
        if (attempts.length && bytes !== attempts[0]) throw new Error("A pending browser claim signed a replacement envelope.");
        attempts.push(bytes);
        if (attempts.length === 1) { entered(); await held; }
        // No native success or refusal is fabricated. The request never leaves this route.
        await route.abort("failed");
        return;
      }
      const caller = path.endsWith("/sessions") ? ` ${(JSON.parse(request.postData() ?? "{}") as { request?: { actor?: string } }).request?.actor}` : "";
      const answer = actor.answers[`${request.method() === "POST" ? "POST" : "GET"} ${path}${caller}`];
      if (!answer || request.method() === "POST" && !path.endsWith("/sessions")) {
        unanswered.push(`${request.method()} ${path}`);
        await route.abort("failed"); return;
      }
      await route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body });
    });
    await context.addInitScript((kept) => {
      if (location.origin === kept.service && location.pathname === "/page/" && window.top === window) localStorage.setItem("artroom-page", JSON.stringify({ place: kept.place, secret: kept.secret, register: kept.register }));
    }, { service: sitting.service, place: actor.place, secret: actor.secret, register: native.register });
    return context;
  };
  try {
    const member = await as("member", 320);
    const memberTab = await member.newPage(); watch(memberTab);
    await memberTab.goto(`${sitting.service}/page/#/`);
    await memberTab.getByRole("heading", { name: "Issues" }).waitFor({ state: "attached" });
    if (await memberTab.getByRole("button", { name: "Create room", exact: true }).count() !== 0) throw new Error("An ordinary member received a founding affordance despite its native eligibility refusal.");
    const founder = await as("founder", 390);
    const tab = await founder.newPage(); watch(tab);
    await tab.goto(`${sitting.service}/page/#/`);
    const opener = tab.getByRole("button", { name: "Create room", exact: true }).filter({ visible: true });
    await opener.click();
    const dialog = tab.getByRole("dialog", { name: "Create room" });
    const name = dialog.locator('input[name="name"]');
    if (await dialog.locator("input").count() !== 1) throw new Error("Create room is not a name-only dialog.");
    await name.fill("Field notebook");
    await tab.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    if (!await opener.evaluate((element) => document.activeElement === element)) throw new Error("Escape did not return focus to the opener.");
    await opener.click();
    if (await name.inputValue() !== "Field notebook") throw new Error("Escape discarded the local name draft.");
    const dialogCheck = await tab.evaluate(() => {
      const modal = document.querySelector("dialog[open]")!;
      const input = modal.querySelector("input")!;
      return { title: document.title, origin: location.origin, nameOnly: modal.querySelectorAll("input").length === 1,
        fontSize: parseFloat(getComputedStyle(input).fontSize), inputHeight: input.getBoundingClientRect().height,
        targets: [...modal.querySelectorAll("button")].map((button) => button.getBoundingClientRect().height),
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (dialogCheck.title !== "Artroom" || dialogCheck.origin !== sitting.service || dialogCheck.fontSize < 16 || dialogCheck.inputHeight < 44 || dialogCheck.targets.some((height) => height < 44) || dialogCheck.overflow) throw new Error("Create room dialog failed its phone identity or target-size checks.");
    await tab.screenshot({ path: join(out, "create-room-mobile.png") });
    const other = await founder.newPage(); watch(other);
    await other.goto(`${sitting.service}/page/#/`);
    await other.getByRole("button", { name: "Create room", exact: true }).filter({ visible: true }).click();
    const otherDialog = other.getByRole("dialog", { name: "Create room" });
    await otherDialog.locator('input[name="name"]').fill("Another label must not replace the saved claim");
    await dialog.getByRole("button", { name: "Create room", exact: true }).dblclick();
    await firstEntered;
    if (!await dialog.getByRole("button", { name: "Create room", exact: true }).isDisabled()) throw new Error("A pending claim remained submittable.");
    await otherDialog.getByRole("button", { name: "Create room", exact: true }).click();
    if (!await otherDialog.getByRole("button", { name: "Create room", exact: true }).isDisabled() || attempts.length !== 1) throw new Error("The actual browser Web Lock did not serialize the two tabs.");
    release();
    await dialog.getByRole("button", { name: "Resume creation", exact: true }).waitFor();
    await otherDialog.getByRole("button", { name: "Resume creation", exact: true }).waitFor();
    if (Number(attempts.length) !== 2) throw new Error("The queued second tab did not retain the exact pending claim.");
    await dialog.getByRole("button", { name: "Resume creation", exact: true }).click();
    await tab.waitForFunction(() => [...document.querySelectorAll("dialog[open] button")].some((button) => button.textContent === "Resume creation" && !button.hasAttribute("disabled")));
    if (Number(attempts.length) !== 3) throw new Error("Resume did not resubmit the exact saved claim envelope.");
    const pending = await tab.evaluate(() => {
      const key = Object.keys(localStorage).find((name) => name.startsWith("artroom-page-claim:"));
      if (!key) return null;
      const kept = JSON.parse(localStorage.getItem(key)!);
      return { label: kept.label as string, signed: kept.config.claim?.found?.signed as unknown };
    });
    if (!pending || pending.label !== "Field notebook" || canonicalize(pending.signed) !== attempts[0]) throw new Error("Private recovery did not keep the original local label and exact signed envelope.");
    await tab.screenshot({ path: join(out, "create-room-pending-mobile.png") });
    if (errors.length || unanswered.length) throw new Error(`Claim witness browser failures: ${JSON.stringify({ errors, unanswered })}`);
    const sizes = ["create-room-mobile", "create-room-pending-mobile"].map((name) => ({ name, bytes: statSync(join(out, `${name}.png`)).size }));
    if (sizes.some((shot) => shot.bytes > MOST)) throw new Error("Claim witness screenshot exceeds its byte bound.");
    writeFileSync(join(out, "claim-checks.json"), `${JSON.stringify({ source, sourceTree,
      mode: "production Page UI; actor-bound native readonly eligibility; founding transport loss STAND-IN with no Scope admission",
      register: native.register, definition: native.definition, memberControlAbsent: true, memberRefusal: native.member.refusal,
      dialogCheck, escapeFocusAndDraft: true, chromiumWebLocksAcrossTwoTabs: true, pendingDoubleClickBlocked: true,
      attemptedRequests: attempts.length, exactSavedEnvelopeReused: true, envelopeDigest: textDigest(attempts[0]!), originalLabelPreserved: true,
      screenshots: sizes, explainedNetwork, errors, unanswered,
      limit: "No founding request was admitted by a Scope, no native completion or hosted-provider success is claimed. The separate native adapter Scope witness tests admitted lost replies and settlement.",
    }, null, 2)}\n`);
    process.stdout.write("Claim browser witness: name-only dialog, native offer, member absence, Escape/draft, pending double click, cross-tab Web Lock and exact envelope retry passed. Founding transport loss STAND-IN; no Scope admission.\n");
  } finally { release?.(); await browser.close(); }
}

/** A retained local label on an already recorded native room. This does not
 * synthesize claim completion or change any native room name. */
async function labelWitness(chromium: Chromium, executablePath: string, sitting: Sitting, out: string): Promise<void> {
  const native = sitting.claimWitness;
  if (!native?.founder.recordedName) throw new Error("The native recorder supplied no recorded repository name.");
  const actor = native.founder;
  const browser = await chromium.launch({ executablePath });
  const checks: unknown[] = [], errors: string[] = [], unanswered: string[] = [];
  const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: ROOT, encoding: "utf8" }).trim();
  try {
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width: 320, height: 844 }, deviceScaleFactor: 1, colorScheme });
      await context.route(`${sitting.service}/**`, async (route) => {
        const request = route.request(), path = request.url().slice(sitting.service.length);
        if (request.method() === "GET" && path === `/v1/scopes/${native.register.scope}`) {
          const header = request.headers()["authorization"];
          const signed = header?.startsWith("Signed ") ? JSON.parse(Buffer.from(header.slice(7), "base64url").toString("utf8")) as SignedRead : null;
          if (!signed || !verifySignedRead(signed) || signed.request.actor !== actor.actor || signed.request.to !== native.register.scope) throw new Error("Label witness register response has another signed caller or subject.");
        }
        const caller = path.endsWith("/sessions") ? ` ${(JSON.parse(request.postData() ?? "{}") as { request?: { actor?: string } }).request?.actor}` : "";
        const answer = actor.answers[`${request.method() === "POST" ? "POST" : "GET"} ${path}${caller}`];
        if (!answer || request.method() === "POST" && !path.endsWith("/sessions")) { unanswered.push(`${request.method()} ${path}`); await route.abort("failed"); return; }
        await route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body });
      });
      await context.addInitScript((kept) => {
        if (location.origin !== kept.service || location.pathname !== "/page/" || window.top !== window) return;
        if (localStorage.getItem("artroom-page") === null) localStorage.setItem("artroom-page", JSON.stringify({ place: kept.place, secret: kept.secret, register: kept.register, label: { text: "Field notebook", place: kept.place, register: kept.register } }));
      }, { service: sitting.service, place: actor.place, secret: actor.secret, register: native.register });
      const tab = await context.newPage();
      tab.on("pageerror", (error) => errors.push(error.message));
      tab.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await tab.goto(`${sitting.service}/page/#/`);
      await tab.getByRole("heading", { name: "Issues" }).waitFor({ state: "attached" });
      const shown = await tab.evaluate(() => {
        const switches = [...document.querySelectorAll(".room-switch")].filter((element) => element.getBoundingClientRect().width > 0);
        const current = switches[0];
        const recorded = current?.querySelector(".room-recorded-name");
        return { title: document.title, origin: location.origin, visibleSwitches: switches.length,
          local: current?.querySelector('[title="Local room label"]')?.textContent,
          recorded: recorded?.textContent, recordedTitle: recorded?.getAttribute("title"),
          switchHeight: current?.getBoundingClientRect().height,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          editableFontSizes: [...document.querySelectorAll("input:not([type=hidden]),textarea,select")].map((element) => parseFloat(getComputedStyle(element).fontSize)),
        };
      });
      if (shown.title !== "Artroom" || shown.origin !== sitting.service || shown.visibleSwitches !== 1 || shown.local !== "Field notebook" || shown.recorded !== actor.recordedName || shown.recordedTitle !== "Recorded repository name" || shown.overflow || shown.editableFontSizes.some((size) => size < 16) || (shown.switchHeight ?? 0) < 44) throw new Error(`The local-label layout lost its native name or narrow-layout contract: ${JSON.stringify(shown)}`);
      await tab.screenshot({ path: join(out, `local-label-${colorScheme}-320.png`) });
      // Change only the label's binding, not the actual configured native room.
      await tab.evaluate(() => {
        const kept = JSON.parse(localStorage.getItem("artroom-page")!);
        kept.label.place.membership.inc = kept.register.inc;
        localStorage.setItem("artroom-page", JSON.stringify(kept));
      });
      await tab.reload();
      await tab.getByRole("heading", { name: "Issues" }).waitFor({ state: "attached" });
      const ignored = await tab.evaluate(() => [...document.querySelectorAll(".room-switch")].filter((element) => element.getBoundingClientRect().width > 0).map((element) => ({ name: element.querySelector(".room-name")?.textContent, local: !!element.querySelector('[title="Local room label"]') })));
      if (ignored.length !== 1 || ignored[0]!.local || ignored[0]!.name !== actor.recordedName) throw new Error("A local label bound to another membership incarnation leaked into the native room switch.");
      checks.push({ colorScheme, width: 320, ...shown, staleLabelBindingIgnored: true });
      await context.close();
    }
    if (errors.length || unanswered.length) throw new Error(`Label browser errors: ${JSON.stringify({ errors, unanswered })}`);
    const screenshots = ["light", "dark"].map((scheme) => ({ name: `local-label-${scheme}-320.png`, bytes: statSync(join(out, `local-label-${scheme}-320.png`)).size }));
    if (screenshots.some((shot) => shot.bytes > MOST)) throw new Error("A local-label screenshot exceeds the byte bound.");
    writeFileSync(join(out, "label-checks.json"), `${JSON.stringify({ source, sourceTree,
      mode: "production Page over actor-bound native reads of an existing room; local label seeded only in private browser settings",
      recordedName: actor.recordedName, localLabel: "Field notebook", checks, screenshots, errors, unanswered,
      limit: "No claim completion is fabricated, no founding or native name mutation is submitted. Label persistence after native completion is covered separately at the native adapter and Page boundaries.",
    }, null, 2)}\n`);
    process.stdout.write("Local label browser witness: native recorded name retained, one room switch,320px light/dark,stale membership label ignored; no founding or native name mutation.\n");
  } finally { await browser.close(); }
}

const SHOWS: Record<string, string> = {
  room: "The room’s Issues destination, with the All filter showing the recorded closed issue and the actions the signed-in person may sign on the directory.",
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
    if (arg === "--recorded" || arg === "--claim-witness" || arg === "--label-witness") flags.set(arg.slice(2), "true");
    else if (arg.startsWith("--")) { const value = argv[++i]; if (value === undefined) { process.stderr.write(`${arg} needs a value.\n${USAGE}\n`); return 2; } flags.set(arg.slice(2), value); }
    else words.push(arg);
  }
  const recorded = flags.has("recorded");
  const out = flags.get("out");
  if ((flags.has("claim-witness") || flags.has("label-witness")) && !recorded) { process.stderr.write("--claim-witness requires --recorded.\n"); return 2; }
  if (!out || (recorded ? words.length > 0 || flags.has("home") || flags.has("room") : words.length !== 1 || !flags.get("home") || !flags.get("room"))) { process.stderr.write(`${USAGE}\n`); return 2; }
  const executablePath = browserPath();
  const chromium = chromiumOf();
  if (!executablePath || !chromium) {
    process.stdout.write(`Skipped: ${!chromium ? "no playwright-core: set PLAYWRIGHT_CORE to a directory that holds it, installed outside this checkout" : "no Chromium: set CHROMIUM, or PLAYWRIGHT_BROWSERS_PATH"}. No capture was made.\n`);
    return recorded ? 0 : 2;
  }
  const sitting = recorded ? recordedSitting() : await liveSitting(words[0]!, flags.get("home")!, flags.get("room")!);
  mkdirSync(resolve(out), { recursive: true });
  if (flags.has("label-witness")) { await labelWitness(chromium, executablePath, sitting, resolve(out)); return 0; }
  if (flags.has("claim-witness")) { await claimWitness(chromium, executablePath, sitting, resolve(out)); return 0; }
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
