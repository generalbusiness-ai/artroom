import { expect, test } from "vitest";
import type { FactRef, ScopeId, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, definitionDigest, digestBytes, keyIdOfSecret, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { INVITATION_LINK } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/dap-platform";
import { DEMO_DIGESTS, changeDemo, changeDemo3, issueDemo } from "@generalbusiness/dap-lanes";
import DOC from "../../../docs/mcp.md?raw";
import { mcpRoom, type Agent } from "./support/room.ts";
import { founded } from "./support/story.ts";

type Mode = "default" | "generic";
interface Ran { calls: string[]; n: number; answers: string[] }

/** W1 recipes, excluding only the adopted, explicit public-query MCP gap. */
function inventoryRows(): { activity: string; cells: Record<Mode, string> }[] {
  const at = DOC.indexOf("## The W1 inventory");
  const table = DOC.slice(at, DOC.indexOf("\n## ", at + 5));
  const rows = table.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Activity") && !l.startsWith("|---"))
    .map((l) => l.split(" | ")).map((c) => ({ activity: c[0]!.slice(2), cells: { default: c[1]!, generic: c[2]! } }));
  const gaps = rows.filter((r) => r.activity.includes("(MCP gap:"));
  expect(gaps.map((r) => r.activity)).toEqual(["`dap items <scope> --query <canonical-item-query-JSON>` (MCP gap: public item query)"]);
  for (const gap of gaps) expect(Object.values(gap.cells)).toEqual(["Unavailable in MCP; use the SDK, CLI or Page query surface", "Unavailable in MCP"]);
  return rows.filter((r) => !gaps.includes(r));
}
/** The tools a cell names in order, consecutive repeats once, and its count: a number, or a number plus n. */
function recipeOf(cell: string): { tools: string[]; count: { k: number; n: boolean } } {
  const tools = [...cell.matchAll(/`([a-z][a-z0-9.-]*(?:@[0-9a-f]+)?)`/g)].map((m) => m[1]!).filter((n) => !n.startsWith("artroom") && !n.startsWith("git") && n !== "n");
  const counts = [...cell.matchAll(/: (\d+)( \+ n)?(?: and Git)?/g)];
  const last = counts.at(-1);
  return { tools: tools.filter((t, i) => t !== tools[i - 1]), count: { k: Number(last?.[1] ?? NaN), n: last?.[2] !== undefined } };
}
const collapse = (calls: readonly string[]) => calls.filter((t, i) => t !== calls[i - 1]);

/**
 * Every W1 recipe, executed through the server with complete arguments in one room, in one launch mode. Each recipe records the
 * tools it called; the scope's answers are asserted where the recipe claims them.
 */
async function recipes(mode: Mode): Promise<Map<string, Ran>> {
  const ran = new Map<string, Ran>();
  let demoRefusal = "";
  const room = mcpRoom();
  try {
    const rita = room.agent("rita", { mode });
    // One recipe: the calls the agents made during it, its n, and the answers of its acts.
    const recipe = async (label: string, agents: Agent[], run: () => Promise<{ n?: number; answers?: string[] } | void>) => {
      const before = agents.map((a) => a.calls.length);
      const result = (await run()) ?? {};
      const calls: string[] = [];
      for (const [i, a] of agents.entries()) calls.push(...a.calls.slice(before[i]));
      ran.set(label, { calls, n: result.n ?? 0, answers: result.answers ?? [] });
    };
    // An act: by its tool in the default mode; by actions (once a scope, within one recipe) and act in --generic mode.
    const offered = new Map<Agent, Map<string, Record<string, unknown>>>();
    const fresh = (...agents: Agent[]) => { for (const a of agents) offered.set(a, new Map()); };
    const act = async (agent: Agent, tool: string, scope: string | number, kind: string, args: Record<string, unknown>) => {
      if (mode === "default") return agent.ok(tool, { ...(typeof scope === "number" || scope.startsWith("sc_") ? { target: scope } : {}), ...args });
      const cache = offered.get(agent) ?? new Map();
      offered.set(agent, cache);
      let acts = cache.get(String(scope));
      if (!acts) { acts = await agent.ok("actions", { scope }); cache.set(String(scope), acts); }
      return agent.ok("act", { target: scope, kind, digest: acts["digest"], ...args });
    };
    const accepted = (r: Record<string, unknown>) => { expect(r["answer"], JSON.stringify(r)).toBe("accepted"); return r; };
    const seqOf = (r: Record<string, unknown>) => (r["fact"] as FactRef).seq;

    // install, create (and Create room, the same calls).
    let register!: ScopeId;
    await recipe("`dap install", [rita], async () => {
      const installed = accepted(await rita.ok("create", { definition: "platform:register@3", kind: "install", fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", founders: [rita.key] }, idempotencyKey: "install" }));
      register = installed["scope"] as ScopeId;
    });
    await room.wireRegister(register);
    await recipe("`dap create", [rita], async () => {
      fresh(rita);
      const claimed = accepted(await act(rita, "room.create", register, "found", { fields: { branch: "main", founderHandle: "@rita", recoveryKey: keyIdOfSecret(crypto.getRandomValues(new Uint8Array(32))) }, idempotencyKey: "claim" }));
      expect((await rita.ok("wait", { scope: register, entry: seqOf(claimed) }))["timedOut"]).toBe(false);
      room.know(rita.config.repository!.destination);
      const seat = accepted(await act(rita, "room.seat", "membership", "seat", { idempotencyKey: "seat" }));
      accepted(await act(rita, "room.first-key", "membership", "first-key", { fields: { member: seqOf(seat) }, idempotencyKey: "first-key" }));
      expect((await rita.ok("wait", { scope: "membership", entry: seqOf(seat) }))["timedOut"]).toBe(false);
    });

    // The rules, and an act by its kind: activation of the issue definition with its bytes.
    await recipe("Rules editor", [rita], async () => {
      fresh(rita);
      const rules = await rita.ok("inspect", { scope: "rules" });
      expect(rules["items"]).toBeDefined();
      accepted(await act(rita, "rules.publish", "rules", "publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" }));
    });
    await recipe("`dap act <kind>", [rita], async () => {
      fresh(rita);
      accepted(await act(rita, "rules.activate", "rules", "activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue" }));
    });
    fresh(rita);
    accepted(await act(rita, "rules.activate", "rules", "activate", { fields: { digest: DEMO_DIGESTS.change, name: "change" }, values: [canonicalize(changeDemo)], idempotencyKey: "activate-change" }));

    // invite, join from an empty configuration, and the page's join (another member, the same calls).
    const linkFor = (handle: string, invitation: number, secret: string) => `${INVITATION_LINK}${b64url(utf8(JSON.stringify({ v: 1, service: rita.config.service, repository: (({ inbox: _inbox, ...shared }) => shared)(rita.config.repository!), invitation, secret, handle, definition: "platform:membership@2" })))}`;
    const invite = async (handle: string, key: string) => {
      const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const invited = accepted(await act(rita, "member.invite", "membership", "invite-member", { fields: { handle, role: "member", inviteHash: textDigest(secret), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: key }));
      return linkFor(handle, seqOf(invited), secret);
    };
    let paulLink = "";
    await recipe("`dap invite", [rita], async () => { fresh(rita); paulLink = await invite("@paul", "invite-paul"); });
    const paul = room.agent("paul", { mode, config: { service: "" } });
    const joins = async (agent: Agent, link: string) => {
      const joined = accepted(await agent.ok("join", { link, idempotencyKey: "join" }));
      expect(joined["handle"]).toBeDefined();
      expect((await agent.ok("wait", { scope: "inbox", seq: 0 }))["timedOut"]).toBe(false);
    };
    await recipe("`dap join", [paul], () => joins(paul, paulLink));
    fresh(rita);
    const quinnLink = await invite("@quinn", "invite-quinn");
    const quinn = room.agent("quinn", { mode, config: { service: "" } });
    await recipe("Join with an invitation link", [quinn], () => joins(quinn, quinnLink));

    // Issues: open (CLI and page), comment, assign, the list of acts, the history reads, the room's remote, the issue list.
    const openIssue = async (title: string, key: string) => {
      fresh(paul);
      const opened = accepted(await act(paul, "issue.create", "directory", "open-issue", { fields: { definition: DEMO_DIGESTS.issue, title, body: `About: ${title}`, conditions: [title] }, idempotencyKey: key }));
      expect((await paul.ok("wait", { scope: "directory", entry: seqOf(opened) }))["timedOut"]).toBe(false);
      return opened;
    };
    const issueOpened = { r: {} as Record<string, unknown> };
    await recipe("`dap issue open", [paul], async () => { issueOpened.r = await openIssue("The handbook is empty", "issue-1"); });
    await recipe("Create issue", [paul], async () => { await openIssue("A typo on the front page", "issue-2"); });
    await recipe("`dap issue comment", [paul], async () => { fresh(paul); accepted(await act(paul, "issue.comment", 1, "comment", { fields: { body: "I will write it." }, idempotencyKey: "comment-1" })); });
    await recipe("`dap issue assign", [rita], async () => { fresh(rita); accepted(await act(rita, "issue.assign", 1, "assign", { on: 0, fields: { assignees: ["@paul"] }, idempotencyKey: "assign-1" })); });
    await recipe("`dap acts", [paul], async () => {
      if (mode === "default") expect((await paul.ok("room", {}))["notHeld"]).toBeDefined();
      else expect((await paul.ok("actions", { scope: 1 }))["acts"]).toBeDefined();
    });
    await recipe("`dap log", [paul], async () => { expect(((await paul.ok("steps", { scope: 1 }))["steps"] as unknown[]).length).toBeGreaterThan(1); });
    await recipe("`dap show", [paul], async () => { expect((await paul.ok("step", { scope: 1, seq: 0 }))["entry"]).toBeDefined(); });
    await recipe("`dap verify <scope>", [paul], async () => { expect(((await paul.ok("record", { scope: 1 }))["entries"] as unknown[]).length).toBeGreaterThan(1); });
    await recipe("`dap remote", [paul], async () => {
      const destination = await paul.ok("inspect", { scope: "destination" });
      expect((destination["items"] as { type: string; values: Record<string, unknown> }[]).find((i) => i.type === "branch")!.values["repository"]).toMatchObject({ namespace: "artroom-demo" });
    });
    await recipe("`dap issues", [paul], async () => {
      const lanes = (await paul.ok("room", {}))["lanes"] as { number: number; kind: string }[];
      const issues = lanes.filter((l) => l.kind === "issue");
      for (const l of issues) expect((await paul.ok("inspect", { scope: l.number }))["items"]).toBeDefined();
      return { n: issues.length };
    });

    // A capability step and its act, under one key: the step is refused by the lane that holds the hold (see the room story).
    fresh(rita); fresh(paul);
    const offer = accepted(await act(rita, "issue.offer", 1, "offer", { fields: { offeree: "@paul" }, idempotencyKey: "offer-1" }));
    const terms: FactRef = { at: (offer["fact"] as FactRef).at, seq: 0, hash: (await paul.ok("step", { scope: 1, seq: 0 }))["hash"] as FactRef["hash"] };
    accepted(await act(paul, "issue.take", 1, "accept", { on: seqOf(offer), fields: { terms }, idempotencyKey: "take-1" }));
    accepted(await act(paul, "issue.work", 1, "take-hold", { fields: { commitment: seqOf(offer) }, idempotencyKey: "work-1" }));
    await recipe("A capability step", [paul], async () => {
      fresh(paul);
      const fields = { commitment: seqOf(offer), terms, commit: "c".repeat(40), tree: "d".repeat(40) };
      const staged = await paul.ok("prepare", { target: 1, kind: "report", fields, idempotencyKey: "hand-in-1", resource: 1, capability: "hold@1", step: "stage" });
      const handIn = await act(paul, "issue.hand-in", 1, "report", { fields, idempotencyKey: "hand-in-1" });
      return { answers: [`stage ${JSON.stringify((staged["step"] as { answer: unknown }).answer)}`, `${String(handIn["answer"])} ${String(handIn["reason"] ?? "")} ${String(handIn["name"] ?? "")}`] };
    });
    // clone: a read token, its outcome, its credential, once; Git uses it outside the server.
    await recipe("`dap clone", [paul], async () => {
      fresh(paul);
      const token = accepted(await act(paul, "repository.read-token", "destination", "read-token", { on: 0, fields: { hours: 1 }, idempotencyKey: "token-1" }));
      expect((await paul.ok("wait", { scope: "destination", seq: seqOf(token) + 1 }))["timedOut"]).toBe(false);
      expect(await paul.ok("credential", { entry: seqOf(token) })).toMatchObject({ credential: expect.any(String), remote: expect.stringMatching(/^https:/) });
    });

    // A change from the page: opened with the definition's bytes read from the rules scope, its rules asked, one file proposed.
    const proposeEdit = async (agent: Agent, path: string, content: string, key: string) => {
      fresh(agent);
      const pr = accepted(await act(agent, "change.create", "directory", "open-pr", { fields: { definition: DEMO_DIGESTS.change, title: `Edit ${path}`, draft: false }, idempotencyKey: `${key}-open` }));
      const created = await agent.ok("wait", { scope: "directory", entry: seqOf(pr) });
      const lane = (created["created"] as { scope: string }[])[0]!.scope;
      accepted(await act(agent, "change.ask-rules", lane, "ask-rules", { on: 0, idempotencyKey: `${key}-ask` }));
      expect((await agent.ok("wait", { scope: lane, type: "rules" }))["timedOut"]).toBe(false);
      const head = ((await agent.ok("inspect", { scope: "destination" }))["items"] as { type: string; values: { head?: string } }[]).find((i) => i.type === "branch")!.values.head!;
      const version = accepted(await act(agent, "change.propose-file", lane, "propose-file", { fields: { base: head, path, digest: digestBytes(utf8(content)), size: utf8(content).length, content }, idempotencyKey: `${key}-file` }));
      return { lane, manifest: seqOf(version), head };
    };
    const merge = async (agent: Agent, lane: string, key: string, before?: () => Promise<void>, reset = true) => {
      if (reset) fresh(agent);
      const versions = ((await agent.ok("inspect", { scope: lane }))["items"] as { id: number; type: string; state: string }[]).filter((i) => i.type === "manifest" && i.state === "current");
      if (before) await before();
      const merged = accepted(await act(agent, "change.merge", lane, "merge", { fields: { manifest: versions[0]!.id, reports: [] }, idempotencyKey: key }));
      const published = await agent.ok("wait", { scope: lane, item: seqOf(merged), type: "merge", states: ["published", "refused", "aborted"] });
      expect((published["item"] as { state: string }).state).toBe("published");
    };
    let paulChange!: { lane: string; manifest: number };
    await recipe("Propose an edit", [paul], async () => { paulChange = await proposeEdit(paul, "README.md", "# The handbook\n", "edit-page"); });
    await recipe("Review", [rita], async () => {
      fresh(rita);
      const lane = await rita.ok("inspect", { scope: paulChange.lane });
      const version = (lane["items"] as { id: number; type: string; state: string }[]).find((i) => i.type === "manifest" && i.state === "current")!;
      accepted(await act(rita, "change.review", paulChange.lane, "review-verdict", { fields: { manifest: version.id, verdict: "approve" }, idempotencyKey: "review-1" }));
    });
    await recipe("Comment", [rita], async () => { fresh(rita); accepted(await act(rita, "change.comment", paulChange.lane, "comment", { fields: { body: "Looks right." }, idempotencyKey: "change-comment-1" })); });
    await recipe("Merge", [rita], () => merge(rita, paulChange.lane, "merge-page"));

    // edit: the whole of dap edit, with --closes on the first issue; then dap merge on another member's change.
    const issueRef = (await rita.ok("inspect", { scope: 1 }))["ref"] as ScopeRef;
    await recipe("`dap edit", [rita], async () => {
      const edited = await proposeEdit(rita, "guide/start.md", "Start here.\n", "edit-cli");
      await merge(rita, edited.lane, "merge-edit", async () => { accepted(await act(rita, "change.link-own", edited.lane, "link-own", { fields: { issue: issueRef, how: "keyword" }, idempotencyKey: "link-edit" })); }, false);
    });
    const second = await proposeEdit(paul, "NOTES.md", "Notes.\n", "edit-paul-2");
    await recipe("`dap merge", [rita], () => merge(rita, second.lane, "merge-cli"));

    // propose: the files, one propose-file each, then the version that names them. The demo change definition's propose-manifest
    // is the hold workflow's (a held hold, or a foreign hold with its pin): the lane refuses this version, by that guard's name.
    // Not a W1 row: the same steps under the demo change, whose propose-manifest is the hold workflow's and which holds one version
    // only. Its version is refused, by name.
    await (async () => {
      fresh(paul);
      const pr = accepted(await act(paul, "change.create", "directory", "open-pr", { fields: { definition: DEMO_DIGESTS.change, title: "Two files", draft: false }, idempotencyKey: "propose-open" }));
      const lane = ((await paul.ok("wait", { scope: "directory", entry: seqOf(pr) }))["created"] as { scope: string }[])[0]!.scope;
      accepted(await act(paul, "change.ask-rules", lane, "ask-rules", { on: 0, idempotencyKey: "propose-ask" }));
      await paul.ok("wait", { scope: lane, type: "rules" });
      const head = ((await paul.ok("inspect", { scope: "destination" }))["items"] as { type: string; values: { head?: string } }[]).find((i) => i.type === "branch")!.values.head!;
      // The demo change holds one version (its propose-file is refused a second time as one-version): one path here.
      const files = [["a.md", "A.\n"]] as const;
      let previous = 0;
      for (const [path, content] of files) previous = seqOf(accepted(await act(paul, "change.propose-file", lane, "propose-file", { fields: { base: head, path, digest: digestBytes(utf8(content)), size: utf8(content).length, content }, idempotencyKey: `propose-${path}` })));
      const version = await act(paul, "change.propose-version", lane, "propose-manifest", { fields: { previous, instance: "i-1", selected: [], decisions: [], base: head, integration: head, tree: "d".repeat(40), complete: true }, idempotencyKey: "propose-version" });
      expect([version["answer"], version["reason"], version["name"]], JSON.stringify(version)).toEqual(["refused", "guard-failed", "source-shape"]);
      demoRefusal = `${String(version["answer"])} ${String(version["reason"])} ${String(version["name"])}`;
    })();

    await recipe("`dap issue close", [paul], async () => { fresh(paul); accepted(await act(paul, "issue.close-own", 2, "close-own", { on: 0, fields: { reason: "completed" }, idempotencyKey: "close-2" })); });
    await recipe("Check status", [paul], async () => { expect((await paul.ok("settle", { target: 1, idempotencyKey: "comment-1" }))["answer"]).toBe("accepted"); });
    await recipe("Record inspection", [paul], async () => {
      expect(((await paul.ok("room", {}))["standing"] as { role: string }[])[0]!.role).toBe("member");
      expect((await paul.ok("record", { scope: "membership" }))["entries"]).toBeDefined();
    });

    await recipe("A send's outcome", [paul], async () => {
      const duty = (issueOpened.r["duties"] as string[])[0]!;
      expect(((await paul.ok("sends", { scope: "directory" }))["sends"] as unknown[]).length).toBeGreaterThan(0);
      expect((await paul.ok("wait", { scope: "directory", duty }))["timedOut"]).toBe(false);
    });
    await recipe("`dap verify --all", [paul], async () => {
      const view = await paul.ok("room", {});
      const scopes = [...Object.values(view["scopes"] as Record<string, { scope: string }>).map((s) => s.scope), ...(view["lanes"] as { scope: string }[]).map((l) => l.scope)];
      for (const scope of scopes) expect((await paul.ok("record", { scope }))["entries"]).toBeDefined();
      return { n: scopes.length };
    });
    // propose, in full, in a room of its own whose change definition is the manifest-list one (change-demo3) under its version 3
    // destination: the files' sources, the version that names them, accepted, then merged and published by the room.
    const proposeRoom = mcpRoom();
    try {
      const una = proposeRoom.agent("una", { mode });
      await founded(proposeRoom, una, mode);
      fresh(una);
      accepted(await act(una, "rules.publish", "rules", "publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" }));
      fresh(una);
      accepted(await act(una, "rules.activate", "rules", "activate", { fields: { digest: definitionDigest(changeDemo3), name: "change" }, values: [canonicalize(changeDemo3)], idempotencyKey: "activate-change3" }));
      await recipe("`dap propose", [una], async () => {
        fresh(una);
        const pr = accepted(await act(una, "change.create", "directory", "open-pr", { fields: { definition: definitionDigest(changeDemo3), title: "Two files", draft: false }, idempotencyKey: "propose-open" }));
        const lane = ((await una.ok("wait", { scope: "directory", entry: seqOf(pr) }))["created"] as { scope: string }[])[0]!.scope;
        accepted(await act(una, "change.ask-rules", lane, "ask-rules", { on: 0, idempotencyKey: "propose-ask" }));
        expect((await una.ok("wait", { scope: lane, type: "rules" }))["timedOut"]).toBe(false);
        const head = ((await una.ok("inspect", { scope: "destination" }))["items"] as { type: string; values: { head?: string } }[]).find((i) => i.type === "branch")!.values.head!;
        const files = [["guide/one.md", "# One\n"], ["guide/two.md", "# Two\n"]] as const;
        const sources: { path: string; entry: FactRef; digest: string }[] = [];
        for (const [path, content] of files) {
          const made = accepted(await act(una, "change.propose-file", lane, "propose-file", { fields: { base: head, path, digest: digestBytes(utf8(content)), size: utf8(content).length, content }, idempotencyKey: `propose-${path}` }));
          sources.push({ path, entry: made["fact"] as FactRef, digest: digestBytes(utf8(content)) });
        }
        const version = accepted(await act(una, "change.propose-version", lane, "propose-manifest", { fields: { base: head, files: sources }, idempotencyKey: "propose-version" }));
        const merged = accepted(await act(una, "change.merge", lane, "merge", { fields: { manifest: seqOf(version), reports: [] }, idempotencyKey: "propose-merge" }));
        const published = await una.ok("wait", { scope: lane, item: seqOf(merged), type: "merge", states: ["published", "refused", "aborted"] });
        expect((published["item"] as { state: string }).state, JSON.stringify(published)).toBe("published");
        return { n: files.length, answers: [`version accepted at entry ${seqOf(version)}; merge published`] };
      });
    } finally { proposeRoom.done(); }
    ran.set("demo propose refusal", { calls: [], n: 0, answers: [demoRefusal] });
    return ran;
  } finally { room.done(); }
}

/** Compare what ran with docs/mcp.md's W1 inventory, row by row. */
function compare(mode: Mode, ran: Map<string, Ran>): string[] {
  const rows = inventoryRows();
  const lines: string[] = [];
  const differ: string[] = [];
  for (const [label, r] of ran) {
    if (label === "demo propose refusal") { expect(r.answers).toEqual(["refused guard-failed source-shape"]); lines.push(`${mode}, the demo change's version: ${r.answers[0]}`); continue; }
    const row = rows.find((x) => x.activity.includes(label));
    if (!row) { differ.push(`no W1 row for ${label}`); continue; }
    const expected = recipeOf(row.cells[mode]);
    if (canonicalize(collapse(r.calls)) !== canonicalize(expected.tools)) differ.push(`${label}: ran ${collapse(r.calls).join(", ")}; the row names ${expected.tools.join(", ")}`);
    if (r.calls.length !== expected.count.k + (expected.count.n ? r.n : 0)) differ.push(`${label}: ${r.calls.length} calls (${r.calls.join(", ")}), n = ${r.n}; the row counts ${expected.count.k}${expected.count.n ? " + n" : ""}`);
    lines.push(`${mode}, ${label.replace(/`/g, "")}: ${r.calls.length} calls${expected.count.n ? ` (n = ${r.n})` : ""}${r.answers.length > 0 ? `; ${r.answers.join("; ")}` : ""}`);
  }
  expect(differ, `${mode}: the recipes as run and docs/mcp.md's W1 inventory`).toEqual([]);
  // Every row of the table is executed, or names the row whose calls it shares.
  for (const row of rows) expect([...ran.keys()].filter((l) => l !== "demo propose refusal").some((l) => row.activity.includes(l)) || /the same calls as/.test(row.cells.default), `${row.activity} is executed`).toBe(true);
  return lines;
}

// Invariant: every W1 recipe of docs/mcp.md runs through the server with complete arguments, in the default mode, calling exactly
// the tools its row names, in order, as many times as its row counts.
test("W1 recipes, executed: the default mode", async ({ annotate }) => {
  for (const line of compare("default", await recipes("default"))) await annotate(line);
}, 900_000);

// Invariant: the same recipes in --generic mode, by actions and act alone.
test("W1 recipes, executed: --generic mode", async ({ annotate }) => {
  for (const line of compare("generic", await recipes("generic"))) await annotate(line);
}, 900_000);
