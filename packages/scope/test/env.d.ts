/** The bindings of the test worker (wrangler.test.jsonc). */
declare namespace Cloudflare {
  interface Env {
    SCOPES: DurableObjectNamespace;
    AS_DEPLOYED: DurableObjectNamespace;
  }
}
