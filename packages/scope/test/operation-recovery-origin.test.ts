import { expect, test } from "vitest";
import type { OperationId, Read } from "@generalbusiness/dap-contract";
import { timeMs } from "@generalbusiness/dap-derive";
import { scriptedApplicationOrigin, scriptedOrigin } from "../../../packages/platform/test/support-origin.ts";
import type { EffectAnswer, EffectRequest, OperationStatus, Outside } from "../src/index.ts";
import type { LateAnswers } from "../src/operations.ts";
import { owners, wired } from "./outside.ts";
import { open } from "./operation-opening.ts";
import { START, at, found, reader, rita } from "./support.ts";

// Real ScopeObject, SQLite operation/send rows, restart and accepted-act
// notification. The owner metadata, resolver's immutable origin proof,
// outside answer, opening and verification signal are SCRIPTED. This tests
// the driver's metadata boundary on a generic scope, not native
// Destination authority or a native migration; those have separate witnesses.
test.each(["change", "application"] as const)("%s: a sent recovery and its late original answer stay pending without publication origin proof, then an accepted act resumes that same answer", async mode => {
  const s = await found({ deliveryBatch: 1 });
  const sent: EffectRequest[] = [], recovered: EffectRequest[] = [];
  let sourceVerified = true;
  const proof = mode === "application" ? scriptedApplicationOrigin() : scriptedOrigin();
  let deliver: LateAnswers | undefined;
  const rules: typeof owners = { rules: (owner, kind) => kind === "read" ? {
    selects: false, read: true, retries: () => false,
    wellFormed: result => result === "confirmed",
    publicationOrigin: () => ({ from: proof.from, directory: proof.directory, destination: proof.destination, ...(mode === "application" ? { mode } : {}) }),
  } : owners.rules(owner, kind) };
  const outside: Outside = {
    accepts: () => true,
    send: async request => { sent.push(request); return null; },
    late: given => { deliver = given; },
    recovery: {
      accepts: (_owner, kind) => kind === "read",
      read: async request => { recovered.push(request); return null; },
    },
  };
  wired.set(s.name, () => ({ outside, owners: rules, resolver: {
    read: async () => sourceVerified ? { entry: proof.merge, under: mode === "application" ? "declared:change" : "change", origin: proof.origin } : null,
  } }));
  const surface = () => s.object as unknown as {
    effect(): Promise<number>;
    operation(who: unknown, id: OperationId): Promise<Read<OperationStatus>>;
  };
  const status = async (id: OperationId) => {
    const answer = await surface().operation(reader, id);
    if (!answer.ok) throw new Error("the original operation must remain readable");
    return answer.value;
  };
  try {
    await s.restart();
    const opened = await open(s, { owner: "platform:destination@1", kind: "read", attempts: 1 });
    if (opened === "scope-full" || opened.length !== 1) throw new Error("the scripted opening must record one operation");
    const operation = opened[0]!;
    expect(await surface().effect()).toBe(1);
    expect(sent).toHaveLength(1);
    expect((await status(operation)).operation.attempts[0]!.outcomes).toEqual([]);
    sourceVerified = false;
    await s.restart();
    s.c.clock.now = at(s.c.bounds.drainRetrySeconds);
    await surface().effect();
    expect([recovered.length, sent.length, (await s.head()).seq]).toEqual([0, 1, 1]);
    expect(await status(operation)).toMatchObject({ state: "pending", sends: [{ attempt: 1, sent: START }] });
    const original: EffectAnswer = { result: "confirmed", evidence: { basis: "own-answer", body: { commit: "held-original" } } };
    if (!deliver) throw new Error("the runtime must register its late-answer callback");
    const answer = deliver;
    expect(await s.inside(() => answer(operation, 1, original))).toEqual({ recorded: "unavailable" });
    expect([(await s.head()).seq, (await status(operation)).operation.attempts[0]!.outcomes]).toEqual([1, []]);
    sourceVerified = true;
    // The real accepted-act notification resumes the waiting driver. This
    // ordinary remark starts the driver after the scripted resolver recovers.
    await s.did(rita, "remark", { on: 0, fields: { text: "scripted source revalidation signal" } });
    await surface().effect();
    const settled = await status(operation);
    expect(settled).toMatchObject({ state: "settled", sends: [{ attempt: 1, sent: START }] });
    expect(settled.operation.attempts[0]!.outcomes).toMatchObject([{ result: "confirmed" }]);
    expect(settled.operation.attempts[0]!.outcomes).toHaveLength(1);
    const final = (await s.sealed()).at(-1)!.entry;
    expect(final.input).toMatchObject({ type: "outcome", operation, attempt: 1, result: original.result, evidence: original.evidence });
    expect([recovered.length, sent.length]).toEqual([0, 1]);
    expect(timeMs(settled.sends[0]!.sent!)).toBe(timeMs(START));
  } finally { wired.delete(s.name); }
});
