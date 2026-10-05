/**
 * The Worker the workerd tests run. `TestScope` is the scope's object class
 * with the test ports, bounds and read bounds that the test set for its
 * name, no transport, and the stand-ins of `outside.ts` for the outside
 * system and for the owners of outside operations. `ScopeObject` is bound as it is deployed, with
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
 * records, through the namespace. Five of its ports are not the production
 * ones, and each is labelled: the shared scripted clock, and transport that
 * a test can hold; the test readers,
 * a stand-in for read sessions, until a test sets `platformNet.sessions`, and from then the real read sessions; the scripted peers,
 * a stand-in for a lane that sends a notice; and, while `platformNet.standIns`
 * is set, the platform package's STAND-IN rules for the three marks of
 * membership that have no rule yet.
 *
 * The package exports this file as `./testing/worker`, for the test Worker
 * of a package that runs its own definitions on real scopes.
 */

import { platform } from "@generalbusiness/artroom-platform";
import { withStandIns } from "@generalbusiness/artroom-platform/testing";
import { ScopeObject, type Wiring } from "../src/index.ts";
import { sessionsOf, type LimitConfig } from "../src/index.ts";
import { codeLost, controls, net, netPorts, testPorts } from "../src/testing.ts";
import { DeployedScope, ScopeService, route, sessionWiring, type Env } from "../src/worker.ts";
import { outsideOf, owners } from "./outside.ts";

export { ScopeObject };

export class TestScope extends ScopeObject {
  protected override wiring(name: string | undefined): Wiring {
    const c = controls(name ?? "");
    return { ports: { ...testPorts(c), outside: outsideOf(name ?? ""), owners }, bounds: c.bounds, reads: c.reads };
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
 * What a test holds of the namespace `PLATFORM`. `standIns`: true, a scope
 * there is given the STAND-IN rules of the platform package's test support
 * for the three marks of membership that the package has no rule for.
 * False: the platform definitions are exactly the platform package's, as
 * under the production wiring. `without`: the name of one stand-in rule
 * that is left out, for a version of membership that lacks one rule. Both
 * are read at each use.
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
export const platformNet: { standIns: boolean; without: string | null; sessions: boolean; secret: string | null; limits: LimitConfig | null } = { standIns: true, without: null, sessions: false, secret: null, limits: null };
/** The name of the test deployment, which a session's token names. */
export const TEST_DEPLOYMENT = "artroom-scope-test";

type PlatformEnv = Env & { PLATFORM: DurableObjectNamespace };

export class PlatformScope extends DeployedScope<PlatformEnv> {
  protected override scopes() { return this.env.PLATFORM; }
  protected override wiring(name: string | undefined): Wiring {
    const deployed = super.wiring(name);
    const { resolver, definitions, transport } = deployed.ports as Required<NonNullable<Wiring["ports"]>>;
    // With a test secret the session configuration is the test's. With none it is the deployed one, from this Worker's bindings.
    const wired = sessionWiring(() => (platformNet.secret === null ? deployed.sessions!() : sessionsOf(platformNet.secret, TEST_DEPLOYMENT)));
    return {
      ...deployed,
      sessions: wired.sessions,
      readers: (given) => {
        const real = wired.readers(given);
        return { allows: (reader, read) => (platformNet.sessions ? real.allows(reader, read) : true) };
      },
      ...(platformNet.limits ? { limits: platformNet.limits } : {}),
      ports: {
        ...deployed.ports, clock: net.clock,
        // Transport that a test can hold: a send that `net.hold` matches is not delivered, and its attempt gets no answer.
        transport: { send: (envelope) => (net.hold?.(envelope) ? Promise.resolve(null) : transport!.send(envelope)) },
        // A scripted peer: an entry that a test wrote by hand, for a lane that sends a notice. Every other entry is read from the real object.
        resolver: { read: (fact, seconds) => { const peer = net.peers.get(fact.hash); return peer ? Promise.resolve(peer) : resolver.read(fact, seconds); } },
        definitions: { read: (named, holder) => definitions.read(named, holder), platform: (named) => (platformNet.standIns ? withStandIns(named, platformNet.without) : platform(named)) },
      },
    };
  }
}

export class NetService extends ScopeService<NetEnv> {
  protected override scopes() { return this.env.NET; }
}

export default { fetch: (request: Request, env: NetEnv): Promise<Response> => route(request, env.NET) };
