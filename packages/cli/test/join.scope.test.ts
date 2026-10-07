import { describe, expect, test } from "vitest";
import type { Digest, Item, OperationId, Read, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { outsideOf, wired } from "../../scope/test/outside.ts";
import { command, memoryStore, type Context } from "../src/index.ts";

const SERVICE = "https://scopes.test";
const reader = "a test reader";

// Invariant: a join signs once. When the accepted answer is lost, or the wait for the new inbox gives up, the next `join` of the
// same link sends the saved bytes (or, once the fact is kept, only reads and waits), signs no second join, and ends with the
// repository saved. The config never holds a signing key.
//
// As in `story.scope.test.ts`: real scopes behind the Worker's routes. STAND-INs: the Git host (`OutsideDouble`), the scheduler
// (`pause`), and the HTTP loss, which cancels a real reply after the scope has committed.
describe("join resumes a join it could not finish. The Git host and the scheduler are STAND-INs", () => {
  test("a lost accepted answer and a failed inbox wait are each resumed by the same signed join, with no second join and no signing key in the config", async () => {
    net.hold = net.deaf = null;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    try {
      await resumed();
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      platformNet.inspector = null;
    }
  });
});

async function resumed(): Promise<void> {
  let loseJoinAnswer = false;
  const joins: SignedIntent[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { signed?: SignedIntent } : null;
    const signed = new URL(url).pathname.endsWith("/acts") ? body?.signed : undefined;
    if (signed?.intent.kind === "join") joins.push(structuredClone(signed));
    const response = await routed(url, init);
    if (signed?.intent.kind === "join" && loseJoinAnswer) { loseJoinAnswer = false; await response.body?.cancel(); throw new Error("scripted loss after the join committed"); }
    return response;
  }) as unknown as Fetch;
  let register: Platform | null = null;
  let settling = true;
  const pause = async (waiting: readonly string[]) => {
    if (register) {
      const claims = await (register.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "claim");
      for (const claim of (await register.summary()).value.items.filter((item) => item.type === "claim").concat(claims.ok ? claims.value : [])) {
        outsideOf(register.name).answer(`${claim.id}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(claim.values["seed"] as Digest, 1), id: `repo-${claim.id}` } } });
      }
      while ((await (register.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
    }
    if (settling) await settle(...[...(register ? [register] : []), ...waiting.filter((scope) => scope !== register?.name).map((scope) => new Platform(scope as never))]);
  };
  const now = () => timeMs(net.clock.now)!;
  const rita: Context = { store: memoryStore(), fetch, now, pause };
  const run = (who: Context, ...argv: string[]) => command({ ...who }, argv);

  expect((await run(rita, "install", SERVICE, "--host", "git.example", "--namespace", "artroom")).code).toBe(0);
  const R = new Platform((await rita.store.config())!.register!.scope);
  wired.set(R.name, () => ({ outside: outsideOf(R.name) }));
  await R.restart();
  register = R;
  expect((await run(rita, "claim", "demo", "--handle", "@rita")).code).toBe(0);
  const M = new Platform((await rita.store.config())!.repository!.membership.scope);
  const linkFor = async (member: string) => (await run(rita, "invite", member, "--role", "member")).lines[1]!.split(": ")[1]!;
  const joinsInMembership = async () => (await M.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "join").length;
  const noKey = async (who: Context) => {
    const text = JSON.stringify(await who.store.config());
    expect(text).not.toContain(b64url((await who.store.secret("device"))!));
  };

  // (a) The scope commits the join, and the answer is lost. The signed join is kept; the second run sends the same bytes.
  const una: Context = { store: memoryStore(), fetch, now, pause };
  const unaLink = await linkFor("@una");
  loseJoinAnswer = true;
  const lost = await run(una, "join", unaLink);
  expect(lost).toMatchObject({ code: 1, lines: [expect.stringMatching(/^No answer:/)] });
  const kept = (await una.store.config())!;
  expect([kept.repository, kept.join!.step.accepted, await joinsInMembership()]).toEqual([undefined, undefined, 1]);
  await noKey(una);
  const resumedUna = await run(una, "join", unaLink);
  expect(resumedUna.code, resumedUna.lines.join("\n")).toBe(0);
  const done = (await una.store.config())!;
  expect([done.repository!.inbox, done.join, done.handle, await joinsInMembership()]).toEqual([expect.stringMatching(/^sc_/), undefined, "@una", 1]);
  expect(joins).toEqual([kept.join!.step.signed, kept.join!.step.signed]);
  await noKey(una);

  // (b) The join is accepted and then the wait for the inbox gives up. The fact is kept; the second run only reads and waits.
  const vera: Context = { store: memoryStore(), fetch, now, pause, tries: 1 };
  const veraLink = await linkFor("@vera");
  joins.length = 0;
  settling = false;
  const gaveUp = await run(vera, "join", veraLink);
  settling = true;
  expect(gaveUp).toMatchObject({ code: 1, lines: [expect.stringMatching(/^Gave up waiting for your inbox/)] });
  const waiting = (await vera.store.config())!;
  expect([waiting.repository, waiting.join!.step.accepted?.seq, joins.length, await joinsInMembership()]).toEqual([undefined, expect.any(Number), 1, 2]);
  await noKey(vera);
  const finished = await run(vera, "join", veraLink);
  expect(finished.code, finished.lines.join("\n")).toBe(0);
  expect([(await vera.store.config())!.repository!.inbox, (await vera.store.config())!.join, joins.length, await joinsInMembership()]).toEqual([expect.stringMatching(/^sc_/), undefined, 1, 2]);
  await noKey(vera);

  // A pending join does not take another invitation.
  const other = await linkFor("@wes");
  const wes: Context = { store: memoryStore(), fetch, now, pause, tries: 1 };
  settling = false;
  await run(wes, "join", other);
  settling = true;
  expect(await run(wes, "join", await linkFor("@xan"))).toEqual({ code: 1, lines: ["A join is pending here for another invitation or key; nothing was submitted."] });
  wired.delete(R.name);
}
