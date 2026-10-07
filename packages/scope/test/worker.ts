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

import { platform } from "@generalbusiness/artroom-platform";
import { lacking } from "@generalbusiness/artroom-platform/testing";
import { ScopeObject, type Outside, type OutsideGiven, type Wiring } from "../src/index.ts";
import { sessionsOf, type LimitConfig } from "../src/index.ts";
import { codeLost, controls, net, netPorts, testPorts } from "../src/testing.ts";
import { DeployedScope, ScopeService, route, sessionWiring, type Env } from "../src/worker.ts";
import { outsideOf, owners, wired } from "./outside.ts";

export { ScopeObject };

export class TestScope extends ScopeObject {
  protected override wiring(name: string | undefined): Wiring {
    const c = controls(name ?? "");
    return { ports: { ...testPorts(c), outside: outsideOf(name ?? ""), owners, ...wired.get(name ?? "")?.() }, bounds: c.bounds, reads: c.reads };
  }
}

type NetEnv = Env & { NET: DurableObjectNamespace };

export class NetScope extends DeployedScope<NetEnv> {
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
export const platformNet: { without: string | null; sessions: boolean; secret: string | null; limits: LimitConfig | null; inspector: string | null } = { without: null, sessions: false, secret: null, limits: null, inspector: null };
/** Test-only, name-bound outside factories. ScopeObject supplies its live
 * readonly store facade after storage exists; no default port is changed. */
export const platformOutside = new Map<string, (given: OutsideGiven, sql: Pick<SqlStorage, "exec">) => Outside>();
/** The name of the test deployment, which a session's token names. */
export const TEST_DEPLOYMENT = "artroom-scope-test";

type PlatformEnv = Env & { PLATFORM: DurableObjectNamespace };

export class PlatformScope extends DeployedScope<PlatformEnv> {
  protected override scopes() { return this.env.PLATFORM; }
  protected override wiring(name: string | undefined): Wiring {
    const deployed = super.wiring(name);
    const { resolver, definitions, transport } = deployed.ports as Required<NonNullable<Wiring["ports"]>>;
    // With a test secret the session configuration is the test's. With none it is the deployed one, from this Worker's bindings.
    const session = sessionWiring(() => (platformNet.secret === null ? deployed.sessions!() : sessionsOf(platformNet.secret, TEST_DEPLOYMENT)));
    const outside = platformOutside.get(name ?? "");
    return {
      ...deployed,
      ...(outside ? { outside: (given: OutsideGiven) => outside(given, this.ctx.storage.sql) } : {}),
      sessions: session.sessions,
      readers: (given) => {
        const real = session.readers(given);
        return { allows: (reader, read) => (!platformNet.sessions || (platformNet.inspector !== null && reader === platformNet.inspector) ? true : real.allows(reader, read)) };
      },
      ...(platformNet.limits ? { limits: platformNet.limits } : {}),
      ports: {
        ...deployed.ports, clock: net.clock,
        // Transport that a test can hold: a send that `net.hold` matches is not delivered, and its attempt gets no answer.
        transport: { send: (envelope) => (net.hold?.(envelope) ? Promise.resolve(null) : transport!.send(envelope)) },
        // A scripted peer: an entry that a test wrote by hand, for a lane that sends a notice. Every other entry is read from the real object.
        resolver: { read: (fact, seconds) => { const peer = net.peers.get(fact.hash); return peer ? Promise.resolve(peer) : resolver.read(fact, seconds); } },
        definitions: { read: (named, holder) => definitions.read(named, holder), platform: (named) => (platformNet.without === null ? platform(named) : lacking(named, platformNet.without)) },
        // The ports that one test wired for this name: the STAND-IN host of `outside.ts`, for a register, whose one outside effect is
        // the creation of a repository at the Git host. With none wired the outside port is the production one, which sends nothing.
        ...wired.get(name ?? "")?.(),
      },
    };
  }
}

export class NetService extends ScopeService<NetEnv> {
  protected override scopes() { return this.env.NET; }
}

export default { fetch: (request: Request, env: NetEnv): Promise<Response> => route(request, env.NET) };
