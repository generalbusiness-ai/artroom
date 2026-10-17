import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type ScopeId, type Seed } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, definitionDigest, intentDigest, scopeIdOf, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
import { beginSessionFixture } from "../../../../packages/scope/test/session-settings.ts";
import { act, loadChange, openRoom, type Room as PageRoom } from "../../page/src/data.ts";
import { checkEditRequest, continueEdit, editFields, prepareEdit } from "../../page/src/retained-editor-data.ts";
import { net } from "./support/graph.ts";
import { room, rita, Platform, settle, routed } from "./support/room.ts";
import { changeDemo3, DIGESTS, issue } from "../src/index.ts";

// Real Native partition, member session, Page editor, retained source,
// signed requests and creation follow-up. Git, clock, scheduler and one
// lost HTTP acknowledgment are labelled stand-ins; no browser or push.
test("native retained editor keeps its accepted unknown opening on the original partition across handoff", async () => {
  const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: "a test reader" });
  let partName: ScopeId | undefined;
  try {
    const r = await room({ partitioned: true, openPartition: false, rootBounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 }, roster: [] });
    const digest = definitionDigest(changeDemo3);
    await r.activate(changeDemo3, digest); await r.activate(issue, DIGESTS.issue);
    const root = await r.root.at(), membership = await r.M.at();
    const signed = await r.root.intent(rita, "open-partition", { expected: await r.root.expected({ repository: 0 }) });
    const seed: Seed = { v: 1, kind: "directory", definition: C.partition, creator: root, cause: intentDigest(signed.intent), ordinal: 0 };
    const P = new Platform(scopeIdOf(seed)); partName = P.name;
    net.sized.set(P.name, { ...PROPOSED_BOUNDS, scopeEntries: 64 });
    expect(await r.root.stub.submit(signed, [])).toMatchObject({ answer: "accepted" });
    await settle(...r.scopes, P);
    const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
    const page = await openRoom({ service: "https://scopes.test", secret: rita.secret, fetch, now: () => timeMs(net.clock.now)! }, { directory: r.root.name, membership });
    const nodes = [P];
    const options = { current: () => true, pause: async (waiting: readonly string[]) => settle(...r.scopes, ...nodes, ...waiting.map(scope => new Platform(scope as ScopeId))) };
    const issueOpening = await act(page, page.directory, "open-issue", { fields: { definition: DIGESTS.issue, title: "Existing traffic", conditions: ["Reach the seal threshold"] } });
    if (issueOpening.answer.answer !== "accepted") return expect.fail("native index fixture issue refused");
    const I = await P.created(issueOpening.answer.receipt.fact.seq); nodes.push(I);
    await options.pause([]);
    const opening = await act(page, page.directory, "open-pr", { fields: { definition: digest, title: "Original retained file", draft: false } });
    if (opening.answer.answer !== "accepted") return expect.fail(`native original opening refused: ${canonicalize(opening.answer)}`);
    const sourceLane = await P.created(opening.answer.receipt.fact.seq); nodes.push(sourceLane);
    await options.pause([]);
    expect((await act(page, sourceLane.name, "ask-rules", { on: 0 })).answer.answer).toBe("accepted");
    await options.pause([]);
    const draft = { title: "Source", path: "docs/source.md", content: "# Native retained source\n" };
    const collected = await act(page, sourceLane.name, "propose-file", { fields: editFields(draft, r.firstHead) });
    if (collected.answer.answer !== "accepted") return expect.fail("native source collection refused");
    const frozen = await act(page, sourceLane.name, "propose-manifest", { fields: { base: r.firstHead, files: [{ path: draft.path, entry: collected.answer.receipt.fact, digest: editFields(draft, r.firstHead)["digest"]! }] } });
    expect(frozen.answer.answer, canonicalize(frozen.answer)).toBe("accepted");
    if (frozen.answer.answer !== "accepted") return;
    await options.pause([]);
    const source = await loadChange(page, sourceLane.name);
    let lost = false, openings = 0;
    const watched: PageRoom = { ...page, session: { ...page.session, fetch: (async (url, init) => {
      const request = init?.method === "POST" && new URL(url).pathname.endsWith("/acts") ? JSON.parse(String(init.body)).signed : null;
      if (request?.intent.kind === "open-pr") openings++;
      const response = await fetch(url, init);
      if (!lost && request?.intent.kind === "open-pr") { lost = true; await (response as unknown as Response).body?.cancel(); throw new Error("Lost accepted opening acknowledgment"); }
      return response;
    }) as Fetch } };
    const task = await prepareEdit(watched, source, frozen.answer.receipt.fact.seq, { title: "Retained edit after handoff", path: "docs/next.md", content: "\ufeff# café\r\n" }, options);
    expect([task.directory, task.context.directory]).toEqual([await P.at(), root]);
    await continueEdit(watched, task, options);
    expect(task.state).toBe("unknown");
    expect(openings).toBe(1);
    const original = canonicalize(task.steps[0]!.signed);
    // Only an explicit native seal moves the active target. The already
    // accepted request remains the same old-partition opening.
    for (let n = 0; n < 80 && (await P.summary()).at.seq + 1 < 16; n++) {
      await I.did(rita, "edit-own", { on: 0, expected: await I.expected({ on: 0 }), fields: { title: `Editor handoff ${n}` } });
      await options.pause([]);
    }
    expect((await P.summary()).at.seq + 1).toBeGreaterThanOrEqual(16);
    await P.did(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) });
    await options.pause([]);
    const creating = (await r.root.summary()).value.items.find(item => item.type === "partition" && item.state === "creating")!;
    const Q = await r.root.created(creating.id); nodes.push(Q); await options.pause([]);
    expect((await Q.summary()).value.status).toBe("active");
    await continueEdit(watched, task, options);
    expect([task.state, openings, canonicalize(task.steps[0]!.signed)]).toEqual(["unknown", 1, original]);
    await checkEditRequest(page, task, options);
    await continueEdit(page, task, options);
    expect(task.state, task.message).toBe("recorded");
    expect(task.steps.map(step => [step.kind, step.receiptVerified])).toEqual([["open-pr", true], ["ask-rules", true], ["propose-file", true], ["propose-manifest", true]]);
    expect(canonicalize(task.steps[0]!.signed)).toBe(original);
    expect((await new Platform(task.lane!).entries())[0]!.input).toMatchObject({ type: "genesis", seed: { creator: await P.at() } });
    expect((await Q.summary()).value.items.filter(item => item.type === "lane")).toEqual([]);
    expect((await r.G.item(0)).values["head"]).toBe(r.firstHead);
  } finally { if (partName) net.sized.delete(partName); owner.close(); }
}, 60_000);
