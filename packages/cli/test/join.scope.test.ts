import { expect, test } from "vitest";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, factRefOf, textDigest, timeMs, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedIntent, type Fetch } from "@generalbusiness/artroom-client";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { office, Platform, rita, routed, settle } from "../../scope/test/repository.ts";
import { command, memoryStore, type Context } from "../src/index.ts";

// Invariant: uncertain join delivery and accepted enrollment awaiting its
// inbox keep the exact signature, key, deadline and fact across restart.
// Membership, inbox, their rules, and HTTP routes are real. The office is a
// STAND-IN directory (no founding); sibling IDs in the link are placeholders
// never read here. memoryStore stands for local persistence. Loss/unavailable
// replies and pause are STAND-INs for transport and scheduling, with no sleep.
test("join retries its exact private envelope after accepted reply loss and inbox wait failure across restart; saved facts and links cannot substitute another enrollment", async () => {
  const clock = net.clock.now;
  net.hold = net.deaf = null;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true;
  platformNet.inspector = "a test reader";
  try {
    const { O, M } = await office();
    const seat = await M.did(rita, "seat", { expected: { roster: 1 } });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    await settle(O, M, await M.created(seat));
    const invitationSecret = "the private invitation secret of at least 32 bytes";
    const invitation = await M.did(rita, "invite-member", { fields: { handle: "@joiner", role: "member", inviteHash: textDigest(invitationSecret), inviteEnds: timeOf(timeMs(net.clock.now)! + 3600_000) } });
    const linkData = { v: 1, service: "https://scopes.test", repository: { directory: await O.at(), membership: await M.at(), rules: O.name, destination: O.name }, invitation, secret: invitationSecret, handle: "@joiner" };
    const link = `artroom-invite:${b64url(utf8(JSON.stringify(linkData)))}`;
    let lose = true;
    let hideInbox = true;
    let wrongReceipt = false;
    let wrongSettlement = false;
    const sent: SignedIntent[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { signed?: SignedIntent } : null;
      const signed = path.endsWith("/acts") ? body?.signed : undefined;
      if (signed?.intent.kind === "join") sent.push(structuredClone(signed));
      if (hideInbox && path.startsWith("/v1/scopes/") && !path.slice("/v1/scopes/".length).includes("/") && !path.endsWith(M.name)) return Response.json({ ok: false, reason: "unavailable" });
      const response = await routed(url, init);
      if (signed?.intent.kind === "join" && lose) {
        lose = false;
        await response.body?.cancel();
        throw new Error("scripted lost accepted join reply");
      }
      if (signed?.intent.kind === "join" && wrongReceipt) {
        const answer = await response.json() as { receipt?: { fact: { at: { inc: string } } } };
        if (!answer.receipt) return Response.json(answer);
        answer.receipt.fact.at.inc = (await O.at()).inc;
        return Response.json(answer);
      }
      if (path.endsWith("/settle") && wrongSettlement) {
        const answer = await response.json() as { value: { fact: unknown } };
        answer.value.fact = factRefOf((await M.entries())[invitation]!);
        return Response.json(answer);
      }
      return response;
    }) as unknown as Fetch;
    const store = memoryStore();
    const ctx: Context = { store, fetch, now: () => timeMs(net.clock.now)!, tries: 1, pause: async (waiting) => settle(...waiting.map((id) => new Platform(id))) };
    const run = () => command({ ...ctx }, ["join", link]);
    expect(await run()).toMatchObject({ code: 1, lines: [expect.stringMatching(/^No answer:/)] });
    const unsatisfied = (await store.config())!;
    const pending = unsatisfied.join!;
    const saved = JSON.parse(new TextDecoder().decode((await store.private(pending.request))!)) as SignedIntent;
    expect([unsatisfied.repository, pending.accepted, sent]).toEqual([undefined, undefined, [saved]]);
    expect(JSON.stringify(unsatisfied)).not.toContain(invitationSecret);
    const key = (await store.secret("device"))!;
    expect(JSON.stringify(unsatisfied)).not.toContain(b64url(key));
    const joins = async () => (await M.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "join");
    expect(await joins()).toHaveLength(1);
    // The original broken retry signs another envelope: the real membership
    // refuses it because the accepted join already used this key/invitation.
    const fresh = await signedIntent(secretSigner(key), { to: linkData.repository.membership, kind: "join", fields: { invitation, secret: invitationSecret } }, { now: timeMs(net.clock.now)! });
    expect(await M.stub.submit(fresh, [])).toMatchObject({ answer: "refused", reason: "unauthorized" });
    expect(await command({ ...ctx }, ["join", `artroom-invite:${b64url(utf8(JSON.stringify({ ...linkData, handle: "@other" })))}`])).toMatchObject({ code: 1, lines: [expect.stringMatching(/^The invitation link does not match/)] });
    expect(sent).toHaveLength(1);
    // A different valid envelope for the same link/key cannot refresh the
    // saved deadline or idempotency key by changing the private pointer.
    await store.keepPrivate("join-other", utf8(JSON.stringify(fresh)));
    await store.save({ ...unsatisfied, join: { ...pending, request: "join-other" } });
    expect(await run()).toMatchObject({ code: 1, lines: ["The saved join does not match this invitation, membership and signing key; nothing was submitted."] });
    expect(sent).toHaveLength(1);
    await store.save(unsatisfied);
    net.clock.now = timeOf(timeMs(net.clock.now)! + 30_000);
    await M.restart();
    wrongReceipt = true;
    expect(await run()).toMatchObject({ code: 1, lines: [expect.stringMatching(/^No answer: The accepted reply does not match/)] });
    expect((await store.config())!.join!.accepted).toBeUndefined();
    wrongReceipt = false;
    const waiting = await run();
    expect(waiting).toMatchObject({ code: 1, lines: [expect.stringMatching(/^Gave up waiting for your inbox/)] });
    const accepted = (await store.config())!;
    expect(accepted.join!.accepted).toEqual(factRefOf((await joins())[0]!));
    expect(accepted.join!.repository.inbox).toBeDefined();
    expect(sent).toEqual([saved, saved, saved]);
    // A stored marker for another real entry cannot replace the exact join.
    const beforeSettlement = sent.length;
    await store.save({ ...accepted, join: { ...accepted.join!, accepted: factRefOf((await M.entries())[invitation]!) } });
    expect(await run()).toMatchObject({ code: 1, lines: ["The saved accepted fact does not match this exact join; nothing was submitted."] });
    expect(sent).toHaveLength(beforeSettlement);
    await store.save(accepted);
    wrongSettlement = true;
    expect(await run()).toMatchObject({ code: 1, lines: ["The saved accepted fact does not match this exact join; nothing was submitted."] });
    wrongSettlement = false;
    net.clock.now = timeOf(timeMs(saved.intent.notAfter)! + 1000);
    await M.restart();
    await new Platform(accepted.join!.repository.inbox!).restart();
    hideInbox = false;
    const finished = await run();
    expect(finished.code, finished.lines.join("\n")).toBe(0);
    expect(sent).toHaveLength(beforeSettlement); // settlement is read-only, even past the saved deadline.
    expect([await store.secret("device"), (await store.config())!.join, (await store.config())!.repository!.inbox]).toEqual([key, undefined, accepted.join!.repository.inbox]);
    expect(await joins()).toHaveLength(1);
    expect(finished.lines.join("\n")).not.toContain(invitationSecret);
    expect(sent.every((signed) => signed.intent.notAfter === saved.intent.notAfter)).toBe(true);
  } finally {
    platformNet.secret = null;
    platformNet.sessions = false;
    platformNet.inspector = null;
    net.clock.now = clock;
  }
});
