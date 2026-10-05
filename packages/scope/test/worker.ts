/**
 * The Worker the workerd tests run. `TestScope` is the scope's object class
 * with the test ports, bounds and read bounds that the test set for its
 * name, and no transport. `ScopeObject` is bound as it is deployed, with
 * every production default. `NetScope` is the deployed class in a namespace
 * of its own, `NET`, with the test ports of `netPorts`; `NetService` and the
 * default export are the deployed entrypoint and routes over that
 * namespace. The test authority reaches a scope only through these classes,
 * which the production entry, `src/worker.ts`, does not import.
 */

import { ScopeObject, type Wiring } from "../src/index.ts";
import { controls, net, netPorts, testPorts } from "../src/testing.ts";
import { DeployedScope, ScopeService, route, type Env } from "../src/worker.ts";

export { ScopeObject };

export class TestScope extends ScopeObject {
  protected override wiring(name: string | undefined): Wiring {
    const c = controls(name ?? "");
    return { ports: testPorts(c), bounds: c.bounds, reads: c.reads };
  }
}

type NetEnv = Env & { NET: DurableObjectNamespace };

export class NetScope extends DeployedScope<NetEnv> {
  protected override scopes() { return this.env.NET; }
  protected override wiring(name: string | undefined): Wiring {
    const deployed = super.wiring(name);
    return { bounds: net.bounds, ports: { ...deployed.ports, ...netPorts(net, deployed.ports!.transport!) } };
  }
}

export class NetService extends ScopeService<NetEnv> {
  protected override scopes() { return this.env.NET; }
}

export default { fetch: (request: Request, env: NetEnv): Promise<Response> => route(request, env.NET) };
