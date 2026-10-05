/**
 * For the tests of outside operations. Two stand-ins, and each proves only
 * the boundary it exposes.
 *
 * - `OutsideDouble` stands for the outside system and its port. It records
 *   each request that reaches it, and answers a request only when the test
 *   has given that attempt an answer, by hand. It shows what the scope does
 *   with an answer, and nothing about a Git host.
 * - `owners` stands for the rules of the owners of operations, which later
 *   steps deliver with the capabilities and the platform definitions.
 *
 * A test and the object it drives run in one isolate, so a test steers the
 * double it shares with the object by name. The double outlives a restart
 * of the object, as the outside system does.
 */

import type { OperationId } from "@generalbusiness/artroom-contract";
import type { Opening, OperationRules, Owners } from "@generalbusiness/artroom-derive";
import type { EffectAnswer, EffectRequest, LateAnswers, Outside, Ports } from "../src/index.ts";

const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 1); });
const keyOf = (operation: OperationId, attempt: number) => `${operation}#${attempt}`;

export class OutsideDouble implements Outside {
  /** Every request that reached the outside system, in order. */
  readonly sent: EffectRequest[] = [];
  /** False: the port sends nothing, as the production default does. */
  accepting = true;
  /** The function the driver of the object in memory gave for late answers. */
  deliver: LateAnswers | null = null;
  readonly #answers = new Map<string, EffectAnswer | null>();

  accepts(): boolean { return this.accepting; }
  /** The request has reached the outside system when this is called. Its answer comes when the test gives one. */
  async send(request: EffectRequest): Promise<EffectAnswer | null> {
    this.sent.push(request);
    const key = keyOf(request.operation, request.attempt);
    while (!this.#answers.has(key)) await tick();
    return this.#answers.get(key)!;
  }
  late(deliver: LateAnswers): void { this.deliver = deliver; }

  /** The answer that the request of that attempt gets, now or when it is sent. Null: none comes. */
  answer(operation: OperationId, attempt: number, answer: EffectAnswer | null): void { this.#answers.set(keyOf(operation, attempt), answer); }
  /** Resolves when `count` requests have reached the outside system. */
  async reached(count: number): Promise<void> { while (this.sent.length < count) await tick(); }
  /** The attempts that were sent, in order. */
  get attempts(): string[] { return this.sent.map((r) => keyOf(r.operation, r.attempt)); }
}

const doubles = new Map<string, OutsideDouble>();
/** The double of the scope with that name, made on first use. */
export function outsideOf(name: string): OutsideDouble {
  let made = doubles.get(name);
  if (!made) doubles.set(name, (made = new OutsideDouble()));
  return made;
}

/** A made-up owner's rules: a push is decided by a read, selects nothing, and its rule always asks for another attempt. */
const push: OperationRules = { selects: false, read: true, retries: () => true };
export const pushOf = (attempts: number): Opening => ({ owner: "platform:destination@1", kind: "push", attempts });
/**
 * A made-up kind whose confirmed outcome opens a cleanup, a push of one
 * attempt. `closure` is what its owner declares for that, and a test sets
 * it. While it is less than the cleanup reserves, the owner has broken its
 * own declaration: a confirmed outcome of a mint is not written, whatever
 * the scope's turn can do for any other outcome.
 */
export const mint: OperationRules = { selects: false, read: false, retries: () => false, derives: (_view, _operation, outcome) => ({ effects: [], sends: [], opens: outcome.result === "confirmed" ? [pushOf(1)] : [] }) };
export const MINT: Opening = { owner: "platform:destination@1", kind: "mint", attempts: 1 };
export const owners: Owners = { rules: (_owner, kind) => (kind === "push" ? push : kind === "mint" ? mint : null) };
/** An operation of a kind that the made-up owner has no rules for, as it has for no kind but a push and a mint: no runtime of these tests sends it. */
export const FENCE: Opening = { owner: "platform:destination@1", kind: "fence", attempts: 1 };

/**
 * Ports that one test gives the scope with that name, in place of the test
 * ports and the two stand-ins above. The function is called once for each
 * life of the object, so what it makes lives as long as the object's memory.
 * `hosted.ts` uses it to run a scope on the capability's code with the token
 * driver of the git package.
 */
export const wired = new Map<string, () => Partial<Ports>>();
