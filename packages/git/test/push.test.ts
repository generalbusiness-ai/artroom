import { execFileSync } from "node:child_process";
import { afterAll, expect, test } from "vitest";
import { Gateway, Git, attemptOutcome, classifySend, readAnswer, type Forwarding, type PushAnswer, type SendEvidence } from "../src/index.ts";
import { Bridge, Host, MemoryRecords } from "./support/host.ts";
import { bare, blob, cleanup, commit, git, program, scratch, tree } from "./support/repo.ts";
import { SENDS } from "./support/sends.ts";

let bridge: Bridge | null = null;
afterAll(async () => {
  await bridge?.close();
  cleanup();
});

const REF = "refs/heads/main";
const [BASE, COMMIT] = ["b".repeat(40), "c".repeat(40)];

// Section 6.6, step 4, and section 5.7, as one table of a pure function. The lines are Git's own `push --porcelain` output, as recorded for the earlier classifier.
test("a send is not sent, refused or unknown by the gateway's record and Git's report of that ref; an attempt is confirmed only by a read after its own report, and a lost reply stays unknown whatever the read shows", () => {
  const line = (flag: string, summary: string, ref = REF) => `To host\n${flag}\t${COMMIT}:${ref}\t${summary}\nDone\n`;
  const ran = (code: number, stdout: string, stderr = "", refusals: readonly string[] = []) => readAnswer({ code, stdout, stderr, timedOut: false }, REF, refusals);
  const none: Forwarding = { state: "closed", forwarded: 0 };
  const one: Forwarding = { state: "closed", forwarded: 1 };
  const open: Forwarding = { state: "forwarding", forwarded: 1 };
  const refusedBefore: PushAnswer = { ran: false, refusal: "parent-mismatch", exit: null, timedOut: false, reported: null, others: false, code: null };
  const lost = ran(1, "Done\n", "error: RPC failed; HTTP 502 curl 22 The requested URL returned error: 502\nsend-pack: unexpected disconnect while reading sideband packet\nfatal: the remote end hung up unexpectedly\n");
  const hostCode = "remote: host_object_too_large\nfatal: the remote end hung up unexpectedly\n";

  const table: [string, PushAnswer, Forwarding | null, SendEvidence][] = [
    // Not sent: the grant is closed and its record shows that nothing was forwarded.
    ["a check refused before the push ran", refusedBefore, none, { class: "not-sent", why: "parent-mismatch" }],
    ["Git's own check of the expected old value", ran(1, line("!", "[rejected] (stale info)")), none, { class: "not-sent", why: "stale" }],
    ["the remote already holds the value", ran(0, line("=", "[up to date]")), none, { class: "not-sent", why: "up-to-date" }],
    ["Git could not reach the remote", ran(128, "", "fatal: unable to access 'https://host/': Could not resolve host\n"), none, { class: "not-sent", why: "not-forwarded" }],
    ["Git's words say that nothing was sent, and the record shows a forward", ran(128, "", "fatal: unable to access 'https://host/': Could not resolve host\n"), one, { class: "unknown", reported: null }],
    ["the record shows no forward, and Git reports the ref updated", ran(0, line(" ", "b..c")), none, { class: "unknown", reported: null }],
    // Refused: one forward, the answer whole, and the remote's rejection of that ref.
    ["the remote rejects that ref", ran(1, line("!", "[remote rejected] (failed to update ref)")), one, { class: "refused", why: "rejected" }],
    ["the remote rejects that ref, and the grant is not closed", ran(1, line("!", "[remote rejected] (failed to update ref)")), open, { class: "unknown", reported: null }],
    ["the host's code before any ref update, when the caller lists it", ran(128, "", hostCode, ["host_object_too_large"]), one, { class: "refused", why: "host_object_too_large" }],
    ["the same code, when no list names it", ran(128, "", hostCode), one, { class: "unknown", reported: null }],
    // Unknown: anything else.
    ["Git reports the ref updated", ran(0, line(" ", "b..c")), one, { class: "unknown", reported: "updated" }],
    ["Git reports a forced update, apart", ran(0, line("+", "b...c (forced update)")), one, { class: "unknown", reported: "forced" }],
    ["the reply is lost", lost, one, { class: "unknown", reported: null }],
    ["the remote failed to report", ran(1, line("!", "[remote failure] (remote failed to report status)")), one, { class: "unknown", reported: null }],
    ["the deadline passed", readAnswer({ code: -1, stdout: "", stderr: "", timedOut: true }, REF), one, { class: "unknown", reported: null }],
    ["a status line for another ref", ran(0, line(" ", "b..c", "refs/heads/other")), one, { class: "unknown", reported: null }],
    ["there is no record of the grant", ran(1, line("!", "[remote rejected] (failed to update ref)")), null, { class: "unknown", reported: null }],
  ];
  expect(table.map(([name, answer, grant]) => [name, classifySend(answer, grant)])).toEqual(table.map(([name, , , want]) => [name, want]));

  const update = { ref: REF, new: COMMIT };
  const reported: SendEvidence = { class: "unknown", reported: "updated" };
  const outcomes: [string, SendEvidence, string | null | undefined, string, string][] = [
    ["not sent", { class: "not-sent", why: "stale" }, COMMIT, "refused", "own-answer"],
    ["refused by the host", { class: "refused", why: "rejected" }, BASE, "refused", "own-answer"],
    ["reported as applied, and the read shows the commit", reported, COMMIT, "confirmed", "read"],
    ["reported as applied, and the read shows the base", reported, BASE, "unknown", "none"],
    ["reported as applied, and the read failed", reported, undefined, "unknown", "none"],
    ["the reply was lost, and the read shows the commit", { class: "unknown", reported: null }, COMMIT, "unknown", "none"],
    ["the reply was lost, and the read shows the base", { class: "unknown", reported: null }, BASE, "unknown", "none"],
  ];
  expect(outcomes.map(([name, send, value]) => { const o = attemptOutcome(update, send, value === undefined ? null : { ref: REF, value }); return [name, o.result, o.evidence.basis]; }))
    .toEqual(outcomes.map(([name, , , result, basis]) => [name, result, basis]));
  // A read of another ref confirms nothing.
  expect(attemptOutcome(update, reported, { ref: "refs/heads/other", value: COMMIT }).result).toBe("unknown");
});

// The plan's T9. A real local repository behind `git http-backend`, a labelled stand-in for a host, and the package's real gateway
// in front of it. It shows Git's own compare-and-set. It is not a host: assumptions H1 and H2 at a chosen host are the host session's.
test("every send is one compare-and-set, checked before it is sent and sent once: the table of sends on a real repository, a lost reply that causes no second push, and a commit that is not the reviewed one", async () => {
  const TOKEN = "tok_plaintext_3f9a1c";
  const remote = bare();
  const host = new Host(remote, TOKEN);
  const records = new MemoryRecords();
  const logged: string[] = [];
  const gateway = new Gateway({ records, upstream: host.upstream, credential: (t) => ["authorization", `Bearer ${t}`], transport: "local", log: (e) => logged.push(JSON.stringify(e)) });
  bridge = await Bridge.open(() => gateway);
  const url = bridge.url("repo.git");
  const seen = { argv: [] as string[], env: [] as string[] };
  const ops = new Git(program(seen), { workdir: scratch() });

  // The canonical repository: a base, the reviewed commit above it under a staged ref, and another writer's commit.
  const file = blob(remote, "base\n");
  const base = commit(remote, tree(remote, [`100644 blob ${file}\tfile`]), [], "base");
  const reviewedTree = tree(remote, [`100644 blob ${blob(remote, "reviewed\n")}\tfile`]);
  const reviewed = commit(remote, reviewedTree, [base], "reviewed");
  const other = commit(remote, tree(remote, [`100644 blob ${blob(remote, "other\n")}\tfile`]), [base], "another writer");
  const staged = `refs/artroom/staged/s/1/${reviewed}/1`;
  git(remote, ["update-ref", staged, reviewed]);
  const shows = (value: string | null) => (value === reviewed ? "commit" : value === base ? "base" : value === other ? "other" : value);
  const at = (ref: string): string | null => { try { return git(remote, ["rev-parse", "--verify", "-q", ref]); } catch { return null; } };

  let n = 0;
  /** One attempt, as its driver runs it: open the grant, send once, close the grant, read its record, and judge. */
  const attempt = async (update: { ref: string; old: string | null; new: string | null }, send: () => Promise<PushAnswer>) => {
    const name = `d:7:${++n}#1`;
    await gateway.open({ attempt: name, repository: url, update, token: { id: `token-${n}`, state: "live", plaintext: TOKEN } });
    const [before, pushes] = [host.updates, seen.argv.filter((a) => a.includes(" push ")).length];
    const answer = await send();
    const record = await gateway.close(name);
    const evidence = classifySend(answer, record);
    const outcome = attemptOutcome(update, evidence, { ref: update.ref, value: at(update.ref) });
    return { name, answer, record, evidence, outcome, reached: host.updates - before, pushes: seen.argv.filter((a) => a.includes(" push ")).length - pushes };
  };

  // The table. Each row has a branch of its own at the base.
  const got: unknown[] = [];
  for (const [i, row] of SENDS.entries()) {
    const branch = `refs/heads/row-${i}`;
    git(remote, ["update-ref", branch, row.fault === "stale" ? other : base]);
    host.fault = row.fault === "moved" ? { kind: "moved", ref: branch, to: other } : row.fault === "lost-after" || row.fault === "lost-before" ? { kind: row.fault } : null;
    const publish = () => ops.publish({ remote: url, branch, base, commit: reviewed, tree: reviewedTree, from: staged });
    const r = await attempt({ ref: branch, old: base, new: reviewed }, publish);
    got.push({ name: row.name, fault: row.fault, send: r.evidence.class, result: r.outcome.result, basis: r.outcome.evidence.basis, shows: shows(at(branch)), reached: r.reached });

    // A send runs the push command once, whatever it answers: a lost reply is never sent again by the sender.
    expect([row.name, r.pushes]).toEqual([row.name, 1]);
    if (row.fault === "lost-before") {
      // The reply is lost and the ref still holds the base. Whatever asks again under that attempt, nothing more is forwarded:
      // the grant is closed. A further try is another attempt, which an entry opens (section 6.6; scope contract, section 4.3, item 2).
      const reached = host.updates;
      const again = await publish();
      expect([again.ran, again.reported, host.updates - reached, at(branch)]).toEqual([true, null, 0, base]);
      expect(await gateway.close(r.name)).toEqual(r.record);
    }
  }
  expect(got).toEqual(SENDS);

  // The read that decides goes through a grant that only reads, and a push under it is refused by the gateway.
  await gateway.open({ attempt: "d:7:read#1", repository: url, update: null, token: { id: "token-read", state: "live", plaintext: TOKEN } });
  expect(await ops.readRef(url, "refs/heads/row-0")).toEqual({ ref: "refs/heads/row-0", value: reviewed });
  expect(await ops.readRef(url, "refs/heads/absent")).toEqual({ ref: "refs/heads/absent", value: null });
  const reads = host.updates;
  expect(classifySend(await ops.send({ remote: url, ref: "refs/heads/row-2", old: base, new: reviewed }), await gateway.close("d:7:read#1"))).toMatchObject({ class: "not-sent" });
  expect(host.updates).toBe(reads);

  // What a publication refuses before anything is sent: the commit is not the reviewed one, or the ref is not the branch.
  const dir = await ops.repository(url);
  git(remote, ["update-ref", "refs/heads/checks", base]);
  const tag = execFileSync("git", ["-C", dir, "mktag"], { input: `object ${reviewed}\ntype commit\ntag v1\ntagger T <t@artroom.invalid> 1700000000 +0000\n\nv1\n`, encoding: "utf8" }).trim();
  const cut = commit(dir, tree(dir, [`100644 blob ${"9".repeat(40)}\tabsent`]), [base], "an object is absent");
  const linked = commit(dir, tree(dir, [`160000 commit ${"9".repeat(40)}\tmodule`]), [base], "a gitlink");
  const good = { remote: url, branch: "refs/heads/checks", base, commit: reviewed, tree: reviewedTree, from: staged };
  const sent = host.updates;
  const checks: [string, Parameters<Git["publish"]>[0], string][] = [
    ["its first parent is not the reserved base", { ...good, base: other }, "parent-mismatch"],
    ["its tree is not the tree that the destination's row states", { ...good, tree: git(remote, ["rev-parse", `${base}^{tree}`]) }, "tree-mismatch"],
    ["a tag of the reviewed commit is not the commit", { ...good, commit: tag }, "wrong-type"],
    ["an object under it is absent", { ...good, commit: cut, tree: git(dir, ["rev-parse", `${cut}^{tree}`]) }, "incomplete"],
    ["its tree holds a gitlink", { ...good, commit: linked, tree: git(dir, ["rev-parse", `${linked}^{tree}`]) }, "gitlink"],
    ["the commit is the base", { ...good, commit: base }, "same-commit"],
    ["the commit is no object ID", { ...good, commit: "--force" }, "bad-object-id"],
    ["the ref is an option", { ...good, branch: "--mirror" }, "bad-ref-name"],
    ["the ref holds `..`", { ...good, branch: "refs/heads/a..b" }, "bad-ref-name"],
    ["the ref is not a branch", { ...good, branch: staged }, "not-a-branch"],
    ["the remote carries a credential", { ...good, remote: url.replace("http://", `http://user:${TOKEN}@`) }, "credential-in-url"],
  ];
  await gateway.open({ attempt: "d:7:checks#1", repository: url, update: { ref: "refs/heads/checks", old: base, new: reviewed }, token: { id: "token-checks", state: "live", plaintext: TOKEN } });
  const refusals: [string, boolean, string | null][] = [];
  for (const [name, p] of checks) { const a = await ops.publish(p); refusals.push([name, a.ran, a.refusal]); }
  expect(refusals).toEqual(checks.map(([name, , reason]) => [name, false, reason]));
  // Nothing of those reached the host, and the grant's record says so: each is "not sent". The control: the same publication, unchanged, is sent.
  expect(host.updates).toBe(sent);
  expect((await ops.publish(good)).reported).toBe("updated");
  expect([host.updates - sent, at("refs/heads/checks"), git(remote, ["rev-list", "--count", `${base}..refs/heads/checks`])]).toEqual([1, reviewed, "1"]);
  expect(await gateway.close("d:7:checks#1")).toMatchObject({ state: "closed", forwarded: 1 });

  // Ancestry in the fetched repository, by Git's two exit codes; an object that is not here is a failure, and never "no".
  expect([await ops.isAncestor(url, base, reviewed), await ops.isAncestor(url, reviewed, base), await ops.isAncestor(url, base, "9".repeat(40)).catch((e: unknown) => (e as Error).message)])
    .toEqual([true, false, "git merge-base failed (exit 128)"]);

  // A ref that is created only if absent, and a delete on the expected old value (sections 6.2 and 6.10): the same compare-and-set.
  const receipt = "refs/artroom/receipts/r1";
  const created = await attempt({ ref: receipt, old: null, new: reviewed }, () => ops.send({ remote: url, ref: receipt, old: null, new: reviewed, have: [base] }));
  const second = await attempt({ ref: receipt, old: null, new: other }, () => ops.send({ remote: url, ref: receipt, old: null, new: other, have: [base], from: "refs/heads/row-3" }));
  expect([created.evidence, created.outcome.result, second.evidence, second.outcome.result, at(receipt)])
    .toEqual([{ class: "unknown", reported: "created" }, "confirmed", { class: "not-sent", why: "stale" }, "refused", reviewed]);
  const deleted = await attempt({ ref: receipt, old: reviewed, new: null }, () => ops.send({ remote: url, ref: receipt, old: reviewed, new: null }));
  expect([deleted.evidence, deleted.outcome.result, at(receipt)]).toEqual([{ class: "unknown", reported: "deleted" }, "confirmed", null]);

  // Custody, on the real path (section 5.3): the token reached the host as the one header and nothing else held it.
  expect(new Set(host.credentials)).toEqual(new Set([`Bearer ${TOKEN}`]));
  expect([seen.argv, seen.env, records.written, logged].map((kept) => kept.join("\n").includes(TOKEN))).toEqual([false, false, false, false]);
  expect(seen.argv.filter((a) => a.includes(" push ")).every((a) => a.includes(" -- http://127.0.0.1:"))).toBe(true);
});
