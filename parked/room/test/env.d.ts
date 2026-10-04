/** The bindings the workerd tests use (wrangler.jsonc). */
declare namespace Cloudflare {
  interface Env {
    ROOMS: DurableObjectNamespace<import("../src/room.ts").Room>;
    REGISTRY: DurableObjectNamespace<import("../src/registry.ts").Registry>;
  }
}

declare namespace Cloudflare {
  interface Exports {
    default: Fetcher;
  }
}
