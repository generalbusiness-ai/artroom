import { describe, expect, test } from "vitest";
import type { Answer, Head, Intent, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { newIncarnation, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { d } from "@generalbusiness/artroom-derive/testing";
import { JoinLimits, addressKey, isJoin, type LimitConfig } from "../src/index.ts";
import { soon } from "./net.ts";
import { office, rita, routed, una, vic, type Platform } from "./repository.ts";
import { platformNet } from "./worker.ts";

// The plan's T39 (authority note, section 3.6, "The limits"; review rows M3 and M4; the proof plan's row for O10). The numbers are FIXTURE
// VALUES: no adopted text proposes one.

const SECRET = "the secret of an invitation, which has 32 bytes or more";
const FIXTURE: LimitConfig = { windowSeconds: 60, failures: 3, windows: 2, waiting: 1, joinBytes: 16 * 1024 };
const HEAD: Head = { seq: 7, hash: d("7") };
const M: ScopeRef = { scope: scopeIdOf({ v: 1, kind: "membership", definition: d("a"), creator: null, cause: d("b"), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(3)), kind: "membership" };
let keys = 0;
const join = (who: typeof una, secret = SECRET): SignedIntent => {
  const intent: Intent = { v: 1, to: M, actor: who.key, kind: "join", on: null, expected: {}, fields: { invitation: 3, secret }, idempotencyKey: `j${keys++}`, notAfter: soon(60) };
  return signIntent(intent, who.secret);
};
/** A join that names the real invitation, with a signature that is not the new key's. */
const junk = (): SignedIntent => ({ ...join(una), sig: join(vic).sig });
const said = (answer: Answer) => (answer.answer === "refused" ? (answer.name ?? answer.reason) : answer.answer === "unavailable" ? answer.reason : answer.answer);

/**
 * A STAND-IN for membership's own judgment of a join, checks 3 to 9: it admits the right secret once and answers a wrong one as check
 * 6 does. It counts its calls, which is what shows that a request did or did not reach the scope. The second test uses real membership.
 */
function membership() {
  const state = { calls: 0, used: false, gate: null as Promise<void> | null };
  const submit = (signed: SignedIntent) => async (): Promise<Answer> => {
    state.calls++;
    await state.gate;
    if (signed.intent.fields["secret"] !== SECRET) return { answer: "refused", reason: "guard-failed", name: "invitation-refused", judgedAt: HEAD };
    if (state.used) return { answer: "refused", reason: "guard-failed", name: "invitation-used", judgedAt: HEAD };
    state.used = true;
    return { answer: "accepted", receipt: {} as never };
  };
  return { state, submit };
}

describe("serving limits of a join (authority note, section 3.6; `limits.ts`)", () => {
  test("T39, the limits alone: one address cannot block an invitation; a failed join is counted after its check and never against an invitation; a full table drops its oldest window and locks nobody out; a dropped or lost window decides nothing; and the waiting bound answers `busy` to a join only", async () => {
    const limits = new JoinLimits(FIXTURE);
    const { state, submit } = membership();
    const serve = async (address: string | null, signed: SignedIntent, now = 0) => said(await limits.serve({ address, now, head: HEAD }, signed, submit(signed)));
    const [A, B, C, D, E] = ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4", "198.51.100.5"];

    // Cases a and b. Many joins from one address name the real invitation, each with a junk signature: each is `bad-intent` and none
    // reaches the scope. Then that address is `rate-limited`, before check 1: also its join with a true signature. A secret of fewer
    // than 32 bytes fails check 1, and counts the same.
    expect([await serve(A, junk()), await serve(A, junk()), await serve(A, join(una, "a short secret")), await serve(A, junk()), await serve(A, join(una)), state.calls])
      .toEqual(["bad-intent", "bad-intent", "bad-intent", "rate-limited", "rate-limited", 0]);
    // During that, a join from another address with a wrong secret reaches check 6 and is counted against that address only.
    expect([await serve(C, join(vic, `${SECRET}?`)), state.calls, limits.counts()]).toEqual(["invitation-refused", 1, { windows: 2, waiting: 0 }]);

    // Case g. The table is full. A join from a new address fails at check 6: it is answered as its check says, and the oldest window,
    // A's, is dropped to count it. The invitee then joins from another new address with the right secret: a join that does not fail needs
    // no window, and the table holds what it held.
    expect([await serve(D, join(vic, `${SECRET}!`)), limits.counts().windows, await serve(E, join(una)), limits.counts().windows]).toEqual(["invitation-refused", 2, "accepted", 2]);
    // The window that was dropped decides nothing: A is served again. The invitation was used by the invitee, and by nothing here.
    expect([await serve(A, join(una)), state.calls]).toEqual(["invitation-used", 4]);

    // A window ends by time. C had one failure at time 0: two more in the same window reach its limit, and at the window's end it is served.
    expect([await serve(C, junk(), 59_000), await serve(C, junk(), 59_999), await serve(C, join(vic), 59_999), await serve(C, join(vic), 60_000)]).toEqual(["bad-intent", "bad-intent", "rate-limited", "invitation-used"]);
    // A caller with no address, as over a service binding, is counted nowhere: its failures limit nobody.
    for (let i = 0; i < 5; i++) expect(await serve(null, junk(), 60_000)).toBe("bad-intent");

    // Cases h and i. One join waits for its secret check. A further join is `busy`, and does not reach the scope. An act that is no join is
    // not served through the limits at all, so the bound cannot delay it. The same signed bytes are admitted when they are sent again.
    const fresh = new JoinLimits(FIXTURE);
    const second = membership();
    let open!: () => void;
    second.state.gate = new Promise<void>((resolve) => { open = resolve; });
    const [one, two] = [join(una), join(vic, `${SECRET}.`)];
    const waiting = fresh.serve({ address: A, now: 0, head: HEAD }, one, second.submit(one));
    expect([said(await fresh.serve({ address: B, now: 0, head: HEAD }, two, second.submit(two))), second.state.calls, fresh.counts().waiting]).toEqual(["busy", 1, 1]);
    const revoke = signIntent({ ...one.intent, kind: "revoke-key", fields: { as: "retired" } }, rita.secret);
    expect([isJoin(one), isJoin({ ...one, intent: { ...one.intent, kind: "enrol" } }), isJoin(revoke), isJoin(null)]).toEqual([true, true, false, false]);
    open();
    expect([said(await waiting), said(await fresh.serve({ address: B, now: 0, head: HEAD }, two, second.submit(two))), fresh.counts()]).toEqual(["accepted", "invitation-refused", { windows: 1, waiting: 0 }]);

    // The key of an address. One IPv6 network of 64 bits is one address here; an IPv4 address inside an IPv6 one is that IPv4 address.
    expect([addressKey("2001:db8:1:2:aaaa::1") === addressKey("2001:DB8:1:2::9"), addressKey("2001:db8:1:3::1") === addressKey("2001:db8:1:2::1"), addressKey("::ffff:192.0.2.7"), addressKey("192.0.2.7"), addressKey("not an address"), addressKey("1:2:3"), addressKey(null)])
      .toEqual([true, false, "v4:192.0.2.7", "v4:192.0.2.7", null, null, null]);
  });

  test("T39, at a real membership scope through the Worker's route: junk-signed joins from one address that name a real invitation are refused and then limited, while the invitee joins from another address; the invitation was never counted; and an admin's act from the limited address is admitted", async () => {
    platformNet.limits = { ...FIXTURE, failures: 2 };
    try {
      const { M: scope } = await office();
      const seat = await scope.did(rita, "seat", { expected: { roster: 1 } });
      await scope.did(rita, "first-key", { fields: { member: seat }, expected: await scope.expected({ roster: 0, member: seat }) });
      const invitation = await scope.did(rita, "invite-member", { fields: { handle: "@una", role: "member", inviteHash: textDigest(SECRET), inviteEnds: soon(3600) } });
      const post = async (node: Platform, signed: SignedIntent, address: string) => {
        const response = await routed(`https://scope.test/v1/scopes/${node.name}/acts`, { method: "POST", headers: { "cf-connecting-ip": address }, body: JSON.stringify({ signed, grants: [] }) });
        return [response.status, said(await response.json() as Answer)];
      };
      const fields = { invitation, secret: SECRET };
      const real = await scope.intent(una, "join", { fields });
      const forged = async () => ({ ...(await scope.intent(una, "join", { fields })), sig: real.sig });
      const head = (await scope.summary()).at;

      expect([await post(scope, await forged(), "198.51.100.7"), await post(scope, await forged(), "198.51.100.7"), await post(scope, real, "198.51.100.7")]).toEqual([[422, "bad-intent"], [422, "bad-intent"], [503, "rate-limited"]]);
      // Nothing was judged and nothing recorded: the head has not moved, and the invitation is as it was issued.
      expect([(await scope.summary()).at, (await scope.item(invitation)).state]).toEqual([head, "invited"]);
      // The invitee, from another address, with the same signed bytes that the limited address was refused.
      expect(await post(scope, real, "203.0.113.9")).toEqual([200, "accepted"]);
      // The limited address is still limited for a join, and an admin's invitation from it is admitted: only a join is counted or bounded.
      const again = await scope.intent(rita, "invite-member", { fields: { handle: "@vera", role: "member", inviteHash: textDigest(`${SECRET}2`), inviteEnds: soon(3600) } });
      expect([await post(scope, await forged(), "198.51.100.7"), await post(scope, again, "198.51.100.7")]).toEqual([[503, "rate-limited"], [200, "accepted"]]);
    } finally {
      platformNet.limits = null;
    }
  });
});
