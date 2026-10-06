import { expect, test } from "vitest";
import type { ObservationUse, Send } from "@generalbusiness/artroom-contract";
import { factRefOf } from "@generalbusiness/artroom-bytes";
import { judgeDelivery } from "../src/index.ts";
import { Scope, arriving, forged, keys, membership, otherLane, t } from "./fixtures.ts";
import { memberSeen, weigherWith, weigherRules } from "./fixtures-observes.ts";

// Invariant: the result uses the observation policy of the written form
// that actually produced its request. Empty effect lists do not make two
// different observation policies interchangeable.
// STAND-INS: made-up platform data, authority, observations and the peer's
// sealed answer. Derive's judges create the sending act and the result.
test("an observation-only clause belongs to the conditional form that actually made the send", () => {
  const definition = weigherWith((data) => {
    data.acts.go.fields = {
      choice: { type: "bool", required: true },
      first: { type: "member", required: true }, second: { type: "member", required: true },
    };
    data.acts.go.sends = [false, true].map((choice) => ({
      tell: {
        to: { slot: "peer" }, message: "ask", fields: {},
        if: [{ equals: { a: { field: "choice" }, b: { const: choice } } }],
        result: { applied: [] },
        observes: { applied: [{ of: "member", from: { field: choice ? "second" : "first" }, max: 1,
          window: choice ? 300 : 10, use: choice ? "reuse" : "once", without: choice ? "write" : "wait" }] },
      },
    }));
  });
  const s = new Scope(definition);
  s.did(keys.rita, "point", { on: 0, expected: { on: 1 }, fields: { peer: otherLane } });
  const origin = s.did(keys.rita, "go", { on: 0, expected: { on: 2 }, fields: { choice: true, first: keys.una.member, second: keys.vic.member } });
  expect(origin.sends).toHaveLength(1);
  expect(origin.sends[0]?.n).toBe(0);
  const request = { from: s.fact(origin.seq), n: 0 };
  const answer: Send = { n: 0, to: s.at, message: { class: "result", of: request, outcome: "applied" } };
  const source = forged(otherLane, 9, { type: "delivery", from: request.from, n: 0, message: origin.sends[0]!.message as never, decision: "applied" }, [answer]);
  const arrival = { ...answer, from: factRefOf(source.entry) };
  s.now = t(8);
  const record = (observed: readonly ObservationUse[]) => judgeDelivery(s.state, s.definition, arrival, {
    ...arriving(s, arrival, source), platform: weigherRules(), observed, observing: { membership },
  });
  const right = memberSeen(keys.vic.member.member, 1, t(3));
  const wrong = memberSeen(keys.una.member.member, 2, t(3));
  const got = record([right]);
  expect(got.result).toBe("write");
  expect(got.result === "write" && got.draft.input.type === "delivery" && "observed" in got.draft.input && got.draft.input.observed).toEqual([right]);
  // The actual clause writes without a member that cannot be read. It does
  // not wait for, or retain, the omitted form's different member.
  const absent = record([wrong]);
  expect(absent.result).toBe("write");
  expect(absent.result === "write" && "observed" in absent.draft.input ? absent.draft.input.observed : null).toBeNull();
});
