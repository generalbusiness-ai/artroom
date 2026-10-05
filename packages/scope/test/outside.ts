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
import type { EffectAnswer, EffectRequest, LateAnswers, Outside } from "../src/index.ts";

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
export const owners: Owners = { rules: (_owner, kind) => (kind === "push" ? push : null) };
export const pushOf = (attempts: number): Opening => ({ owner: "platform:destination@1", kind: "push", attempts });
