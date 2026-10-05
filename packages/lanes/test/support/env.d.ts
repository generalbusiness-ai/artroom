/** The bindings of the test Worker (wrangler.test.jsonc). */
declare namespace Cloudflare {
  interface Env {
    NET: DurableObjectNamespace;
    /** The test Worker's own `NetService` entrypoint, as a service binding: the contract's `ScopeApi`. */
    API: Fetcher;
  }
}
