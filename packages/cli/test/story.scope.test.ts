import { describe, expect, test } from "vitest";
import type { Digest, Item, OperationId, Read } from "@generalbusiness/artroom-contract";
import { b64url, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { outsideOf, wired } from "../../scope/test/outside.ts";
import { command, memoryStore, type Context, type Outcome } from "../src/index.ts";

const SERVICE = "https://scopes.test";
const reader = "a test reader";

// Invariant: the command's functions, over the Worker's real HTTP routes and a key kept by the command, found a repository whole,
// invite and join a member, list and take one act, show a refusal with its reason and nothing written, and read and verify the
// histories they wrote.
//
// Every scope is a Durable Object of the namespace `PLATFORM`: the deployed class, the production authority and the platform
// package's own data and rules, as in `packages/scope/test/founding-real.test.ts`. Every request of the command goes through
// `route`, the Worker's HTTP routes, called in the test's isolate.
//
// | Part | Is |
// |---|---|
// | The commands, their keys and their intents | Real: `command` of `src/line.ts`, with a store in memory for each person, which stands for the config directory. |
// | The Git host | A STAND-IN: `OutsideDouble` of the scope package's `test/outside.ts`, wired as the register's outside port. It answers the one creation request with what the test writes. No repository is created. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the register's operations driver and the dispatchers of the scopes it waits on, as a deployment's alarms would. No test waits on the wall clock. |
// | The clock | The scripted clock of the namespaces. The command signs its intents by it. |
// | The readers | The test readers, a STAND-IN for read sessions that lets every reader read, except where a step says the readers are the real read sessions, under a TEST SECRET that the test generates. |
// | Who may install | Nothing checks it: that is the installation design's. |
describe("the artroom command on real scopes. The Git host and the scheduler are STAND-INs", () => {
  test("install, claim, invite and join over the Worker's routes; acts lists what the role holds; one act takes effect and one is refused by name with nothing written; log, show and verify read the histories back", async () => {
    net.hold = net.deaf = null;
    const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
    const now = () => timeMs(net.clock.now)!;
    let register: Platform | null = null;
    // STAND-IN for the scheduler. A creation request of the register gets the host's answer that the test writes: created, under
    // the name of the attempt.
    const pause = async (waiting: readonly string[]) => {
      if (register) {
        const claims = await (register.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "claim");
        for (const claim of (await register.summary()).value.items.filter((item) => item.type === "claim").concat(claims.ok ? claims.value : [])) {
          const name = repositoryName(claim.values["seed"] as Digest, 1);
          outsideOf(register.name).answer(`${claim.id}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name, id: `repo-${claim.id}` } } });
        }
        while ((await (register.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
      }
      await settle(...[...(register ? [register] : []), ...waiting.filter((scope) => scope !== register?.name).map((scope) => new Platform(scope as never))]);
    };
    const rita: Context = { store: memoryStore(), fetch, now, pause };
    const una: Context = { store: memoryStore(), fetch, now, pause };
    const run = async (who: Context, ...argv: string[]): Promise<Outcome> => command(who, argv);

    // install: the register, by an `install` intent of a new operator key, which is the one founder key.
    const installed = await run(rita, "install", SERVICE, "--host", "git.example", "--namespace", "artroom");
    expect(installed.code, installed.lines.join("\n")).toBe(0);
    const R = new Platform((await rita.store.config())!.register!.scope);
    expect(installed.lines).toEqual([`Installed: register ${R.name}.`, expect.stringMatching(/^The operator key key_\S+ is kept in the config directory, readable only by you\. It is the one founder key\.$/)]);
    expect((await R.summary()).value).toMatchObject({ status: "active", definition: "platform:register@1" });
    // STAND-IN: the Git host of this register, wired from the object's next start.
    wired.set(R.name, () => ({ outside: outsideOf(R.name) }));
    await R.restart();
    register = R;

    // claim: the register's `found`; the command waits until the four scopes are created and confirmed, then takes the seat.
    const claimed = await run(rita, "claim", "demo", "--handle", "@rita");
    expect(claimed.code, claimed.lines.join("\n")).toBe(0);
    const repository = (await rita.store.config())!.repository!;
    const D = new Platform(repository.directory.scope);
    const M = new Platform(repository.membership.scope);
    // What the command printed is what the directory records: its repository item names the three children it created.
    expect((await D.item(0)).refs).toMatchObject({ membership: repository.membership, rules: { scope: repository.rules }, destination: { scope: repository.destination } });
    for (const scope of [D, M, new Platform(repository.rules), new Platform(repository.destination), new Platform(repository.inbox!)]) expect((await scope.summary()).value.status).toBe("active");
    expect(claimed.lines).toEqual([
      `Claimed demo: directory ${D.name}, membership ${M.name}, rules ${repository.rules}, destination ${repository.destination}; each created and confirmed.`,
      expect.stringMatching(new RegExp(`^You are @rita, an admin, on key key_\\S+; your inbox is ${repository.inbox}\\.$`)),
    ]);
    expect(outsideOf(R.name).attempts).toEqual(["1:0#1"]);
    wired.delete(R.name);

    // invite and join: membership's `invite-member`, and `join` by a new key that una's command makes and keeps.
    expect(await run(rita, "invite", "@una", "--role", "member", "--acts", "issue.open")).toMatchObject({ code: 2, lines: [expect.stringMatching(/^--acts is not supported: membership's invite-member has the fields handle, role, inviteHash and inviteEnds/)] });
    const invited = await run(rita, "invite", "@una", "--role", "member");
    expect(invited.code, invited.lines.join("\n")).toBe(0);
    const link = invited.lines[1]!.split(": ")[1]!;
    const joined = await run(una, "join", link);
    expect(joined.code, joined.lines.join("\n")).toBe(0);
    const unasInbox = (await una.store.config())!.repository!.inbox!;
    expect(joined.lines).toEqual([expect.stringMatching(/^Joined as @una on key key_\S+\.$/), `Your inbox: ${unasInbox}.`]);
    const unasKey = joined.lines[0]!.split(" ")[5]!.replace(/\.$/, "");
    const members = (await M.summary()).value.items;
    expect([members.find((i) => i.type === "member" && i.values["handle"] === "@una")?.state, members.find((i) => i.type === "key" && i.values["id"] === unasKey)?.state, (await new Platform(unasInbox).summary()).value.status]).toEqual(["active", "active", "active"]);
    // No line of either person's command holds a secret: not a signing key, and not una's invitation secret after the link.
    const secrets = await Promise.all([rita.store.secret("operator"), rita.store.secret("recovery"), una.store.secret("device")]);
    for (const line of [...installed.lines, ...claimed.lines, ...joined.lines]) for (const secret of secrets) expect(line).not.toContain(b64url(secret!));

    // acts: what una's role holds on the directory, read from the definition and from her standing in membership.
    const unasActs = await run(una, "acts", "directory");
    expect(unasActs).toEqual({ code: 0, lines: [
      `Acts on ${D.name} (platform:directory@1) for @una (member):`,
      "  open-issue: opens a lane; needs issue.open. Fields: definition:digest title:text body?:text conditions:list.",
      "  open-pr: opens a lane; needs change.open. Fields: definition:digest title:text body?:text draft:bool.",
      "  open-task: opens a task; needs task.control. Fields: worker:member controller:member lane:scope.",
      "Not shown: 1 that need an action your role does not hold.",
    ] });

    // act, taking effect: rita, an admin, adds a checker member.
    const added = await run(rita, "act", "add-member", "--on", "membership", "--set", "handle=@check", "--set", "kind=checker");
    expect(added.code, added.lines.join("\n")).toBe(0);
    // The entry is the one the command named, and it holds what was asked. Adding a member also creates its inbox, whose answer
    // membership records after it.
    const seq = Number(/:(\d+),/.exec(added.lines[0]!)![1]);
    const sealed = (await M.sealed())[seq]!;
    expect(added.lines).toEqual([`Took effect: entry ${M.name}:${seq}, hash ${sealed.hash.slice(0, 12)}....`]);
    expect((await M.item(seq)).values).toMatchObject({ handle: "@check", kind: "checker" });

    // act, refused: una opens an issue under a definition that the real rules scope has never activated. The scope refuses it by
    // the guard's name, and writes nothing.
    const before = (await D.summary()).at;
    const refused = await run(una, "act", "open-issue", "--on", "directory", "--set", `definition=${textDigest("a definition no rules scope activated")}`, "--set", "title=An inactive definition", "--set", "conditions=[]");
    expect(refused).toEqual({ code: 1, lines: [`Refused: guard-failed (not-activated), judged at entry ${D.name}:${before.seq}. Nothing was written.`] });
    expect((await D.summary()).at).toEqual(before);

    // log, show and verify with una's real read session, under a TEST SECRET: the command asks membership for one with her key.
    const head = (await M.summary()).at.seq;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    try {
      const logged = await run(una, "log", "membership", "--limit", "2");
      expect(logged.code, logged.lines.join("\n")).toBe(0);
      const added = new RegExp(`^${M.name}:${seq}  \\S+  act add-member by key_\\S+; \\d+ effects, 1 sends$`);
      expect([logged.lines.length, logged.lines.some((line) => added.test(line)), logged.lines.at(-1)]).toEqual([3, true, `${head + 1} entries in all.`]);
      const shown = await run(una, "show", `membership:${seq}`);
      expect(shown).toEqual({ code: 0, lines: [`${logged.lines.find((line) => added.test(line))}; hash ${sealed.hash}.`, 'Fields: {"handle":"@check","kind":"checker"}. Grants recorded: 1.'] });
      // With her session the verifier reads membership's history, and not the register's, which records no membership: no session
      // covers it. So the replay cannot show the register's entry that the chain of creations rests on, and says so.
      const verified = await run(una, "verify", "membership");
      expect([verified.code, verified.lines[0], verified.lines.find((line) => line.startsWith("Finding:"))], verified.lines.join("\n")).toEqual([1, "Result: missing dependency: a source history could not be read.", expect.stringContaining(`the history of the source scope ${R.name} cannot be read`)]);
      // A read that the session does not cover is refused by the scope, and the command says so: the register records no membership.
      expect(await run(una, "log", R.name)).toEqual({ code: 1, lines: [`Cannot read the history of ${R.name}: forbidden.`] });
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
    }
    // With the test readers every history can be read, and each of the six replays consistent.
    for (const scope of ["register", "directory", "membership", "rules", "destination", "inbox"]) {
      const verified = await run(rita, "verify", scope);
      expect([scope, verified.code, verified.lines[0]], verified.lines.join("\n")).toEqual([scope, 0, "Result: consistent, for the mode, target, coverage and trusts stated below."]);
    }
  });
});
