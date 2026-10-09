import { beginSessionFixture, beginSessionChild, type SessionOwner } from "../../../scope/test/session-settings.ts";
/**
 * The demo room that the page's story and its recorder open: founded by
 * the command line on real scopes, as `packages/lanes/test/edit.scope.test.ts`
 * founds one, with the real read sessions under a TEST SECRET.
 *
 * | Part | Is |
 * |---|---|
 * | The commands that set the room up | Real: `command` of the cli package, with a store in memory for each person: `install`, `claim`, `invite`, paul's `join`, the rules' `publish`, and the two `activate` acts with the demo profile's bytes beside them. |
 * | The scopes, the routes and the readers | Real: the namespace `PLATFORM`, the Worker's HTTP routes (`routed`), and the read sessions of `sessions.ts` under a TEST SECRET that this file generates. |
 * | The site route | Real: `site` of the scope package, reached as the Worker reaches it, for an address under `/site/`. |
 * | The Git host | A STAND-IN: `OwnGit` of `packages/scope/test/hosts.ts`, under the production wiring of the hosting own Git service's ports (`artifacts-wiring.ts`). Refs and objects are maps; each push is a real pack that the stand-in decodes. |
 * | The scheduler | A STAND-IN: `pause` runs the operations drivers and dispatchers of the scopes named, and of the register and the destination, as a deployment's alarms would. |
 * | The clock | The scripted clock of the namespaces. |
 */
import { env } from "cloudflare:workers";
import { expect, onTestFinished } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { site } from "../../../scope/src/site/route.ts";
import type { SiteEnv } from "../../../scope/src/site/host.ts";
import { ownHost, type Stand } from "../../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../../scope/test/repository.ts";
import { command, memoryStore, type Config, type Context, type Outcome } from "@generalbusiness/artroom-cli";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/artroom-lanes";
import type { Session } from "../../src/index.ts";

export const SERVICE = "https://scopes.test";

/** The local files the people's commands read. */
const FILES: Record<string, Uint8Array> = {
  "change-demo.json": utf8(canonicalize(changeDemo)),
  "issue-demo.json": utf8(canonicalize(issueDemo)),
  "readme.md": utf8("# The handbook\n\nWritten by the room.\n"),
  "agents.md": utf8("# Agents\n\nAsk before you push.\n"),
};

export interface Demo {
  at: Stand;
  /** The routes as the deployed Worker answers them: the site route under `/site/`, every other path the scope routes. */
  fetch: Fetch;
  pause(waiting?: readonly string[]): Promise<void>;
  run(who: Context, ...argv: string[]): Promise<Outcome>;
  rita: Context; paul: Context;
  /** rita's config, as `claim` saved it: what the planner's config.json holds. */
  config: Config;
  D: Platform; G: Platform; M: Platform; rules: Platform;
  /** An invitation link for @una, a member, from rita's `artroom invite`; nobody has used it. */
  link: string;
  /** A page session for a 32-byte secret. */
  as(secret: Uint8Array, owner?: SessionOwner): Session;
  /** A person's key, as the command line keeps it. */
  secretOf(who: Context): Promise<Uint8Array>;
  done(): void;
  sessionOwner: SessionOwner;
}

const ok = (outcome: Outcome): Outcome => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };
interface FixtureOwner { released: boolean; previous: FixtureOwner | null; before: { hold: typeof net.hold; deaf: typeof net.deaf; secret: typeof platformNet.secret; sessions: typeof platformNet.sessions } }
let fixtureOwner: FixtureOwner | null = null;
const providerOwners = new WeakMap<NonNullable<ReturnType<typeof platformOutside.get>>, FixtureOwner>();

/** Only the LIST1 editor opts in: it needs the founder, member invitation and change definition. */
export interface DemoSetup { editorOnly?: true }
/** Founds a fresh room. Full setup is the default; `wrap` may stand between the page and the routes. */
export async function demo(wrap: (fetch: Fetch, owner: SessionOwner) => Fetch = (f) => f, parent: SessionOwner | null = null, setup: DemoSetup = {}): Promise<Demo> {
  const before = { hold: net.hold, deaf: net.deaf, secret: platformNet.secret, sessions: platformNet.sessions };
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const sessionOwner = parent ? beginSessionChild(parent, { secret, sessions: true, inspector: null }) : beginSessionFixture({ secret, sessions: true, inspector: null });
  const owner: FixtureOwner = { released: false, previous: fixtureOwner, before };
  fixtureOwner = owner;
  let released = false;
  let held: typeof net.hold = null;
  const wired = new Map<ScopeId, { previous: ReturnType<typeof platformOutside.get>; installed: NonNullable<ReturnType<typeof platformOutside.get>> }>();
  const done = () => {
    if (released) return;
    const currentOwner = fixtureOwner === owner;
    released = owner.released = true;
    let restore = owner;
    while (restore.previous?.released) restore = restore.previous;
    if (fixtureOwner === owner) fixtureOwner = restore.previous;
    sessionOwner.close();
    if (currentOwner && net.hold === held) net.hold = restore.before.hold;
    // `deaf` has no owner token; never overwrite a later non-null setting.
    if (currentOwner && net.deaf === null) net.deaf = restore.before.deaf;
    for (const [name, wiring] of wired) if (platformOutside.get(name) === wiring.installed) {
      if (wiring.previous && !providerOwners.get(wiring.previous)?.released) platformOutside.set(name, wiring.previous); else platformOutside.delete(name);
    }
  };
  const active = () => { if (released) throw new Error("The demo fixture was released before setup completed."); sessionOwner.active(); };
  onTestFinished(done);
  try {
    net.hold = net.deaf = null;
    const at = ownHost();
    let R: Platform | null = null;
    let siteEnv: SiteEnv | null = null;
    const bindings = () => at.bindings(R!.name);
    const wire = (name: ScopeId) => {
      if (released) return;
      const installed: NonNullable<ReturnType<typeof platformOutside.get>> = (given, sql) => at.outside(given, sql, bindings());
      providerOwners.set(installed, owner);
      if (!wired.has(name)) wired.set(name, { previous: platformOutside.get(name), installed });
      else wired.get(name)!.installed = installed;
      platformOutside.set(name, installed);
    };
    const known: Platform[] = [];
    // STAND-IN for the scheduler: each pass drives the operations of every scope named, and of the register and the destination,
    // then their dispatchers, until nothing is due.
    const pause = async (waiting: readonly string[] = []) => {
      active();
      const nodes = [...known, ...waiting.filter((scope) => !known.some((node) => node.name === scope)).map((scope) => new Platform(scope as never))];
      for (let pass = 0; pass < 64; pass++) {
        let made = 0;
        for (const node of nodes) {
          for (;;) {
            const effects = await sessionOwner.required(() => (node.stub as unknown as { effect(): Promise<number> }).effect());
            active();
            if (!(effects > 0)) break;
            made++;
          }
          made += await sessionOwner.required(() => node.stub.dispatch());
          active();
        }
        if (made === 0) return;
      }
      await sessionOwner.required(() => settle(...nodes));
    };
    const routes = (async (url: string, init?: RequestInit) =>
      (siteEnv && new URL(url).pathname.startsWith("/site/") ? site(new Request(url, init), siteEnv, at.stand.fetch) : routed(url, init))) as unknown as Fetch;
    const wrapped = wrap(routes, sessionOwner);
    const guarded = (owner: SessionOwner, through: Fetch): Fetch => (url, init) => owner.required(() => through(url, init));
    const fetch = guarded(sessionOwner, wrapped);
    const now = () => { active(); return timeMs(net.clock.now)!; };
    const person = (): Context => ({ store: memoryStore(), fetch: guarded(sessionOwner, routes), now, pause, read: async (path) => { active(); return FILES[path] ?? null; } });
    const rita = person();
    const paul = person();
    const run = (who: Context, ...argv: string[]): Promise<Outcome> => sessionOwner.required(() => command(who, argv));

    ok(await run(rita, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
    active();
    const installed = (await rita.store.config())!;
    active();
    R = new Platform(installed.register!.scope);
    wire(R.name);
    await R.restart();
    active();
    known.push(R);
    held = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
    net.hold = held;
    ok(await run(rita, "claim", "demo", "--handle", "@rita"));
    active();
    const config = (await rita.store.config())!;
    active();
    const repository = config.repository!;
    const [D, G, M, rules] = [new Platform(repository.directory.scope), new Platform(repository.destination), new Platform(repository.membership.scope), new Platform(repository.rules)];
    known.push(G);
    await pause();
    active();
    siteEnv = { SCOPES: env.PLATFORM, ...bindings() };

    // Full setup enrolls paul; both setups leave una's actual invitation for the page.
    if (!setup.editorOnly) {
      const paulInvitation = ok(await run(rita, "invite", "@paul", "--role", "maintainer")).lines[1]!.split(": ")[1]!;
      active();
      ok(await run(paul, "join", paulInvitation));
      active();
    }
    const link = ok(await run(rita, "invite", "@una", "--role", "member")).lines[1]!.split(": ")[1]!;
    active();

    // The rules: the first extents, with no approval for the source extent; the rules extent asks one from the controller, rita.
    // Full setup activates both demo definitions; the editor needs only change.
    ok(await run(rita, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
    active();
    if (!setup.editorOnly) {
      ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.issue}`, "--set", "name=issue", "--value", "issue-demo.json"));
      active();
    }
    ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"));
    active();

    return {
      at, fetch, pause, run, rita, paul, config, D, G, M, rules, link, sessionOwner,
      as: (secret, owner = sessionOwner) => ({ service: SERVICE, secret, fetch: guarded(owner, wrapped), now: () => { owner.active(); return timeMs(net.clock.now)!; } }),
      secretOf: async (who) => sessionOwner.required(async () => (await who.store.secret((await who.store.config())!.key))!),
      done,
    };
  } catch (error) { done(); throw error; }
}
