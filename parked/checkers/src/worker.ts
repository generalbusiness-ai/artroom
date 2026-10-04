/**
 * The checker service Worker, for production (wrangler.jsonc).
 *
 * - `TestsCheckerService`, `TypesCheckerService` and `LlmReviewService` are
 *   the RPC entrypoints the Room calls over a service binding:
 *   `handle(job) → Result<Check>` (the contract's `CheckerService`). A job
 *   arrives only that way (R-EXEC-8): this Worker's `fetch` accepts no job
 *   and builds none, and it has no harness routes. The measurement harness
 *   is a separate Worker (measure/harness/), never deployed with this one.
 * - The room is each job's own. The service resolves `job.room`, a room ID,
 *   through the `ROOM` service binding (the Room Worker's `ArtroomService`)
 *   before any sandbox starts, and submits the signed check to that room,
 *   which admits it only if it binds a job the room recorded (R-OBL-3,
 *   R-CARRY-15). Without the binding the entrypoints refuse to run. No room
 *   ID is configured, so one deployment serves every room on the binding.
 * - The service signs with its key (secret `CHECKER_KEY`) as a member's own
 *   key (R-ADM-3, case a): it names no delegation.
 * - `RunnerBox` and `RunnerGateway` are the runner sandbox (container.ts,
 *   sandbox.ts): a new container for every job.
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import type { ActRecord, ArtroomService, Check, CheckJob, Result, RoomId, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { unavailable, type CheckerServices, type RoomPort, type RoomResolver, type RunnerProvider } from "./checker.ts";
import { TestsChecker, TypesChecker } from "./checkers.ts";
import { LlmReviewer, type Model } from "./llm.ts";
import { importSigner } from "./signing.ts";
import { parseNamespaces } from "./job.ts";
import type { RunnerBox } from "./container.ts";
import { runnerProvider, type RunnerStub } from "./sandbox.ts";

export { RunnerBox, RunnerGateway } from "./container.ts";

export interface Env {
  readonly ARTIFACTS_HOST: string;
  /** The Artifacts namespaces jobs may read from, comma-separated (`parseNamespaces`). */
  readonly ARTIFACTS_NAMESPACES: string;
  /** The pinned runner image (container.ts). */
  readonly RUNNER_IMAGE: string;
  readonly LLM_MODEL: string;
  readonly CHECKER_KEY: string;
  readonly AI: Ai;
  readonly RUNNER: DurableObjectNamespace<RunnerBox>;
  /** The Room Worker's `ArtroomService`, as a service binding. Required: without it no job runs. */
  readonly ROOM?: ArtroomService;
}

/** Runner sandboxes for jobs (R-EXEC-1, R-EXEC-7): a new `RunnerBox`, so a new container, for every job. */
export function runners(env: Pick<Env, "RUNNER">): RunnerProvider {
  return runnerProvider({ fresh: () => env.RUNNER.get(env.RUNNER.newUniqueId()) as unknown as RunnerStub, registry: ["registry.npmjs.org"] });
}

/** What a checker needs: its key, the job's room, runners, and the host and namespaces its jobs may read. */
export async function checkerServices(env: Env, checker: string, room: RoomPort | RoomResolver, fixedRoom?: RoomId): Promise<CheckerServices> {
  return {
    signer: await importSigner(env.CHECKER_KEY),
    room,
    runners: runners(env),
    expectations: { ...(fixedRoom ? { room: fixedRoom } : {}), checker, host: env.ARTIFACTS_HOST, namespaces: parseNamespaces(env.ARTIFACTS_NAMESPACES), now: Date.now },
  };
}

/**
 * The production room of each job: `ArtroomService.room(job.room)` over the
 * `ROOM` binding. Throws `unavailable` when no room is bound.
 */
export function productionRoom(env: Pick<Env, "ROOM">): RoomResolver {
  const service = env.ROOM;
  if (!service) throw unavailable("No room is bound to this checker service (the ROOM service binding), so it cannot record a check.");
  return async (room) => {
    const wire = await service.room(room);
    return { submit: (act: SignedEnvelope) => wire.submit(act) as Promise<Result<ActRecord>> };
  };
}

/** Workers AI as a `Model`. The model is configurable; no external key exists. */
export function workersAi(env: Pick<Env, "AI" | "LLM_MODEL">): Model {
  return async (system, user) => {
    const out = (await (env.AI as unknown as { run(m: string, i: unknown): Promise<unknown> }).run(env.LLM_MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1200,
      temperature: 0,
    })) as { response?: unknown } | string;
    return typeof out === "string" ? out : typeof out.response === "string" ? out.response : JSON.stringify(out.response ?? out);
  };
}

/** A checker's environment: the Worker's, the room it submits to, and, for the harness, its one fixed room. */
export interface CheckerEnv {
  readonly env: Env;
  readonly room: RoomPort | RoomResolver;
  readonly fixedRoom?: RoomId;
}

export class Tests extends TestsChecker<CheckerEnv> {
  protected services() {
    return checkerServices(this.env.env, this.name, this.env.room, this.env.fixedRoom);
  }
}
export class Types extends TypesChecker<CheckerEnv> {
  protected services() {
    return checkerServices(this.env.env, this.name, this.env.room, this.env.fixedRoom);
  }
}
export class Llm extends LlmReviewer<CheckerEnv> {
  protected get modelName() {
    return this.env.env.LLM_MODEL;
  }
  protected services() {
    return checkerServices(this.env.env, this.name, this.env.room, this.env.fixedRoom);
  }
  protected model() {
    return workersAi(this.env.env);
  }
}

export const CHECKERS = { tests: Tests, types: Types, "llm-review": Llm } as const;
export type CheckerName = keyof typeof CHECKERS;

/** An entrypoint refuses to start with a missing, empty or malformed `ARTIFACTS_NAMESPACES`: nothing it would run could be checked. */
abstract class CheckerEntrypoint extends WorkerEntrypoint<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    parseNamespaces(env.ARTIFACTS_NAMESPACES);
  }
}

export class TestsCheckerService extends CheckerEntrypoint {
  async handle(job: CheckJob): Promise<Result<Check>> {
    return new Tests(this.ctx, { env: this.env, room: productionRoom(this.env) }).handle(job);
  }
}
export class TypesCheckerService extends CheckerEntrypoint {
  async handle(job: CheckJob): Promise<Result<Check>> {
    return new Types(this.ctx, { env: this.env, room: productionRoom(this.env) }).handle(job);
  }
}
export class LlmReviewService extends CheckerEntrypoint {
  async handle(job: CheckJob): Promise<Result<Check>> {
    return new Llm(this.ctx, { env: this.env, room: productionRoom(this.env) }).handle(job);
  }
}

/** No HTTPS route accepts or builds a job (R-EXEC-8). */
export default {
  async fetch(): Promise<Response> {
    return new Response("Not found\n", { status: 404 });
  },
};
