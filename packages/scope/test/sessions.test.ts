import { describe, expect, test } from "vitest";
import { abortAllDurableObjects } from "cloudflare:test";
import type { SessionClaims, SignedSessionRequest } from "@generalbusiness/artroom-contract";
import { b64url, canonicalBytes, unb64url } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, type Fetch, type Session } from "@generalbusiness/artroom-client";
import type { Actor } from "@generalbusiness/artroom-derive/testing";
import { mintSession, sessionsOf } from "../src/index.ts";
import { later, net, soon } from "./net.ts";
import { office, repository, rita, routed, una, type Platform } from "./repository.ts";
import { reader } from "./support.ts";
import { TEST_DEPLOYMENT, platformNet } from "./worker.ts";

// Every scope here is on real Durable Object storage, in the namespace `PLATFORM`, under the production authority. The read sessions are
// the real ones of `sessions.ts`, through the Worker's routes, under a TEST SECRET that each test generates. The stand-ins are those that
// `repository.ts` lists. The fixture is built and looked at through the test readers, a STAND-IN, and `real` turns the real sessions on
// for the calls that a test is about.

const SERVICE = "https://scope.test";
/** A TEST SECRET: 32 random bytes as text. It is in memory only, and no assertion prints it. */
const testSecret = (): string => b64url(crypto.getRandomValues(new Uint8Array(32)));
/** Run with the real read sessions as the readers port of every scope of the namespace. */
async function real<T>(run: () => Promise<T>): Promise<T> {
  platformNet.sessions = true;
  try {
    return await run();
  } finally {
    platformNet.sessions = false;
  }
}
const url = (node: Platform, path = ""): string => `${SERVICE}/v1/scopes/${node.name}${path}`;
/** One read over the Worker's route, with what the reader presents in the `Authorization` header: the status, and `ok` or the reason. */
async function read(node: Platform, path: string, presented: string | null): Promise<[number, string]> {
  const response = await real(() => routed(url(node, path), presented === null ? {} : { headers: { authorization: presented } }));
  const body = await response.json() as { ok?: boolean; reason?: string; error?: string };
  return [response.status, body.ok ? "ok" : (body.reason ?? body.error ?? "?")];
}
let operations = 0;
const signedRequest = async (M: Platform, who: Actor, seconds = 60): Promise<SignedSessionRequest> => sessionRequest(await M.at(), who.secret, soon(seconds), `op-${operations++}`);
/** A device asks membership for a session, with the client's own function, over the Worker's route. */
const ask = (M: Platform, signed: SignedSessionRequest) => real(() => requestSession(SERVICE, M.name, signed, { fetch: routed as unknown as Fetch }));
async function session(M: Platform, who: Actor): Promise<Session> {
  const answer = await ask(M, await signedRequest(M, who));
  if (!answer.ok) throw new Error(`no session: ${answer.reason}`);
  return answer.session;
}
/** The token that a session presents. Only a test takes it apart. */
const tokenOf = (held: Session): string => held.reader().slice("Session ".length);
/** The same token with other claims under its old MAC. */
function changed(held: Session, claims: SessionClaims): string {
  const [prefix, , mac] = tokenOf(held).split(".");
  return `Session ${prefix}.${b64url(canonicalBytes(claims))}.${mac}`;
}

/** A stream over the Worker's route: its lines, as they are read. */
async function stream(node: Platform, presented: string) {
  const response = await real(() => routed(url(node, "/stream"), { headers: { authorization: presented } }));
  if (response.status !== 200) return { refused: ((await response.json()) as { reason: string }).reason };
  const from = response.body!.getReader();
  const decoder = new TextDecoder();
  return {
    from,
    /** The next line, or null when the stream has ended. */
    async next(): Promise<unknown> {
      const { done, value } = await from.read();
      return done ? null : JSON.parse(decoder.decode(value).trim().split("\n").at(-1)!);
    },
  };
}
type Open = Exclude<Awaited<ReturnType<typeof stream>>, { refused: string }>;
const opened = async (node: Platform, presented: string): Promise<Open> => {
  const made = await stream(node, presented);
  if ("refused" in made) throw new Error(`no stream: ${made.refused}`);
  return made;
};
const streams = async (node: Platform) => (await (node.object as unknown as { serving(): Promise<{ streams: { open: number; released: number } }> }).serving()).streams;
const head = async (node: Platform) => (await node.summary()).at;

describe("read sessions (authority note, sections 3.9, 3.12 row W6, 5.3 and 5.5; the proof plan's key O12, the service's row)", () => {
  test("T15: a session reads the scopes of its own repository and no other, until its end on the reading scope's clock; a revoked key keeps its session and gets no new one; an abandoned reader is released at once and once; and a session's end closes a stream at its next send, with no byte", async () => {
    platformNet.secret = testSecret();
    try {
      const { M, unasInbox, unasKey } = await repository();
      const other = (await office()).M;
      const m = await M.at();
      const issued = soon(600);
      const [unas, ritas] = [await session(M, una), await session(M, rita)];

      // What a session binds: the deployment, the membership scope with its incarnation, the member and the key, the reads of the role
      // at issue, and an end time 600 seconds after membership's reading. Only an admin's session reads the operator's record.
      const reads = ["summary", "items", "history", "entry", "outbox", "operations", "log", "retained"];
      expect(unas.claims).toEqual({ v: 1, deployment: TEST_DEPLOYMENT, membership: m, member: "@una", key: una.key, reads, ends: issued });
      expect([ritas.claims.member, ritas.claims.reads]).toEqual(["@rita", [...reads, "incidents", "waiting"]]);
      // The token is in no text form of a session.
      expect(`${JSON.stringify(unas)} ${String(unas)}`).not.toContain("ars1.");

      const una2 = unas.reader();
      const forged = sessionsOf(testSecret(), TEST_DEPLOYMENT)!;
      const elsewhere = sessionsOf(platformNet.secret, "another-deployment")!;
      expect([
        // Its own repository: the membership scope, and a scope whose genesis records that membership scope.
        await read(M, "", una2), await read(unasInbox, "", una2), await read(unasInbox, "/history", una2),
        // A reader with no session, and one that presents something else, read nothing.
        await read(M, "", null), await read(M, "", reader),
        // A token for one repository is refused by a scope of another.
        await read(other, "", una2),
        // Other claims under the old MAC; the same claims under another secret; and a true MAC of this secret for another deployment.
        await read(M, "", changed(unas, { ...unas.claims, reads: [...reads, "incidents"] })),
        await read(M, "", `Session ${mintSession(forged, unas.claims)}`),
        await read(M, "", `Session ${mintSession(elsewhere, { ...unas.claims, deployment: "another-deployment" })}`),
        // The reads of the admin page are not a member's.
        await read(M, "/incidents", una2), await read(M, "/waiting/diagnosed", una2), await read(M, "/incidents", ritas.reader()), await read(M, "/waiting/unanswered", ritas.reader()),
      ]).toEqual([
        [200, "ok"], [200, "ok"], [200, "ok"], [403, "forbidden"], [403, "forbidden"], [403, "forbidden"], [403, "forbidden"], [403, "forbidden"], [403, "forbidden"],
        [403, "forbidden"], [403, "forbidden"], [200, "ok"], [200, "ok"],
      ]);
      // A token in a URL is refused before anything is routed, and is not used (section 5.3).
      const inUrl = await real(() => routed(`${url(M)}?session=${tokenOf(unas)}`));
      expect([inUrl.status, await inUrl.json()]).toEqual([400, { error: "credential-in-url" }]);

      // Two streams of membership's head, under una's session. Each begins with the head.
      const [first, second] = [await opened(M, una2), await opened(M, una2)];
      expect([await first.next(), await second.next(), await streams(M)]).toEqual([{ at: await head(M) }, { at: await head(M) }, { open: 2, released: 0 }]);

      // A reader that went away, while no update is pending: its pending read completes, and the scope releases its subscription at
      // once. It does not wait for a commit or for the session's end. A second cancel releases nothing again.
      const pending = second.from.read();
      await second.from.cancel();
      expect([(await pending).done, await streams(M)]).toEqual([true, { open: 1, released: 1 }]);
      await second.from.cancel();
      expect(await streams(M)).toEqual({ open: 1, released: 1 });

      // rita revokes una's key. The commit is sent on the stream that is left: the session is still accepted, until it ends.
      const waiting = first.next();
      const revoke = await M.intent(rita, "revoke-key", { on: unasKey, expected: await M.expected({ on: unasKey, roster: 0, member: (await M.item(unasKey)).refs["member"] as number }), fields: { as: "retired" } });
      expect((await real(() => M.stub.submit(revoke, []))).answer).toBe("accepted");
      expect(await waiting).toEqual({ at: await head(M) });
      // The revoked key reads on, and is refused a new session. An offline device is not asked anything: nothing here reads a connection.
      expect([await read(M, "", una2), await read(unasInbox, "", una2), await ask(M, await signedRequest(M, una))]).toEqual([[200, "ok"], [200, "ok"], { ok: false, reason: "unauthorized" }]);

      // The end, on the reading scope's clock. One second before it the session reads. At the bound it is past it.
      await later(599);
      expect(await read(unasInbox, "", una2)).toEqual([200, "ok"]);
      await later(1);
      expect([await read(unasInbox, "", una2), await read(M, "", una2)]).toEqual([[403, "forbidden"], [403, "forbidden"]]);
      // There is no timer: the stream is still held, and it has been sent nothing. The next send is due at the next commit: the session
      // is checked, the stream is closed with no byte, and its subscription is released. The released count is of both streams.
      expect(await streams(M)).toEqual({ open: 1, released: 1 });
      const last = first.from.read();
      const invite = await M.intent(rita, "invite-member", { fields: { handle: "@vera", role: "member", inviteHash: "sha256:" + "0".repeat(64), inviteEnds: soon(3600) } });
      expect((await real(() => M.stub.submit(invite, []))).answer).toBe("accepted");
      expect([(await last).done, await streams(M)]).toEqual([true, { open: 0, released: 2 }]);

      // The scope's clock reads earlier than its previous entry's time: a session read is answered `clock-behind` and nothing is sent, no
      // stream opens, and membership issues no session. A scope whose own clock is not behind its own history reads as before.
      const fresh = await session(M, rita);
      const request = await signedRequest(M, rita);
      net.clock.now = soon(-5);
      expect([await read(M, "", fresh.reader()), await stream(M, fresh.reader()), await ask(M, request), await read(unasInbox, "", fresh.reader())])
        .toEqual([[503, "clock-behind"], { refused: "clock-behind" }, { ok: false, reason: "clock-behind" }, [200, "ok"]]);
      net.clock.now = soon(5);

      // A restart closes the scope's streams. The token is unchanged, and is checked again at the next read.
      // The objects are aborted, as a process that stops is: an eviction waits for an open stream, and so cannot show this.
      const kept = await opened(M, fresh.reader());
      await kept.next();
      const ended = kept.from.read();
      await abortAllDurableObjects();
      expect([(await ended).done, await streams(M), await read(M, "", fresh.reader())]).toEqual([true, { open: 0, released: 0 }, [200, "ok"]]);
    } finally {
      platformNet.secret = null;
    }
  });

  test("T42: with no session secret bound, or a short one, no session is issued and none is accepted: nothing is checked, minted or read; and a replaced secret ends every session at once", async () => {
    platformNet.secret = testSecret();
    try {
      const { M } = await repository();
      const held = await session(M, rita);
      expect(await read(M, "", held.reader())).toEqual([200, "ok"]);
      const answers = async () => {
        const body = JSON.stringify(await signedRequest(M, rita));
        const asked = await real(() => routed(url(M, "/sessions"), { method: "POST", body }));
        const malformed = await real(() => routed(url(M, "/sessions"), { method: "POST", body: "{}" }));
        const page = await real(() => routed(url(M), { headers: { authorization: held.reader() } }));
        return [asked.status, await asked.json(), await malformed.json(), page.status, await page.json(), await stream(M, held.reader()), await read(M, "", null)];
      };
      // Each answer is the refusal and nothing more: no token, no head and no value. A request that is not even a session request gets
      // the same answer, because nothing of it was looked at. A reader that presents no session is `forbidden`, as ever.
      const unavailable = [503, { ok: false, reason: "sessions-unavailable" }, { ok: false, reason: "sessions-unavailable" }, 503, { ok: false, reason: "sessions-unavailable" }, { refused: "sessions-unavailable" }, [403, "forbidden"]];

      // No secret is bound: the configuration is read from the Worker's own bindings, as deployed, and the test Worker binds none.
      platformNet.secret = null;
      expect(await answers()).toEqual(unavailable);
      // A secret of 31 bytes is not used.
      platformNet.secret = "s".repeat(31);
      expect(await answers()).toEqual(unavailable);
      expect([sessionsOf(undefined, TEST_DEPLOYMENT), sessionsOf("s".repeat(31), TEST_DEPLOYMENT), sessionsOf("s".repeat(32), undefined), sessionsOf("s".repeat(32), "") === null, sessionsOf("s".repeat(32), TEST_DEPLOYMENT) === null])
        .toEqual([null, null, null, true, false]);

      // The operator replaces the secret. Every session that the old one made ends at once, and a new request gets a new session.
      platformNet.secret = testSecret();
      expect([await read(M, "", held.reader()), await read(M, "", (await session(M, rita)).reader())]).toEqual([[403, "forbidden"], [200, "ok"]]);
      // A session request that is signed by another key than it names, or that is to another membership scope, gets no session.
      const [good, away] = [await signedRequest(M, rita), await signedRequest((await office()).M, rita)];
      expect([await ask(M, { ...good, request: { ...good.request, actor: una.key } }), await ask(M, away), await ask(M, await signedRequest(M, rita, 901)), unb64url(good.sig)?.length])
        .toEqual([{ ok: false, reason: "bad-request" }, { ok: false, reason: "misaddressed" }, { ok: false, reason: "bad-request" }, 64]);
    } finally {
      platformNet.secret = null;
    }
  });
});
