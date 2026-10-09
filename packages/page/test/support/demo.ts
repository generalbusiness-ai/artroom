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
import { expect } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { site } from "../../../scope/src/site/route.ts";
import type { SiteEnv } from "../../../scope/src/site/host.ts";
import { ownHost, type Stand } from "../../../scope/test/hosts.ts";
import { type Platform, routed } from "../../../scope/test/repository.ts";
import { nativeFixtureLifetime, driveFixture } from "../../../scope/test/support/native-fixture-lifetime.ts";
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
  /** A required-session lease and the same fixture resource boundary for direct proof work. */
  wait<T>(action: () => Promise<T>): Promise<T>;
  run(who: Context, ...argv: string[]): Promise<Outcome>;
  rita: Context; paul: Context;
  /** rita's config, as `claim` saved it: what the planner's config.json holds. */
  config: Config;
  D: Platform; G: Platform; M: Platform; rules: Platform;
  /** An unused actual invitation for @una; empty only when setup explicitly omits it. */
  link: string;
  /** A page session for a 32-byte secret. */
  as(secret: Uint8Array, owner?: SessionOwner): Session;
  /** A person's key, as the command line keeps it. */
  secretOf(who: Context): Promise<Uint8Array>;
  done(): void;
  sessionOwner: SessionOwner;
}

const ok = (outcome: Outcome): Outcome => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };
/** The editor needs only change; its actual Una invitation stays enabled unless explicitly omitted. */
export interface DemoSetup { editorOnly?: true; invitation?: false }
/** Founds a fresh room. Full setup is the default; `wrap` may stand between the page and the routes. */
export async function demo(wrap: (fetch: Fetch, owner: SessionOwner) => Fetch = (f) => f, parent: SessionOwner | null = null, setup: DemoSetup = {}): Promise<Demo> {
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const sessionOwner = parent ? beginSessionChild(parent, { secret, sessions: true, inspector: null }) : beginSessionFixture({ secret, sessions: true, inspector: null });
  const lifetime = nativeFixtureLifetime(sessionOwner);
  const { active, wait, release: done } = lifetime;
  try {
    const at = ownHost();
    let R: Platform | null = null;
    let siteEnv: SiteEnv | null = null;
    const bindings = () => at.bindings(R!.name);
    const wire = (name: ScopeId) => lifetime.outside(name, (given, sql) => at.outside(given, sql, bindings()));
    const known: Platform[] = [];
    // STAND-IN scheduler: actual effects, then dispatch, with the shared finite work budget.
    const pause = async (waiting: readonly string[] = []) => {
      active();
      const nodes = [...known, ...waiting.filter((scope) => !known.some((node) => node.name === scope)).map((scope) => lifetime.platform(scope as ScopeId))];
      await driveFixture(nodes, wait);
    };
    const routes = (async (url: string, init?: RequestInit) =>
      (siteEnv && new URL(url).pathname.startsWith("/site/") ? site(new Request(url, init), siteEnv, at.stand.fetch) : routed(url, init))) as unknown as Fetch;
    const wrapped = wrap(routes, sessionOwner);
    const guarded = (owner: SessionOwner, through: Fetch): Fetch => (url, init) => lifetime.waitFor(owner, () => through(url, init));
    const fetch = guarded(sessionOwner, wrapped);
    const now = lifetime.now;
    const person = (): Context => ({ store: memoryStore(), fetch: guarded(sessionOwner, routes), now, pause, read: async (path) => { active(); return FILES[path] ?? null; } });
    const rita = person();
    const paul = person();
    const run = (who: Context, ...argv: string[]): Promise<Outcome> => wait(() => command(who, argv));

    ok(await run(rita, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
    active();
    const installed = (await rita.store.config())!;
    active();
    R = lifetime.platform(installed.register!.scope);
    wire(R.name);
    await R.restart();
    active();
    known.push(R);
    lifetime.setHold((envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; });
    ok(await run(rita, "claim", "demo", "--handle", "@rita"));
    active();
    const config = (await rita.store.config())!;
    active();
    const repository = config.repository!;
    const [D, G, M, rules] = [lifetime.platform(repository.directory.scope), lifetime.platform(repository.destination), lifetime.platform(repository.membership.scope), lifetime.platform(repository.rules)];
    known.push(G);
    await pause();
    active();
    siteEnv = { SCOPES: env.PLATFORM, ...bindings() };

    // Full setup enrolls Paul; Una's actual invitation can be omitted by a founder-only reader.
    if (!setup.editorOnly) {
      const paulInvitation = ok(await run(rita, "invite", "@paul", "--role", "maintainer")).lines[1]!.split(": ")[1]!;
      active();
      ok(await run(paul, "join", paulInvitation));
      active();
    }
    const link = setup.invitation === false ? "" : ok(await run(rita, "invite", "@una", "--role", "member")).lines[1]!.split(": ")[1]!;
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
      at, fetch, pause, wait, run, rita, paul, config, D, G, M, rules, link, sessionOwner,
      as: (secret, owner = sessionOwner) => {
        lifetime.activeFor(owner);
        return { service: SERVICE, secret, fetch: guarded(owner, wrapped), now: () => lifetime.nowFor(owner) };
      },
      secretOf: async (who) => {
        const config = await wait(() => who.store.config());
        return (await wait(() => who.store.secret(config!.key)))!;
      },
      done,
    };
  } catch (error) { done(); throw error; }
}
