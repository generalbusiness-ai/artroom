/** The bindings the workerd tests use (wrangler.jsonc). */
declare namespace Cloudflare {
  interface Env {
    ROOMS: DurableObjectNamespace<import("../src/room.ts").Room>;
    NAMES: DurableObjectNamespace<import("../src/room.ts").RoomNames>;
  }
}

declare namespace Cloudflare {
  interface Exports {
    default: Fetcher;
  }
}
