import { expect, test } from "vitest";
import type { OperationId, Read } from "@generalbusiness/dap-contract";
import type { EffectRequest, OperationStatus, Outside } from "../src/index.ts";
import type { LateAnswers } from "../src/operations.ts";
import { owners, wired } from "./outside.ts";
import { open } from "./operation-opening.ts";
import { create, reader } from "./support.ts";

// Real ScopeObject and SQLite send/outcome rows; the owner and outside are
// SCRIPTED. This shows the dispatch phase, not native file supersession.
test("a known local refusal is recorded before the sent mark; a later stale signal never recalls or resends an unknown original", async () => {
  const s = await create();
  const sent: EffectRequest[] = [];
  let stale = true, checked = 0, notified = 0, late: LateAnswers | undefined;
  const outside: Outside = { accepts: () => true, send: async request => { sent.push(request); return null; }, late: give => { late = give; }, judged: () => { notified++; } };
  const rules: typeof owners = { rules: (_owner, kind) => kind === "read" ? {
    selects: false, read: true, retries: () => false,
    beforeSend: () => { checked++; return stale ? { basis: "own-answer", body: { send: "not-sent", reason: "superseded" } } : null; },
    wellFormed: result => result === "refused" || result === "unknown" || result === "confirmed",
  } : null };
  const surface = () => s.object as unknown as { effect(): Promise<number>; operation(who: unknown, id: OperationId): Promise<Read<OperationStatus>> };
  const status = async (id: OperationId) => {
    const value = await surface().operation(reader, id);
    if (!value.ok) throw new Error("the recorded operation remains readable");
    return value.value;
  };
  wired.set(s.name, () => ({ outside, owners: rules }));
  try {
    await s.restart();
    const first = await open(s, { owner: "platform:destination@1", kind: "read", attempts: 1 });
    if (first === "scope-full") throw new Error("the fixture opens its first operation");
    expect(await surface().effect()).toBe(1);
    expect(sent).toHaveLength(0);
    expect(notified).toBe(0);
    expect(await status(first[0]!)).toMatchObject({ state: "settled", sends: [{ sent: null }] });
    expect((await status(first[0]!)).operation.attempts[0]!.outcomes).toMatchObject([{ result: "refused" }]);
    expect((await s.sealed()).at(-1)!.entry.input).toMatchObject({ type: "outcome", result: "refused", evidence: { body: { send: "not-sent" } } });
    stale = false;
    const second = await open(s, { owner: "platform:destination@1", kind: "read", attempts: 1 });
    if (second === "scope-full") throw new Error("the fixture opens its second operation");
    await surface().effect();
    expect(sent).toHaveLength(1);
    const id = second[0]!;
    const before = await status(id);
    expect(before.sends[0]!.sent).not.toBeNull();
    expect(before.operation.attempts[0]!.outcomes).toMatchObject([{ result: "unknown" }]);
    stale = true;
    await s.restart();
    await surface().effect();
    if (!late) throw new Error("the original late-answer channel is retained");
    const answer = late;
    expect(await s.inside(() => answer(id, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { send: "accepted" } } }))).toMatchObject({ recorded: "written" });
    expect([checked, sent.length]).toEqual([2, 1]);
    expect((await status(id)).operation.attempts[0]!.outcomes.map(outcome => outcome.result)).toEqual(["unknown", "confirmed"]);
  } finally { wired.delete(s.name); }
});
