import { afterAll, beforeAll, expect, test } from "vitest";
import { isRefusal } from "../src/index.ts";
import { joinAs, sha, startRoom } from "./support/setup.ts";
import type { FakeRoom } from "./support/fake-room.ts";

let room: FakeRoom;
beforeAll(async () => {
  ({ room } = await startRoom());
});
afterAll(() => room.stop());

test("the demo loop over HTTPS: join, claim, workspace, propose, review, land, wait", async () => {
  const alice = await joinAs(room, "@alice");
  const bob = await joinAs(room, "@bob");
  expect(alice.api.name).toBe("acme/web");
  const claim = await alice.api.claim({ goal: "Rate-limit login", scope: ["src/api/**"] });
  if (isRefusal(claim)) throw new Error(claim.rule);
  const ws = await alice.api.workspace(claim);
  if (isRefusal(ws)) throw new Error(ws.rule);
  const ready = await alice.api.wait(ws, { until: ["ready", "failed"] });
  expect(ready.state).toBe("ready");
  const grant = await alice.api.workspaceToken(claim);
  if (isRefusal(grant)) throw new Error(grant.rule);
  const p = await alice.api.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "s" });
  if (isRefusal(p)) throw new Error(p.rule);
  const r = await bob.api.review(p, { verdict: "approve", scope: ["src/api/**"], text: "ok" });
  if (isRefusal(r)) throw new Error(r.rule);
  const l = await alice.api.land(claim, p);
  if (isRefusal(l)) throw new Error(l.rule);
  const done = await alice.api.wait(l.op, { until: ["landed", "failed"] });
  expect(done.state).toBe("landed");
});
