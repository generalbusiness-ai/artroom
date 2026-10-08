import { expect, inject, test } from "vitest";
import { b64url, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/artroom-lanes";
import { paul, proposed, rita, room, routed, una } from "../../lanes/test/support/room.ts";
import { act, actsOn, listLanes, loadChange, loadIssue, loadRules, openRoom, type Session } from "../src/index.ts";

declare module "vitest" {
  interface ProvidedContext { pageRecord: boolean }
}

const SERVICE = "https://scopes.test";

// Not a test of a property: the recorder for the page's screenshots (`test/screens.mjs`). It runs only when the root config
// provides `pageRecord`, which `PAGE_RECORD=1` sets. It runs the story of `story.scope.test.ts` to the point where the first merge
// was not reserved, then reads every screen as una would, through the page's data functions over the Worker's HTTP routes, and
// sends una's review of her own change, which the lane refuses. Each request and the Worker's answer to it is printed, in lines
// that begin `PAGE-RECORD `, for `screens.mjs` to give the browser in place of a service. The same stand-ins as the story: the
// Git host, and the scripted changed set.
test.skipIf(!inject("pageRecord"))("record the Worker's answers to the page's reads at the refused merge, for the screenshots", async () => {
  const r = await room();
  await r.publishRules({ approvals: 1, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 1, checks: [] }) });
  await r.activate(issueDemo, DEMO_DIGESTS.issue);
  await r.activate(changeDemo, DEMO_DIGESTS.change);
  const I = await r.lane(rita, "open-issue", issueDemo, DEMO_DIGESTS.issue, { title: "The parser drops comments", conditions: ["comments survive a round trip"] });

  let recording: Map<string, { status: number; body: string }> | null = null;
  const fetch = (async (url: string, init?: RequestInit) => {
    const answer = await routed(url, init);
    if (!recording) return answer;
    const body = await answer.text();
    const path = url.slice(SERVICE.length);
    // An act's or a session's body differs each time it is signed; it is answered by its path alone.
    recording.set(init?.method === "POST" ? `POST ${path}` : `GET ${path}`, { status: answer.status, body });
    return new Response(body, { status: answer.status, headers: answer.headers });
  }) as unknown as Fetch;
  const as = (who: { secret: Uint8Array }): Session => ({ service: SERVICE, secret: who.secret, fetch, now: () => timeMs(net.clock.now)! });

  const forPaul = await openRoom(as(paul), r.D.name);
  const forRita = await openRoom(as(rita), r.D.name);
  await act(forPaul, I.name, "comment", { fields: { body: "I see it too, on every file with a trailing comment." } });
  await act(forRita, I.name, "assign", { on: 0, fields: { assignees: [await r.member("@vic")] as never } });
  const { C, manifest } = await proposed(r, I, una, "@una", [], changeDemo, DEMO_DIGESTS.change);
  const forUna = await openRoom(as(una), r.D.name);
  await act(forUna, C.name, "request-review-own", { fields: { requested: await r.member("@paul") } });
  const request = (await loadChange(forUna, C.name)).requests[0]!.id;
  await act(forPaul, C.name, "review-verdict", { fields: { manifest, request, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["AGENTS.md", "src/parser.ts"], links: [], unreadable: 0 };
  await act(forRita, C.name, "merge", { fields: { manifest, reports: [] } });
  await r.publish();

  recording = new Map();
  const seen = await openRoom(as(una), r.D.name);
  await listLanes(seen);
  await loadIssue(seen, I.name);
  await actsOn(seen, I.name);
  await loadChange(seen, C.name);
  await actsOn(seen, C.name);
  expect((await act(seen, C.name, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } })).answer).toMatchObject({ answer: "refused", name: "author-cannot-review" });
  await loadChange(seen, C.name);
  await loadRules(seen);
  await actsOn(seen, r.rules.name);
  const record = { service: SERVICE, directory: r.D.name, issue: I.name, change: C.name, manifest, secret: b64url(una.secret), answers: Object.fromEntries(recording) };
  recording = null;
  // In lines of at most 64 KiB, which the test runner prints whole.
  const text = b64url(new TextEncoder().encode(JSON.stringify(record)));
  for (let at = 0, n = 0; at < text.length; at += 65536, n++) console.log(`PAGE-RECORD ${n} ${text.slice(at, at + 65536)}`);
  console.log("PAGE-RECORD end");
}, 120_000);
