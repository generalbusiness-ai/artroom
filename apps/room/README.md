# dap-room

Room is the repository application built on dap. Its
[guides](docs/first-change.md), [lane definitions](lanes/README.md) and
[browser page](docs/page.md) live here. The framework and public platform
SDK remain under `packages/`.

[worker.ts](worker.ts) is the application entry point. It exports the
existing Scope and MCP classes and adds the Room, Counter, lending demo
and brand routes in [fetch.ts](fetch.ts). The reusable Scope Worker in
`packages/scope` serves the framework routes without importing these apps.

[wrangler.jsonc](wrangler.jsonc) owns the existing `artroom-scope` deployment.
[wrangler.lending.jsonc](wrangler.lending.jsonc) retains the lending demo's
separate configuration. Moving these files changes neither Worker names,
Durable Object class names nor served URLs. Counter shares this application
Worker; it has no independent Worker deployment.

The [deployment guide](../../docs/deploy.md) describes the operator's
procedure. Source consolidation runs no deployment. Hugh's current hold
prohibits Cloudflare infrastructure deployments until further notice.

Build the Room page locally from the repository root with:

```sh
npm run build --workspace @generalbusiness/dap-page
```

This writes the app-owned asset module used by its route. It does not
publish it. [Testing](../../docs/testing.md) describes focused checks and
the single gate before Source review.
