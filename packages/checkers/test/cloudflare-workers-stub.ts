// What `cloudflare:workers` gives the classes in src/worker.ts, for loading
// them in Node tests: base classes that keep `ctx` and `env`.
export class DurableObject<Env = unknown> {
  protected readonly ctx: unknown;
  protected readonly env: Env;
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
export class WorkerEntrypoint<Env = unknown> extends DurableObject<Env> {}
