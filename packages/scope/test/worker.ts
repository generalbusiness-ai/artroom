/**
 * The Worker the workerd tests run. `TestScope` is the scope's object class
 * with the test ports, bounds and read bounds that the test set for its
 * name. `ScopeObject` is bound as it is deployed, with every production
 * default.
 */

import { ScopeObject, type Wiring } from "../src/index.ts";
import { controls, testPorts } from "../src/testing.ts";

export { ScopeObject };

export class TestScope extends ScopeObject {
  protected override wiring(name: string | undefined): Wiring {
    const c = controls(name ?? "");
    return { ports: testPorts(c), bounds: c.bounds, reads: c.reads };
  }
}

export default { fetch: () => new Response(null, { status: 404 }) };
