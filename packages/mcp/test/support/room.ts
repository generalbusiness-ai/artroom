/**
 * A room for the MCP server's stories, on real scopes. Each person is an agent with an MCP service of their own: their key,
 * their configuration in memory, custody in memory. Every act and read of the story goes through the service's tools.
 *
 * | Part | Is |
 * |---|---|
 * | The server, its tools, custody and reads | Real: `McpService` of this package, called in the test's isolate, as a transport would call it. |
 * | The scopes, the routes and the readers | Real: the namespace `PLATFORM`, the Worker's HTTP routes (`routed`), and the read sessions of `sessions.ts` under a TEST SECRET that this file generates. |
 * | The Git host | A STAND-IN: `OwnGit` of `packages/scope/test/hosts.ts`, under the production wiring of the hosting own Git service's ports, as `packages/page/test/support/demo.ts` wires it. |
 * | The scheduler | A STAND-IN: the service's `pause`, between two polls of `wait`, runs the operations drivers and dispatchers of the scopes waited on, and of the register and the destination, as a deployment's alarms would. |
 * | The watch's timer | A STAND-IN: the test fires it (`tick`), in place of 30 seconds passing. |
 * | The clock | The scripted clock of the namespaces. |
 */
import { expect } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, keyIdOfSecret, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { secretSigner, type Fetch } from "@generalbusiness/artroom-client";
import { ownHost } from "../../../scope/test/hosts.ts";
import { type Platform, routed } from "../../../scope/test/repository.ts";
import { beginSessionFixture } from "../../../scope/test/session-settings.ts";
import { driveFixture, nativeFixtureLifetime } from "../../../scope/test/support/native-fixture-lifetime.ts";
import { McpService, memoryStore, type CallResult, type McpConfig, type Mode, type Root } from "../../src/index.ts";

export const SERVICE = "https://scopes.test";

/** What a story calls a person: their key, their configuration, and their MCP service. */
export interface Agent {
  name: string;
  key: string;
  secret: Uint8Array;
  config: McpConfig;
  service: McpService;
  /** One tool call; the story asserts on its answer. */
  call(name: string, args?: Record<string, unknown>): Promise<CallResult>;
  /** One tool call that must not be an error, with its structured content. */
  ok(name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Every tool name of the list, across its pages. */
  names(): Promise<string[]>;
  /** List changes this agent's subscribed client was told of. */
  told: number;
  /** Fire the watch, as 30 seconds passing would, and let it finish. */
  tick(): Promise<void>;
  /** Requests this agent's service made to the scope service, by method and path. */
  requests: string[];
}

export interface Room {
  agent(name: string, options?: { mode?: Mode; config?: McpConfig; secret?: Uint8Array; subscribe?: boolean; tools?: string[] }): Agent;
  pause(waiting?: readonly string[]): Promise<void>;
  wait<T>(action: () => Promise<T>): Promise<T>;
  active(): void;
  platform(scope: ScopeId): Platform;
  /** Wire the outside port of the register a story created, as the deployment's host setting would. */
  wireRegister(register: ScopeId): Promise<void>;
  advance(ms: number): void;
  /** Drive this scope at every pause, as a deployment's alarms would: the destination, once the room exists. */
  know(scope: ScopeId): void;
  now(): number;
  /** The next request whose path ends with `suffix` reaches the Worker, and its reply is lost: a STAND-IN for a dropped reply. */
  loseNextReply(suffix: string): void;
  fetch: Fetch;
  done(): void;
}

export function mcpRoom(): Room {
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const sessionOwner = beginSessionFixture({ secret, sessions: true, inspector: null });
  const lifetime = nativeFixtureLifetime(sessionOwner);
  const { active, wait, release: done } = lifetime;
  const at = ownHost();
  let register: ScopeId | null = null;
  const known: Platform[] = [];
  const bindings = () => at.bindings(register!);
  const wire = (name: ScopeId) => lifetime.outside(name, (given, sql) => at.outside(given, sql, bindings()));
  const pause = async (waiting: readonly string[] = []) => {
    active();
    const nodes = [...known, ...waiting.filter((scope) => !known.some((node) => node.name === scope)).map((scope) => lifetime.platform(scope as ScopeId))];
    await driveFixture(nodes, wait);
  };
  let lose: string | null = null;
  const fetch: Fetch = (async (url: string, init?: RequestInit) => {
    const response = await lifetime.waitFor(sessionOwner, () => routed(url, init));
    if (lose !== null && new URL(url).pathname.endsWith(lose)) { lose = null; await response.body?.cancel(); throw new Error("scripted loss of the reply"); }
    return response;
  }) as unknown as Fetch;
  return {
    now: () => lifetime.now(),
    know: (scope) => { if (!known.some((node) => node.name === scope)) known.push(lifetime.platform(scope)); },
    loseNextReply: (suffix) => { lose = suffix; },
    pause, wait, active, fetch, done,
    platform: (scope) => lifetime.platform(scope),
    advance: (ms) => lifetime.advance(ms),
    wireRegister: async (scope) => {
      register = scope;
      const R = lifetime.platform(scope);
      wire(scope);
      await R.restart();
      known.push(R);
      lifetime.setHold((envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; });
    },
    agent(name, options = {}) {
      const key = options.secret ?? crypto.getRandomValues(new Uint8Array(32));
      const config: McpConfig = options.config ? structuredClone(options.config) : { service: SERVICE };
      const requests: string[] = [];
      const counted: Fetch = (url, init) => { requests.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`); return fetch(url, init); };
      let tick: () => void = () => {};
      const service = new McpService({
        service: SERVICE, fetch: counted, signer: secretSigner(key), custody: memoryStore(), mode: options.mode ?? "default", ...(options.tools ? { tools: options.tools } : {}),
        now: lifetime.now, pause: (waiting) => pause(waiting),
        every: (_ms, run) => { tick = run; return () => { tick = () => {}; }; },
        config: {
          read: async () => structuredClone(config),
          addRoot: async (root: Root) => { config.roots = [...(config.roots ?? []).filter((r) => r.scope !== root.scope), root]; },
          setRepository: async (repository) => { config.repository = repository; },
        },
      });
      const agent: Agent = {
        name, key: keyIdOfSecret(key), secret: key, config, service, told: 0, requests,
        call: (tool, args = {}) => wait(() => service.call(tool, args)),
        ok: async (tool, args = {}) => {
          const result = await wait(() => service.call(tool, args));
          expect(result.isError, `${name} ${tool}: ${JSON.stringify(result.structuredContent)}`).toBe(false);
          return result.structuredContent;
        },
        names: async () => {
          const names: string[] = [];
          for (let cursor: string | undefined, n = 0; n < 32; n++) {
            const page = await wait(() => service.page(cursor));
            names.push(...page.tools.map((t) => t.name));
            if (!page.nextCursor) break;
            cursor = page.nextCursor;
          }
          return names;
        },
        tick: async () => { tick(); await wait(() => service.check()); },
      };
      if (options.subscribe) service.subscribe(() => { agent.told++; });
      return agent;
    },
  };
}
