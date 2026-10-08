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
  as(secret: Uint8Array): Session;
  /** A person's key, as the command line keeps it. */
  secretOf(who: Context): Promise<Uint8Array>;
  done(): void;
}

const ok = (outcome: Outcome): Outcome => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };

/** Founds the room. `wrap` may stand between the page and the routes, as the recorder does. */
export async function demo(wrap: (fetch: Fetch) => Fetch = (f) => f): Promise<Demo> {
  net.hold = net.deaf = null;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true;
  const wired = new Set<ScopeId>();
  const at = ownHost();
  let R: Platform | null = null;
  let siteEnv: SiteEnv | null = null;
  const bindings = () => at.bindings(R!.name);
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, bindings())); };
  const known: Platform[] = [];
  // STAND-IN for the scheduler: each pass drives the operations of every scope named, and of the register and the destination,
  // then their dispatchers, until nothing is due.
  const pause = async (waiting: readonly string[] = []) => {
    const nodes = [...known, ...waiting.filter((scope) => !known.some((node) => node.name === scope)).map((scope) => new Platform(scope as never))];
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of nodes) {
        while ((await (node.stub as unknown as { effect(): Promise<number> }).effect()) > 0) made++;
        made += await node.stub.dispatch();
      }
      if (made === 0) return;
    }
    await settle(...nodes);
  };
  const routes = (async (url: string, init?: RequestInit) =>
    (siteEnv && new URL(url).pathname.startsWith("/site/") ? site(new Request(url, init), siteEnv, at.stand.fetch) : routed(url, init))) as unknown as Fetch;
  const fetch = wrap(routes);
  const now = () => timeMs(net.clock.now)!;
  const person = (): Context => ({ store: memoryStore(), fetch: routes, now, pause, read: async (path) => FILES[path] ?? null });
  const rita = person();
  const paul = person();
  const run = (who: Context, ...argv: string[]): Promise<Outcome> => command(who, argv);

  ok(await run(rita, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
  R = new Platform((await rita.store.config())!.register!.scope);
  wire(R.name);
  await R.restart();
  known.push(R);
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  ok(await run(rita, "claim", "demo", "--handle", "@rita"));
  const config = (await rita.store.config())!;
  const repository = config.repository!;
  const [D, G, M, rules] = [new Platform(repository.directory.scope), new Platform(repository.destination), new Platform(repository.membership.scope), new Platform(repository.rules)];
  known.push(G);
  await pause();
  siteEnv = { SCOPES: env.PLATFORM, ...bindings() };

  // paul, a maintainer, joins on the command line; una's invitation is left for the page.
  ok(await run(paul, "join", ok(await run(rita, "invite", "@paul", "--role", "maintainer")).lines[1]!.split(": ")[1]!));
  const link = ok(await run(rita, "invite", "@una", "--role", "member")).lines[1]!.split(": ")[1]!;

  // The rules: the first extents, with no approval for the source extent; the rules extent asks one from the controller, rita.
  // The demo profile's two definitions, activated with their bytes beside the act.
  ok(await run(rita, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.issue}`, "--set", "name=issue", "--value", "issue-demo.json"));
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"));

  return {
    at, fetch, pause, run, rita, paul, config, D, G, M, rules, link,
    as: (secret) => ({ service: SERVICE, secret, fetch, now }),
    secretOf: async (who) => (await who.store.secret((await who.store.config())!.key))!,
    done: () => {
      platformNet.secret = null;
      platformNet.sessions = false;
      net.hold = null;
      for (const name of wired) platformOutside.delete(name);
    },
  };
}
