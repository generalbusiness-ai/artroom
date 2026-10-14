/** The bindings of the test Worker (wrangler.test.jsonc). */
declare namespace Cloudflare {
  interface Env {
    NET: DurableObjectNamespace;
    /** The deployed class with the production authority, for the scenarios on a room (`room.ts`). */
    PLATFORM: DurableObjectNamespace;
    /** Typed only: the scope package's test support names it, which `room.ts` reaches through that package's `repository.ts`. This Worker binds none, and no lane test reads it. */
    SCOPES: DurableObjectNamespace;
    /** The test Worker's own `NetService` entrypoint, as a service binding: the contract's `ScopeApi`. */
    API: Fetcher;
  }
}
