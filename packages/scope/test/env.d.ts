/** The bindings of the test worker (wrangler.test.jsonc). */
declare namespace Cloudflare {
  interface Env {
    SCOPES: DurableObjectNamespace;
    METRIC_CONTROL: DurableObjectNamespace;
    AS_DEPLOYED: DurableObjectNamespace;
    NET: DurableObjectNamespace;
    PLATFORM: DurableObjectNamespace;
    /** The hosted MCP endpoint's namespaces, over PLATFORM (test/worker.ts). */
    REGISTRIES: DurableObjectNamespace;
    AGENTS: DurableObjectNamespace;
    /** The test worker's own `NetService` entrypoint, as a service binding. A test reads it as the `Api` of `src/worker.ts`. */
    API: Fetcher;
  }
}
