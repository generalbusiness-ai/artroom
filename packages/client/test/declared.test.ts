import { expect, test } from "vitest";
import type { DeclaredDefinition, FactRef, Grant, ScopeRef, Summary } from "@generalbusiness/artroom-contract";
import { definitionDigest, textDigest, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, ShapeError, declaredHandle, secretSigner, type Signer, type Transport } from "../src/index.ts";

/** A made-up definition with one act: a note's body is a detached text, and the act is presented one fact. */
const notes = {
  format: "artroom-definition-1", name: "notes", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    note: { many: true, max: 8, states: { kept: { final: false } }, initial: "kept", parties: {}, refs: {}, values: { body: { fixed: false, required: false, of: { type: "text", max: 40, detached: true } } } },
  },
  acts: {
    start: { step: "open", on: "note", also: {}, fields: {}, grant: "start", guards: [], effects: [], sends: [], attention: [] },
    write: {
      step: "transition", on: "note", also: {}, grant: "write",
      fields: {
        body: { type: "text", max: 40, detached: true, required: true }, title: { type: "text", max: 10, required: false },
        weight: { type: "int", min: 1, max: 3, required: false }, tone: { type: "enum", of: ["plain", "loud"], required: false },
      },
      presents: { proof: { kind: ["write"], under: "notes", required: false } },
      guards: [{ state: ["kept"] }], effects: [{ value: { slot: "body", from: { field: "body" } } }], sends: [], attention: [],
    },
  },
  receives: {}, timed: {}, rules: {},
} as const satisfies DeclaredDefinition;

const d = (c: string) => `sha256:${c.repeat(64)}` as const;
const at: ScopeRef = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" };
const head = { seq: 4, hash: d("4") };
/** A transport that answers a summary with that definition's name, and keeps what is submitted. Nothing else is asked of it. */
function serving(published: Summary["definition"] | null) {
  const submitted: unknown[][] = [];
  const transport = {
    summary: () => Promise.resolve(published === null ? { ok: false, reason: "forbidden" } : { ok: true, at: head, complete: true, value: { scope: at, status: "active", definition: published, time: "2026-10-04T12:00:00Z", items: [], counts: [] } }),
    submit: (...sent: unknown[]) => { submitted.push(sent); return Promise.resolve({ answer: "unavailable", reason: "busy" }); },
  } as unknown as Transport;
  return { scope: new ScopeHandle(transport, at.scope), submitted };
}

test("a declared handle signs an act of its definition: each field is checked against its declared type before anything is signed, a detached text is signed as its digest, and the text and the presented fact travel beside the intent", async () => {
  const { scope, submitted } = serving(definitionDigest(notes));
  const opened = await declaredHandle(scope, notes);
  if (!opened.ok) throw new Error(`no handle: ${opened.reason}`);
  const handle = opened.handle;
  let signatures = 0;
  const secret = secretSigner(new Uint8Array(32).fill(1));
  const signer: Signer = { key: secret.key, sign: (bytes) => { signatures++; return secret.sign(bytes); } };
  const text = "A body, held beside the intent.";
  const proof: FactRef = { at, seq: 2, hash: d("2") };

  const { signed, beside } = await handle.intent(signer, "write", { on: 3, expected: { on: 1 }, fields: { body: text, title: "A title", tone: "loud" }, presented: { proof } });
  // The intent is to the scope whose definition was checked, and holds the digest of the text. The signature covers the digest.
  expect(signed.intent).toMatchObject({ to: at, actor: signer.key, kind: "write", on: 3, expected: { on: 1 }, fields: { body: textDigest(text), title: "A title", tone: "loud" } });
  expect([verifySignedIntent(signed), JSON.stringify(signed).includes(text), beside]).toEqual([true, false, { texts: [text], presented: { proof } }]);
  // Submitting sends all three: the signed intent, the grants, and what travels beside it.
  const grants: Grant[] = [];
  await handle.submit(signed, grants, beside);
  expect(submitted).toEqual([[at.scope, signed, grants, beside]]);

  // A value that is not of its declared shape is refused before the signer is asked: nothing is signed.
  const write = (asked: object) => handle.intent(signer, "write", { on: 3, fields: { body: text }, ...asked } as never);
  const shapes: [string, object][] = [
    ["fields.body", { fields: { body: 7 } }], ["fields.body", { fields: { body: "x".repeat(41) } }], ["fields.body", { fields: {} }],
    ["fields.title", { fields: { body: text, title: "longer than ten" } }], ["fields.weight", { fields: { body: text, weight: 4 } }], ["fields.tone", { fields: { body: text, tone: "quiet" } }],
    ["fields.other", { fields: { body: text, other: 1 } }], ["on", { on: null }], ["presented.proof", { presented: { proof: 2 } }], ["presented.other", { presented: { other: proof } }],
  ];
  /** The path of the value that a `ShapeError` names, or what happened instead. */
  const refusedAt = (asking: Promise<unknown>) => asking.then(() => "signed", (error: unknown) => (error instanceof ShapeError ? error.path : String(error)));
  expect(await Promise.all(shapes.map(([, asked]) => refusedAt(write(asked))))).toEqual(shapes.map(([path]) => path));
  // The genesis act is no act of an existing scope.
  expect(await refusedAt(handle.intent(signer, "start" as never, {} as never))).toBe("start");
  expect(signatures).toBe(1);

  // The act kinds and the fields are typed from the definition's own data. These lines are checked by the compiler, and never run.
  void (async () => {
    // @ts-expect-error: `erase` is not an act of this definition.
    await handle.intent(signer, "erase", { on: 3, fields: { body: text } });
    // @ts-expect-error: the genesis act is no kind that an intent to an existing scope names.
    await handle.intent(signer, "start", {});
    // @ts-expect-error: `body` is a text.
    await handle.intent(signer, "write", { on: 3, fields: { body: 7 } });
    // @ts-expect-error: `body` is required.
    await handle.intent(signer, "write", { on: 3, fields: { title: "A title" } });
    // @ts-expect-error: `tone` is one of two values.
    await handle.intent(signer, "write", { on: 3, fields: { body: text, tone: "quiet" } });
    // @ts-expect-error: a transition is on an item.
    await handle.intent(signer, "write", { fields: { body: text } });
  });
});

test("a declared handle is refused for a scope that publishes another definition than the value given", async () => {
  const digest = definitionDigest(notes);
  // The same definition with one number changed is another definition, with another digest.
  const other = { ...notes, items: { note: { ...notes.items.note, max: 9 } } } as const satisfies DeclaredDefinition;
  const answers = await Promise.all([
    declaredHandle(serving(definitionDigest(other)).scope, notes), declaredHandle(serving(digest).scope, other),
    declaredHandle(serving("platform:directory@1").scope, notes), declaredHandle(serving(null).scope, notes), declaredHandle(serving(digest).scope, notes),
  ]);
  expect(answers.map((answer) => (answer.ok ? [true, answer.handle.digest] : [answer.reason, answer.published]))).toEqual([
    ["definition-mismatch", definitionDigest(other)], ["definition-mismatch", digest], ["definition-mismatch", "platform:directory@1"], ["forbidden", undefined], [true, digest],
  ]);
});
