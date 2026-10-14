/**
 * Custody fixtures shared by `custody.test.ts` and the child processes it starts (`custody-child.ts`). The scope's answers are
 * scripted: `deliver` and `settle` are STAND-INs for a scope's submit and settlement.
 */
import type { Answer, Receipt, ScopeRef, SignedIntent } from "@generalbusiness/dap-contract";
import { intentDigest, timeOf } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedIntent } from "@generalbusiness/artroom-client";
import type { Envelope, Identity } from "../../src/index.ts";

export const signer = secretSigner(new Uint8Array(32).fill(7));
export const lane: ScopeRef = { scope: "sc_lane", inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa", kind: "lane" } as ScopeRef;
export const resource: ScopeRef = { scope: "sc_other", inc: "in_bbbbbbbbbbbbbbbbbbbbbbbbbb", kind: "lane" } as ScopeRef;
export const T0 = Date.parse("2099-01-01T00:00:00Z");
export const notAfter = timeOf(T0 + 15 * 60_000);

export const identity = (key: string): Identity => ({ service: "https://scopes.test", membership: null, signer: signer.key, target: lane, key });
export const build = (key: string, comment = "hello") => async (): Promise<{ binding: { definition: string; kind: string; declaration: null; pinned: "platform:inbox@1" }; envelope: Envelope }> => ({
  binding: { definition: "issue", kind: "comment", declaration: null, pinned: "platform:inbox@1" },
  envelope: { signed: await signedIntent(signer, { to: lane, kind: "comment", fields: { body: comment } }, { idempotencyKey: key, now: T0 }), beside: {} },
});
export const receiptOf = (signed: SignedIntent, seq: number): Receipt => ({ fact: { at: lane, seq, hash: `sha256:${"a".repeat(64)}` }, definition: "platform:inbox@1", intent: intentDigest(signed.intent), effects: [], sends: [], epoch: 0 });
export const accepted = (signed: SignedIntent, seq = 3): Answer => ({ answer: "accepted", receipt: receiptOf(signed, seq) });
export const refused: Answer = { answer: "refused", reason: "guard-failed", name: "nope", judgedAt: { seq: 2, hash: `sha256:${"b".repeat(64)}` } };
