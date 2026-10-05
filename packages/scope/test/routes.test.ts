import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, Intent } from "@generalbusiness/artroom-contract";
import { signIntent } from "@generalbusiness/artroom-bytes";
import { grantOf } from "@generalbusiness/artroom-derive/testing";
import type { Founded } from "../src/index.ts";
import { route, type Api } from "../src/worker.ts";
import { definition } from "./support.ts";
import { founding, rita, soon } from "./net.ts";

test("one real route: a founding and an act through the Worker's fetch; the exact retry through the service binding returns the same receipt; a read states its position", async () => {
  const post = (path: string, body: unknown) => SELF.fetch(`https://scopes.test${path}`, { method: "POST", body: JSON.stringify(body) });
  const { signed, name } = founding(definition, { title: "A lane", opener: rita.member });
  const founded = await post("/v1/scopes", { founding: signed, definition: definition.declared });
  const genesis = await founded.json<Founded>();
  if (genesis.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(genesis)}`);
  // The service computed the scope ID from the signed intent and the definition.
  const at = genesis.receipt.fact.at;
  expect([founded.status, at.scope]).toEqual([201, name]);

  const intent: Intent = { v: 1, to: at, actor: rita.key, kind: "offer", on: null, expected: { intent: 1 }, fields: { intent: 0 }, idempotencyKey: "k", notAfter: soon(60) };
  const body = { signed: signIntent(intent, rita.secret), grants: [grantOf(rita, at, ["offer"])] };
  const first = await post(`/v1/scopes/${name}/acts`, body);
  const accepted = await first.json<Answer>();
  expect([first.status, accepted]).toMatchObject([200, { answer: "accepted", receipt: { fact: { at, seq: 1 } } }]);
  expect(await (env.API as unknown as Api).submit(name, body.signed, body.grants)).toEqual(accepted);

  const summary = await SELF.fetch(`https://scopes.test/v1/scopes/${name}`);
  expect([summary.status, await summary.json()]).toMatchObject([200, { ok: true, complete: true, at: { seq: 1, hash: accepted.answer === "accepted" && accepted.receipt.fact.hash }, value: { scope: at, status: "active" } }]);
  // Without the grant the same Worker refuses, and says so in HTTP's terms too.
  const other = signIntent({ ...intent, idempotencyKey: "k2" }, rita.secret);
  expect((await post(`/v1/scopes/${name}/acts`, { signed: other, grants: [] })).status).toBe(403);
});

test("the HTTP boundary: a body is budgeted in raw bytes while it is read, and a path that is not percent-encoded text is refused; neither reaches an operation", async () => {
  const post = (body: BodyInit) => route(new Request("https://scopes.test/v1/scopes", { method: "POST", body }), env.NET);
  // A founding that would be accepted, with a padding member of 400,000 three-byte characters: under 1 MiB of UTF-16 units, over it in bytes.
  const { signed } = founding(definition, { title: "A lane", opener: rita.member });
  const asked = { founding: signed, definition: definition.declared };
  const padded = await post(JSON.stringify({ ...asked, pad: "\u4e00".repeat(400_000) }));
  expect([padded.status, await padded.json()]).toEqual([400, { error: "bad-request" }]);
  // A body with no end and no declared length: it is cancelled at the chunk that passes the budget, and is not read further.
  let sent = 0;
  const endless = new ReadableStream<Uint8Array>({ pull(c) { sent += 65536; c.enqueue(new Uint8Array(65536).fill(32)); } }, { highWaterMark: 0 });
  expect([(await post(endless)).status, sent]).toEqual([400, 1024 * 1024 + 65536]);
  // The same founding with no padding is accepted: it was the size that refused it.
  expect((await post(JSON.stringify(asked))).status).toBe(201);

  const malformed = await route(new Request("https://scopes.test/v1/scopes/%"), env.NET);
  expect([malformed.status, await malformed.json()]).toEqual([400, { error: "bad-request" }]);
});
