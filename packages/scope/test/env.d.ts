/** The bindings of the test worker (wrangler.test.jsonc). */
declare namespace Cloudflare {
  interface Env {
    SCOPES: DurableObjectNamespace;
    AS_DEPLOYED: DurableObjectNamespace;
    NET: DurableObjectNamespace;
    /** The test worker's own `NetService` entrypoint, as a service binding. A test reads it as the `Api` of `src/worker.ts`. */
    API: Fetcher;
  }
}
