import { expect, test } from "vitest";
import { timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { DEMO_DIGESTS } from "@generalbusiness/artroom-lanes";
import { act, actsOn, changeStates, joinRoom, listLanes, loadChange, loadIssue, loadRules, loadSite, openRoom, placeOf, siteAddress, Unreadable } from "../src/index.ts";
import { SERVICE, demo } from "./support/demo.ts";

// Invariant: the page's own data functions, over the deployed Worker's routes and a member's key, open a room with a read session
// from membership (or signed reads where membership gives none), and show what the room records: the issue it opened with a
// definition's bytes beside the act; a one-file change that `artroom edit` proposed, with its path, digest and size, merged and
// published, and the published file read back through the site route; a controlled-extent change that waits, with the
// destination's refusal by name and plan 016's state; an act refused by its guard's name with the head unmoved; the acts each
// member may sign now; and the rules. A key that is no member's reads nothing.
//
// The room is `support/demo.ts`: founded by the command line on real scopes, real read sessions under a TEST SECRET, the site
// route, and a STAND-IN Git host (`OwnGit`, under the production wiring of the hosting own Git service). The scheduler is a
// STAND-IN that the test drives (`pause`). No DOM.
test("the page's data functions against the Worker's routes as deployed: join with a link and a session from membership; signed reads where no session is given; open an issue with the definition's bytes; an edited README merged, published and read back from the site; AGENTS.md waiting for the controller, refused by name, then published; a refusal by guard name with nothing written; the acts by role; the rules (STAND-IN: the Git host and the scheduler)", async () => {
  const d = await demo();
  try {
    const [ritas, pauls] = [await d.secretOf(d.rita), await d.secretOf(d.paul)];
    const place = placeOf(JSON.stringify(d.config))!;
    expect(place).toEqual({ directory: d.D.name, membership: d.config.repository!.membership });
    expect(placeOf(d.link)).toEqual(place);
    expect(placeOf("not a room")).toBeNull();

    // A key that is no member's: membership refuses it a session, its signed read of the directory is refused, and nothing is read.
    const stranger = crypto.getRandomValues(new Uint8Array(32));
    await expect(openRoom(d.as(stranger), place)).rejects.toThrow(new Unreadable(`Cannot read ${d.D.name}: forbidden.`));

    // una signs in on the page: a new key, enrolled by membership's `join` with the invitation link; then a session from membership.
    const unas = crypto.getRandomValues(new Uint8Array(32));
    const joined = await joinRoom(d.as(unas), d.link);
    expect([joined.answer.answer, joined.place]).toEqual(["accepted", place]);
    const forUna = await openRoom(d.as(unas), place);
    expect([forUna.me?.handle, forUna.me?.role, forUna.reader !== null, forUna.rules, forUna.destination]).toEqual(["@una", "member", true, d.rules.name, d.G.name]);
    // A second join with the same link is refused by membership, by name, and writes nothing.
    const again = await joinRoom(d.as(crypto.getRandomValues(new Uint8Array(32))), d.link);
    expect(again.answer.answer).toBe("refused");

    // With no session secret, membership gives no session, and the page reads by signed reads: rita's key signed acts of the rules
    // scope and her claim caused the directory, within the window, so she reads; una's key signed none of the directory, so her read
    // of it is refused.
    const secret = platformNet.secret;
    platformNet.secret = null;
    try {
      const signed = await openRoom(d.as(ritas), place);
      expect([signed.reader, signed.unsessioned, signed.me?.handle]).toEqual([null, "sessions-unavailable", "@rita"]);
      // Limited signed reads do not authorize retained-item enumeration. The
      // page must show that refusal rather than a partial definition list.
      await expect(loadRules(signed)).rejects.toThrow(new Unreadable(`Cannot read definition items of ${d.rules.name}: forbidden.`));
      await expect(openRoom(d.as(unas), place)).rejects.toThrow(new Unreadable(`Cannot read ${d.D.name}: forbidden.`));
    } finally {
      platformNet.secret = secret;
    }

    const forRita = await openRoom(d.as(ritas), place);
    const forPaul = await openRoom(d.as(pauls), place);
    expect([forRita.me?.role, forPaul.me?.handle, forPaul.me?.role]).toEqual(["admin", "@paul", "maintainer"]);

    // una opens an issue through the page. The directory's `open-issue` takes the definition's bytes at a stated place: the page
    // offers the definitions the rules scope holds active, and sends the bytes it reads from the rules scope beside the act.
    const opening = (await actsOn(forUna, d.D.name)).acts.find((a) => a.kind === "open-issue")!;
    expect(opening.fields.find((f) => f.name === "definition")?.choices?.map((c) => c.value)).toEqual([DEMO_DIGESTS.change, DEMO_DIGESTS.issue]);
    const filed = await act(forUna, d.D.name, "open-issue", { fields: { definition: DEMO_DIGESTS.issue, title: "The handbook is empty", conditions: ["README.md says what the room is for"] } });
    expect(filed.answer.answer, JSON.stringify(filed.answer)).toBe("accepted");
    await d.pause([d.D.name]);
    const [issue] = (await listLanes(forUna)).issues;
    expect(issue).toMatchObject({ number: 1, kind: "issue", title: "The handbook is empty", state: "open" });

    // paul comments on it; the acts offered follow the role: paul may comment and may not assign; rita may assign.
    expect((await actsOn(forPaul, issue!.scope)).acts.map((a) => a.kind)).toContain("comment");
    expect((await actsOn(forUna, issue!.scope)).acts.map((a) => a.kind)).not.toContain("assign");
    expect((await actsOn(forRita, issue!.scope)).acts.map((a) => a.kind)).toContain("assign");
    expect((await act(forPaul, issue!.scope, "comment", { fields: { body: "I will write it with artroom edit." } })).answer.answer).toBe("accepted");
    expect(await loadIssue(forUna, issue!.scope)).toMatchObject({ number: 1, state: "open", requester: "@una", conditions: ["README.md says what the room is for"], comments: [{ author: "@paul", body: "I will write it with artroom edit." }] });

    // rita's `artroom edit README.md`: a source-only change, merged on her own act and published by the room.
    const edited = await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Write the handbook");
    expect(edited.code, edited.lines.join("\n")).toBe(0);
    const head1 = d.at.stand.refs.get("refs/heads/main")!;
    const readme = (await listLanes(forUna)).changes.find((row) => row.title === "Write the handbook")!;
    expect(readme).toMatchObject({ kind: "pr", state: "merged" });
    let change = await loadChange(forUna, readme.scope);
    expect(change.manifests.map((m) => m.file)).toEqual([{ path: "README.md", digest: expect.stringMatching(/^sha256:/), size: 37, page: `${SERVICE}/site/${d.D.name}/HEAD/README.md` }]);
    expect([change.merges.map((m) => [m.state, m.commit, m.publication?.state])]).toEqual([[["published", head1, "published"]]]);
    expect(changeStates(change).map((s) => s.state)).toEqual(["publication confirmed", ...change.merges[0]!.publication!.operations.map(() => "effect confirmed")]);
    // The published file, read back through the site route at the address the page links to.
    const shown = await loadSite(forUna, "README.md");
    expect([shown.address, shown.status, shown.text]).toEqual([siteAddress(forUna, "README.md"), 200, expect.stringContaining('<h1 id="the-handbook">The handbook</h1>\n<p>Written by the room.</p>')]);

    // paul's `artroom edit AGENTS.md`: the rules extent asks the controller's approval, so the destination refuses the merge by name
    // and nothing is pushed. The page shows the version's file, the refusal and the state "policy not met"; the site has no such page.
    const waiting = await d.run(d.paul, "edit", "AGENTS.md", "--file", "agents.md", "--title", "Rules for agents");
    expect(waiting.code, waiting.lines.join("\n")).toBe(1);
    const agents = (await listLanes(forPaul)).changes.find((row) => row.title === "Rules for agents")!;
    change = await loadChange(forPaul, agents.scope);
    const manifest = change.manifests[0]!.id;
    expect([change.state, change.manifests[0]!.file?.path, change.merges.map((m) => [m.state, m.reason, m.publication?.state])]).toEqual(["open", "AGENTS.md", [["refused", "rules-not-met:rules", "not-reserved"]]]);
    expect(changeStates(change)[0]).toEqual({ state: "policy not met", detail: expect.stringMatching(/^Merge \d+ was not reserved: the rules are not met for the extent rules\.$/) });
    expect([d.at.stand.refs.get("refs/heads/main"), (await loadSite(forPaul, "AGENTS.md")).status]).toEqual([head1, 404]);

    // A refusal by the guard's name: paul's role holds `change.review`, so the page offers him `review-verdict`; the lane refuses it,
    // because he is the version's author. The answer is the reason; the lane's head does not move.
    expect((await actsOn(forPaul, agents.scope)).acts.map((a) => a.kind)).toContain("review-verdict");
    const refused = await act(forPaul, agents.scope, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } });
    expect(refused.answer).toMatchObject({ answer: "refused", reason: "guard-failed", name: "author-cannot-review" });
    expect(refused.after).toEqual(refused.before);

    // rita, the rules scope's controller, approves it for the rules extent through the page; paul merges it through the page, and
    // the room publishes it. The site then serves AGENTS.md.
    expect((await act(forRita, agents.scope, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } })).answer.answer).toBe("accepted");
    expect((await act(forPaul, agents.scope, "merge", { fields: { manifest, reports: [] } })).answer.answer).toBe("accepted");
    await d.pause([agents.scope, d.G.name]);
    change = await loadChange(forPaul, agents.scope);
    const head2 = d.at.stand.refs.get("refs/heads/main")!;
    expect([change.state, change.merges.map((m) => [m.state, m.reason])]).toEqual(["merged", [["refused", "rules-not-met:rules"], ["published", null]]]);
    expect([change.merges[1]!.commit, head2 !== head1]).toEqual([head2, true]);
    expect(changeStates(change)[0]?.state).toBe("publication confirmed");
    expect((await loadSite(forPaul, "AGENTS.md")).text).toContain("Ask before you push.");

    // The rules of the room: rita is the one member whose role holds `rules.publish`; she is offered `publish`, paul is not.
    expect(forPaul.reader).not.toBeNull(); // The complete rules view below uses a real membership session.
    const rules = await loadRules(forPaul);
    expect(rules).toMatchObject({ approvals: 0, ownerMayReview: false, controllers: ["@rita"] });
    expect(rules.extents?.map((e) => [e.name, e.approvals, e.approver])).toEqual([["rules", 1, "rules.publish"], ["infrastructure", 0, "change.merge"], ["source", 0, "change.review"]]);
    expect(rules.definitions.map((x) => [x.name, x.digest, x.state])).toEqual([["issue", DEMO_DIGESTS.issue, "active"], ["change", DEMO_DIGESTS.change, "active"]]);
    expect((await actsOn(forRita, d.rules.name)).acts.map((a) => a.kind)).toContain("publish");
    expect((await actsOn(forPaul, d.rules.name)).acts.map((a) => a.kind)).not.toContain("publish");

    // A session ends 600 seconds after membership issued it; the page asks for a new one before its next read.
    const first = forUna.reader!;
    net.clock.now = timeOf(timeMs(net.clock.now)! + 601_000);
    await expect(loadIssue(forUna, issue!.scope)).resolves.toMatchObject({ state: "open" });
    expect([forUna.reader !== null, forUna.reader !== first]).toEqual([true, true]);
  } finally {
    d.done();
  }
}, 180_000);
