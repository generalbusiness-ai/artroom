import { expect, inject, test } from "vitest";
import { b64url } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { DEMO_DIGESTS } from "@generalbusiness/artroom-lanes";
import worker, { type Env } from "../../scope/src/worker.ts";
import { act, actsOn, joinRoom, listLanes, loadChange, loadIssue, loadRules, loadSite, openRoom, placeOf, type Room } from "../src/index.ts";
import { SERVICE, demo } from "./support/demo.ts";

declare module "vitest" {
  interface ProvidedContext { pageRecord: boolean }
}

/** One recorded answer: its status, the headers the browser needs, and its body. */
interface Recorded { status: number; headers: Record<string, string>; body: string }
const KEPT_HEADERS = ["content-type", "content-security-policy", "location", "x-content-type-options"];

// Not a test of a property: the recorder for the page's screenshots (`test/screens.mjs`). It runs only when the root config
// provides `pageRecord`, which `PAGE_RECORD=1` sets. It runs the story of `story.scope.test.ts` on the same room
// (`support/demo.ts`, with its stand-ins: the Git host and the scheduler) to the point where paul's AGENTS.md waits for the
// controller and README.md is published. Then it reads every screen as the browser will, through the page's data functions over
// the Worker's routes, and sends paul's review of his own change, which the lane refuses. It also asks the deployed Worker's entry
// for `/page/` and `/page/page.js`. Each request and its answer is printed, in lines that begin `PAGE-RECORD `, for `screens.mjs`
// to give the browser in place of a service.
test.skipIf(!inject("pageRecord"))("record the Worker's answers to the page's reads, for the screenshots", async () => {
  let recording: Map<string, Recorded> | null = null;
  const keep = async (key: string, answer: Response): Promise<Response> => {
    const body = await answer.text();
    const headers = Object.fromEntries(KEPT_HEADERS.flatMap((name) => (answer.headers.get(name) ? [[name, answer.headers.get(name)!]] : [])));
    recording?.set(key, { status: answer.status, headers, body });
    return new Response(body, { status: answer.status, headers: answer.headers });
  };
  const wrap = (routes: Fetch): Fetch => (async (url: string, init?: RequestInit) => {
    const answer = await (routes as unknown as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    if (!recording) return answer;
    const path = url.slice(SERVICE.length);
    // An act's body differs each time it is signed, so it is answered by its path alone. A session is answered by its path and the
    // key that asked, which the browser's own request names.
    const actor = path.endsWith("/sessions") ? ` ${(JSON.parse(String(init?.body)) as { request: { actor: string } }).request.actor}` : "";
    return keep(`${init?.method === "POST" ? "POST" : "GET"} ${path}${actor}`, answer);
  }) as unknown as Fetch;
  const d = await demo(wrap);
  try {
    const place = placeOf(JSON.stringify(d.config))!;
    const unas = crypto.getRandomValues(new Uint8Array(32));
    expect((await joinRoom(d.as(unas), d.link)).answer.answer).toBe("accepted");
    const forUna = await openRoom(d.as(unas), place);
    const pauls = await d.secretOf(d.paul);
    const forPaul = await openRoom(d.as(pauls), place);
    expect((await act(forUna, d.D.name, "open-issue", { fields: { definition: DEMO_DIGESTS.issue, title: "The handbook is empty", conditions: ["README.md says what the room is for"] } })).answer.answer).toBe("accepted");
    await d.pause([d.D.name]);
    const issue = (await listLanes(forUna)).issues[0]!.scope;
    await act(forPaul, issue, "comment", { fields: { body: "I will write it with artroom edit." } });
    expect((await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Write the handbook")).code).toBe(0);
    expect((await d.run(d.paul, "edit", "AGENTS.md", "--file", "agents.md", "--title", "Rules for agents")).code).toBe(1);
    const changes = (await listLanes(forPaul)).changes;
    const readme = changes.find((row) => row.title === "Write the handbook")!.scope;
    const agents = changes.find((row) => row.title === "Rules for agents")!.scope;
    const manifest = (await loadChange(forPaul, agents)).manifests[0]!.id;

    recording = new Map();
    const screens = async (room: Room) => {
      await listLanes(room);
      await loadIssue(room, issue);
      await actsOn(room, issue);
      for (const change of [readme, agents]) {
        await loadChange(room, change);
        await actsOn(room, change);
      }
      await loadRules(room);
      await actsOn(room, d.rules.name);
    };
    for (const secret of [unas, pauls]) await screens(await openRoom(d.as(secret), place));
    const seen = await openRoom(d.as(pauls), place);
    expect((await act(seen, agents, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } })).answer).toMatchObject({ answer: "refused", name: "author-cannot-review" });
    await loadChange(seen, agents);
    await actsOn(seen, agents);
    expect((await loadSite(seen, "README.md")).status).toBe(200);
    // The current change view offers separate latest-site navigation to
    // the root, not a rendered link for the immutable version.
    expect((await loadSite(seen, "")).status).toBe(200);
    // The page itself, as the deployed Worker's one entry serves it.
    for (const path of ["/page/", "/page/page.js"]) await keep(`GET ${path}`, await worker.fetch(new Request(`${SERVICE}${path}`), {} as Env));

    const record = {
      service: SERVICE, place, issue, readme, agents, manifest, people: { una: b64url(unas), paul: b64url(pauls) }, answers: Object.fromEntries(recording),
    };
    recording = null;
    // In lines of at most 64 KiB, which the test runner prints whole.
    const text = b64url(new TextEncoder().encode(JSON.stringify(record)));
    for (let at = 0, n = 0; at < text.length; at += 65536, n++) console.log(`PAGE-RECORD ${n} ${text.slice(at, at + 65536)}`);
    console.log("PAGE-RECORD end");
  } finally {
    d.done();
  }
}, 180_000);
