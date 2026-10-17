/**
 * The Worker the workerd tests run. `TestScope` is the scope's object class
 * with the test ports, bounds and read bounds that the test set for its
 * name, no transport, and the stand-ins of `outside.ts` for the outside
 * system and for the owners of outside operations, or the ports that a test
 * wired for that name (`wired`). `ScopeObject` is bound as it is deployed, with
 * every production default. `NetScope` is the deployed class in a namespace
 * of its own, `NET`, with the test ports of `netPorts`; `NetService` and the
 * default export are the deployed entrypoint and routes over that
 * namespace. The test authority reaches a scope only through these classes,
 * which the production entry, `src/worker.ts`, does not import.
 *
 * `PlatformScope` is the deployed class in a third namespace, `PLATFORM`,
 * with the production authority: no test authority and no scripted
 * membership. A membership scope there judges its own acts on its own head,
 * and every other scope reads the membership scope that its genesis
 * records, through the namespace. Four of its ports are not the production
 * ones, and each is labelled, and a fifth where a test wires it: the
 * STAND-IN host of `outside.ts`, as the outside port of a register. The
 * four: the shared scripted clock, and transport that
 * a test can hold; the test readers,
 * a stand-in for read sessions, until a test sets `platformNet.sessions`, and from then the real read sessions, but for the one reader
 * that a test names in `platformNet.inspector` for its own reads; and the scripted peers,
 * a stand-in for a lane that sends a notice. The platform definitions are
 * the platform package's, with every rule of membership, as deployed. A
 * test may take one rule of membership away, `platformNet.without`, as a
 * control of the whole-scope rule.
 *
 * The package exports this file as `./testing/worker`, for the test Worker
 * of a package that runs its own definitions on real scopes.
 */

import { platform } from "@generalbusiness/dap-platform";
import { lacking } from "@generalbusiness/dap-platform/testing";
import { ScopeObject, type Outside, type OutsideGiven, type Wiring } from "../src/index.ts";
import { sessionsOf, type LimitConfig } from "../src/index.ts";
import { codeLost, controls, net, netPorts, testPorts } from "../src/testing.ts";
import { signedDiagnosticFor } from "./signed-read-diagnostic.ts";
import { sessionFields, testSessionBypass } from "./session-settings.ts";
import scopeWorker, { DeployedScope, McpAgent, McpRegistry, ScopeService, route, sessionWiring, type Env, type McpEnv } from "../src/worker.ts";
import type { AgentPorts, HostedAgent } from "@generalbusiness/dap-mcp";
import { outsideOf, owners, wired } from "./outside.ts";
import type { MetricEnvironment } from "../src/operational.ts";

export { ScopeObject };
/** Scripted operational sinks, keyed by physical object for paired deployments. */
export const metricBindings = new Map<string, MetricEnvironment>();
/** Test ports for byte-equal native worlds in different physical namespaces. */
export const metricWiring = new Map<string, () => Partial<NonNullable<Wiring["ports"]>>>();

export class TestScope extends ScopeObject {
  protected override metricEnvironment(): MetricEnvironment { return metricBindings.get(this.ctx.id.toString()) ?? super.metricEnvironment(); }
  protected override wiring(name: string | undefined): Wiring {
    const c = controls(name ?? "");
    return { ports: { ...testPorts(c), outside: outsideOf(name ?? ""), owners, ...wired.get(name ?? "")?.(), ...metricWiring.get(this.ctx.id.toString())?.() }, bounds: c.bounds, reads: c.reads };
  }
}
/** Same native code in a second local namespace for byte equality controls. */
export class MetricControlScope extends TestScope {}

type NetEnv = Env & { NET: DurableObjectNamespace };

export class NetScope extends DeployedScope<NetEnv> {
  protected override metricEnvironment(): MetricEnvironment { return metricBindings.get(this.ctx.id.toString()) ?? super.metricEnvironment(); }
  protected override scopes() { return this.env.NET; }
  protected override wiring(name: string | undefined): Wiring {
    const deployed = super.wiring(name);
    const ports = { ...deployed.ports, ...netPorts(net, deployed.ports!.transport!, deployed.ports!.resolver) };
    // The definitions port is the deployed one, whose platform definitions are the platform package's, until a test takes their code away.
    return { bounds: net.sized.get(name ?? "") ?? net.bounds, ports: { ...ports, definitions: codeLost(deployed.ports!.definitions!, () => !net.platformCode) } };
  }
}

/**
 * What a test holds of the namespace `PLATFORM`. `without`: null, the
 * platform definitions are exactly the platform package's, as under the
 * production wiring. Otherwise the name of one rule of membership that is
 * left out, a CONTROL for a runtime whose version of membership lacks one
 * rule. It is read at each use.
 *
 * `sessions`: false, the readers port is the test readers, a STAND-IN that
 * lets every reader read, so that a fixture can be built and looked at.
 * True: it is the real read sessions of `sessions.ts`, as deployed. `secret`:
 * the session secret of the test deployment, a TEST SECRET that the test
 * generates. Null: none is bound, and the session configuration is read
 * from the Worker's own bindings, exactly as deployed, which hold none here.
 * Both are read at each use. `limits`: the serving limits of a join, read
 * when a scope's object starts. Null: the proposed ones.
 */
/**
 * `inspector`: while `sessions` is set, a reader that is exactly this text is let read, as the test readers let every reader. It is
 * for a test's own reads of what a scope holds, by a reader that no client presents. Every other reader is judged by the real read
 * sessions.
 */
export const platformNet: { without: string | null; readonly sessions: boolean; readonly secret: string | null; limits: LimitConfig | null; readonly inspector: string | null } = {
  without: null, limits: null,
  get sessions() { return sessionFields.sessions; },
  get secret() { return sessionFields.secret; },
  get inspector() { return sessionFields.inspector; },
};
for (const field of ["sessions", "secret", "inspector"] as const) Object.defineProperty(platformNet, field, { ...Object.getOwnPropertyDescriptor(platformNet, field)!, configurable: false });
/** Test-only, name-bound outside factories. ScopeObject supplies its live
 * readonly store facade after storage exists; no default port is changed. */
export const platformOutside = new Map<string, (given: OutsideGiven, sql: Pick<SqlStorage, "exec">) => Outside>();
/** The name of the test deployment, which a session's token names. */
export const TEST_DEPLOYMENT = "artroom-scope-test";

type PlatformEnv = Env & { PLATFORM: DurableObjectNamespace };

export class PlatformScope extends DeployedScope<PlatformEnv> {
  protected override metricEnvironment(): MetricEnvironment { return metricBindings.get(this.ctx.id.toString()) ?? super.metricEnvironment(); }
  readonly #scheduledCallbacks: Promise<unknown>[];

  constructor(ctx: DurableObjectState, env: PlatformEnv) {
    // Retain the actual context and delegate each exact original promise.
    // This test-only registry neither replaces a callback nor changes its scheduling.
    const scheduled: Promise<unknown>[] = [];
    const originalWaitUntil = ctx.waitUntil.bind(ctx);
    ctx.waitUntil = promise => {
      scheduled.push(promise);
      try { originalWaitUntil(promise); }
      catch (error) { scheduled.splice(scheduled.lastIndexOf(promise), 1); throw error; }
    };
    super(ctx, env);
    this.#scheduledCallbacks = scheduled;
  }

  /** Join only this actual object's scheduled callbacks; no driver, clock advance or read retry. */
  async awaitScheduledCallbacks(): Promise<{ batches: number; callbacks: number }> {
    let callbacks = 0;
    for (let batches = 0; batches < 64; batches++) {
      if (this.#scheduledCallbacks.length === 0) return { batches, callbacks };
      if (this.#scheduledCallbacks.length > 4096) throw new Error("Native fixture scheduled callback batch exceeded 4096 promises");
      const batch = this.#scheduledCallbacks.splice(0);
      callbacks += batch.length;
      const settled = await Promise.allSettled(batch);
      const failures = settled.flatMap(result => result.status === "rejected" ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures, "Native fixture scheduled callback failed");
    }
    throw new Error("Native fixture scheduled callbacks exceeded 64 batches");
  }

  protected override scopes() { return this.env.PLATFORM; }
  protected override wiring(name: string | undefined): Wiring {
    const deployed = super.wiring(name);
    const { resolver, definitions, transport } = deployed.ports as Required<NonNullable<Wiring["ports"]>>;
    // With a test secret the session configuration is the test's. With none it is the deployed one, from this Worker's bindings.
    const session = sessionWiring(() => (platformNet.secret === null ? deployed.sessions!() : sessionsOf(platformNet.secret, TEST_DEPLOYMENT)), this.scopes());
    const outside = platformOutside.get(name ?? "");
    const ports = wired.get(name ?? "")?.();
    const { outside: _deployed, ...rest } = deployed;
    const signedReadObserver = signedDiagnosticFor(name);
    return {
      ...(ports?.outside ? rest : deployed),
      // Explicit per-name fixture bounds only; deployed defaults are unchanged.
      ...(net.sized.has(name ?? "") ? { bounds: net.sized.get(name ?? "")! } : {}),
      ...(outside ? { outside: (given: OutsideGiven) => outside(given, this.ctx.storage.sql) } : {}),
      sessions: session.sessions,
      ...(signedReadObserver ? { signedReadObserver } : {}),
      readers: (given) => {
        const real = session.readers(given);
        return {
          allows: (reader, read) => (testSessionBypass(reader, "allows") ? true : real.allows(reader, read)), chained: real.chained!, holder: real.holder!,
          // The inspector is an explicit test bypass. It resolves no peer and
          // supplies no production session authority.
          prepare: (reader, read) => (testSessionBypass(reader, "prepare") ? Promise.resolve() : real.prepare!(reader, read)),
        };
      },
      ...(platformNet.limits ? { limits: platformNet.limits } : {}),
      ports: {
        ...deployed.ports, clock: net.clock,
        // Transport that a test can hold: a send that `net.hold` matches is not delivered, and its attempt gets no answer.
        transport: { send: (envelope) => (net.hold?.(envelope) ? Promise.resolve(null) : transport!.send(envelope)) },
        // A scripted peer: an entry that a test wrote by hand, for a lane that sends a notice. Every other entry is read from the real object.
        resolver: { read: (fact, seconds, origin) => { const peer = net.peers.get(fact.hash); return peer ? Promise.resolve(peer) : resolver.read(fact, seconds, origin); } },
        definitions: { read: (named, holder) => definitions.read(named, holder), platform: (named) => (platformNet.without === null ? platform(named) : lacking(named, platformNet.without)) },
        // The ports that one test wired for this name: the STAND-IN host of `outside.ts`, for a register, whose one outside effect is
        // the creation of a repository at the Git host. With none wired the outside port is the production one, which sends nothing.
        ...ports,
      },
    };
  }
}

export class NetService extends ScopeService<NetEnv> {
  protected override scopes() { return this.env.NET; }
}

// Exercise the production entrypoint with the same NET namespace as before.
export default { fetch: async (request: Request, env: NetEnv & HostedEnv): Promise<Response> => scopeWorker.fetch(request, { ...env, SCOPES: env.NET }) };

/**
 * The hosted MCP endpoint in this Worker: the deployed classes over the
 * namespace `PLATFORM`, so a hosted agent reads and acts on the same real
 * scopes the stories found. `hostedTest` holds what a test lends them: the
 * fixture's clock, and the pause between two polls of `wait`, which drives
 * the fixture's operations as a deployment's alarms would.
 */
export const hostedTest: {
  /** Closed MCP reporter port; no provider or Analytics Engine request. */
  metrics: AgentPorts["metrics"] | null;
  now: (() => number) | null; pause: ((waiting: readonly string[]) => Promise<void>) | null;
  /** The next request whose path ends with this reaches the scope, and its reply is lost: a STAND-IN for a dropped reply. */
  lose: string | null;
  /** A small control budget for an agent object made while it is set, in place of 16 MiB and 1 MiB. */
  controlBudget: { budget: number; reserve: number } | null;
  /** Small custody bounds for an agent object made while it is set; `failWrite` makes its next custody write fail, as SQLITE_FULL would. */
  custodyBounds: { budget: number; identityMost: number; terminalMost: number; ageDays: number } | null;
  /** The next custody write of this kind fails, as SQLITE_FULL would. */
  failWrite: "keep" | "dispatch" | "result" | "segment" | null;
  /** The creation fence at which the next creation fails, as a reset would: the object throws there and drops its memory. */
  faultAt: "reservation" | "seed" | "kept" | "accepted" | "complete" | null;
  /** The next session-row write of an agent fails, as a storage failure would. */
  failSession: boolean;
  /** While set, every configuration read of an agent, and with it every listing and snapshot, waits on this promise. */
  configHold: Promise<void> | null;
} = { metrics: null, now: null, pause: null, lose: null, controlBudget: null, custodyBounds: null, failWrite: null, faultAt: null, failSession: false, configHold: null };
/** The scripted reset: thrown at a fence, once. */
export class ScriptedReset extends Error { constructor(fence: string) { super(`scripted reset at ${fence}`); } }
type HostedEnv = McpEnv & { PLATFORM: DurableObjectNamespace };
export class PlatformMcpRegistry extends McpRegistry<HostedEnv> {
  protected override scopes() { return this.env.PLATFORM; }
  protected override now(): number { return hostedTest.now?.() ?? Date.now(); }
  protected override ports() { return { ...(hostedTest.controlBudget ? { controlBudget: hostedTest.controlBudget } : {}), fault: (fence: string) => { if (hostedTest.faultAt === fence) { hostedTest.faultAt = null; this.evict(); throw new ScriptedReset(fence); } } }; }
  reset(): void { this.evict(); }
  heldAnswers(): { op: string; answer: boolean }[] { return this.answers(); }
}
export class PlatformMcpAgent extends McpAgent<HostedEnv> {
  protected override scopes() { return this.env.PLATFORM; }
  /** The harness's instance reset: what an eviction leaves. */
  reset(): void { this.evict(); }
  /** Fire the service's watch once, as 30 seconds passing would. */
  async tick(): Promise<boolean> { const service = this.held()?.inside().service; if (!service) return false; await service.check(); return true; }
  heldAnswers(): { control: { op: string; answer: boolean }[]; agent: boolean } { return this.answers(); }
  used(): number { return this.controlUsed(); }
  durableFacts(): ReturnType<HostedAgent["durable"]> { return this.durable(); }
  /** The custody record under an idempotency key: its intent digest, attempt and outcomes. */
  custodyRecord(key: string): ReturnType<HostedAgent["custodyOf"]> { return this.custodyOf(key); }
  /** The open streams and sessions this instance holds. */
  counts(): { streams: number; sessions: number } { const http = this.held()?.inside().http; return { streams: http?.streams ?? 0, sessions: http?.sessions.size ?? 0 }; }
  protected override ports() {
    const scopes = this.env.PLATFORM;
    return {
      ...(hostedTest.metrics ? { metrics: hostedTest.metrics } : {}),
      ...(hostedTest.controlBudget ? { controlBudget: hostedTest.controlBudget } : {}),
      ...(hostedTest.custodyBounds ? { custodyBounds: { ...hostedTest.custodyBounds, fail: (point: "keep" | "dispatch" | "result" | "segment") => { if (hostedTest.failWrite === point) { hostedTest.failWrite = null; throw new Error("SQLITE_FULL: scripted"); } } } } : {}),
      fault: (fence: string) => { if (hostedTest.faultAt === fence) { hostedTest.faultAt = null; this.evict(); throw new ScriptedReset(fence); } },
      sessionFault: () => { if (hostedTest.failSession) { hostedTest.failSession = false; throw new Error("SQLITE_FULL: scripted session write"); } },
      configHold: () => hostedTest.configHold ?? undefined,
      now: () => hostedTest.now?.() ?? Date.now(), every: () => () => {},
      pause: (waiting: readonly string[]) => hostedTest.pause?.(waiting) ?? new Promise<void>((r) => setTimeout(r, 50)),
      fetch: (async (url: string, init?: RequestInit) => {
        const response = await route(new Request(url, init), scopes);
        if (hostedTest.lose !== null && new URL(url).pathname.endsWith(hostedTest.lose)) { hostedTest.lose = null; await response.body?.cancel(); throw new Error("scripted loss of the reply"); }
        return response;
      }) as never,
    };
  }
}
