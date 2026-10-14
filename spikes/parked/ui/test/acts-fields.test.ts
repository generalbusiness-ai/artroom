/**
 * Declared acts stage 5, the UI (request a5d64b35): reading typed fields and
 * targets with the declared limits, showing a record under its own
 * meaning, and saying what changed between two meanings of one kind.
 */

import { describe, expect, test } from "vitest";
import { declarationChanges, entryMeaning, fieldsOf, own, readBody, readField, readTarget, shapeOfTarget, targetText, targetsOf, typeText, valueText, type ActField } from "../src/room/acts.ts";
import type { ActDeclaration, RecordMeaning } from "../src/room/contract.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";

const declared = (name: string, field: ActField["field"], required = true): ActField => ({ name, from: "declaration", required, field }) as ActField;
const problem = (f: ActField, raw: string) => {
  const r = readField(f, raw);
  return r.ok ? null : r.problem;
};
const value = (f: ActField, raw: string) => {
  const r = readField(f, raw);
  if (!r.ok) throw new Error(r.problem);
  return r.value;
};

describe("a field may be named like an inherited property (R-DECL-12; review fb27de86, finding 1)", () => {
  test("its value is the form's own or it is empty: a required one is asked for, an optional one is left out, a given one is sent", () => {
    expect(own({ a: "1" }, "a")).toBe("1");
    for (const name of ["hasOwnProperty", "constructor", "toString", "valueOf"]) expect(own({ a: "1" }, name), name).toBeUndefined();
    for (const name of ["constructor", "toString", "valueOf"]) {
      const required = [declared(name, { type: "text", max: 20 }), declared("title", { type: "text", max: 20 })];
      const optional = [declared(name, { type: "text", max: 20 }, false), declared("title", { type: "text", max: 20 })];
      expect(readBody(required, { title: "X" }), name).toEqual({ ok: false, problems: { [name]: `${name} is required.` } });
      expect(readBody(required, { title: "X", [name]: "own value" }), name).toEqual({ ok: true, body: { title: "X", [name]: "own value" } });
      // Left out, an optional one is absent from the body: nothing is read from the prototype.
      const read = readBody(optional, { title: "X" });
      expect(read, name).toEqual({ ok: true, body: { title: "X" } });
      expect(read.ok && Object.hasOwn(read.body, name), name).toBe(false);
    }
  });
});

describe("reading one field: each type, with its declared limits", () => {
  test("a required field left empty is a problem; an optional one is left out of the body", () => {
    expect(problem(declared("title", { type: "text", max: 80 }), "  ")).toBe("title is required.");
    expect(readField(declared("summary", { type: "text", max: 80 }, false), "")).toEqual({ ok: true, value: undefined });
  });

  test("text: the limit is in bytes, and the text is sent as typed", () => {
    const f = declared("title", { type: "text", max: 5 });
    expect(value(f, " abc ")).toBe(" abc ");
    expect(problem(f, "abcdef")).toBe("title is 6 bytes; the limit is 5.");
    expect(problem(f, "ééé")).toBe("title is 6 bytes; the limit is 5.");
    expect(value(f, "éé")).toBe("éé");
  });

  test("int: whole numbers only, inside the declared range", () => {
    const f = declared("tempo", { type: "int", min: 40, max: 240 });
    expect(value(f, " 132 ")).toBe(132);
    expect(problem(f, "12.5")).toBe("tempo must be a whole number.");
    expect(problem(f, "fast")).toBe("tempo must be a whole number.");
    expect(problem(f, "39")).toBe("tempo must be 40 or more.");
    expect(problem(f, "241")).toBe("tempo must be 240 or less.");
    expect(value(f, "40")).toBe(40);
    expect(value(f, "240")).toBe(240);
  });

  test("a step's int has a minimum and no maximum", () => {
    const lease = fieldsOf(SETLIST_ACTS["add-part"]!, "thread")!.find((f) => f.name === "lease")!;
    expect(problem(lease, "0")).toBe("lease must be 1 or more.");
    expect(value(lease, "7")).toBe(7);
  });

  test("bool: yes or no, nothing else", () => {
    const f = declared("swing", { type: "bool" });
    expect(value(f, "true")).toBe(true);
    expect(value(f, "false")).toBe(false);
    expect(problem(f, "maybe")).toBe("swing must be yes or no.");
  });

  test("enum: one of the declared values", () => {
    const f = declared("key", { type: "enum", values: ["c", "g"] });
    expect(value(f, "g")).toBe("g");
    expect(problem(f, "h")).toBe("key must be one of c, g.");
  });

  test("globs: one per line, blank lines dropped, no more than the declared count", () => {
    const f = declared("charts", { type: "globs", max: 2 });
    expect(value(f, "charts/a.pdf\n\n  charts/b.pdf  \n")).toEqual(["charts/a.pdf", "charts/b.pdf"]);
    expect(problem(f, "a\nb\nc")).toBe("charts has 3 path patterns; the limit is 2.");
  });

  test("member, act and segment are fixed formats", () => {
    expect(value(declared("to", { type: "member" }), "@noor")).toBe("@noor");
    expect(problem(declared("to", { type: "member" }), "noor")).toBe("to must be a member's handle, such as @sam.");
    expect(value(declared("about", { type: "act" }), "act_12_0a1b2c3d")).toBe("act_12_0a1b2c3d");
    expect(problem(declared("about", { type: "act" }), "entry 12")).toBe("about must be an entry ID, such as act_12_0a1b2c3d.");
    expect(value(declared("section", { type: "segment" }), "head")).toBe("head");
    for (const bad of ["a/b", "..", "he*d"]) expect(problem(declared("section", { type: "segment" }), bad)).toBe("section must be one path segment, with no slash and no pattern character.");
  });

  test("a step's commit is 40 hex digits", () => {
    const head = fieldsOf(SETLIST_ACTS["add-part"]!, "thread")!.find((f) => f.name === "head")!;
    expect(value(head, "a".repeat(40))).toBe("a".repeat(40));
    expect(problem(head, "abc123")).toBe("head must be a commit: 40 hex digits.");
  });

  test("a field type this page does not know is refused, never guessed", () => {
    expect(problem(declared("x", { type: "colour" } as never), "red")).toBe("x has a type this page cannot fill in.");
    expect(typeText({ type: "colour" } as never)).toBe("a value");
  });
});

describe("reading a whole body and a target", () => {
  const fields = fieldsOf(SETLIST_ACTS["start-song"]!, "none")!;

  test("the form's fields are the step's, then the declaration's own, with required marked", () => {
    expect(fields.map((f) => `${f.name}:${f.from}:${f.required}`)).toEqual(["scope:step:true", "title:declaration:true", "key:declaration:true", "tempo:declaration:true", "swing:declaration:false"]);
    expect(targetsOf(SETLIST_ACTS["cue"]!)).toEqual(["entry"]);
    expect(fieldsOf(SETLIST_ACTS["cue"]!, "thread")).toBeNull();
  });

  test("a body is built only when every field reads; each problem is named by its field", () => {
    const bad = readBody(fields, { scope: "songs/x/**", title: "", key: "h", tempo: "900" });
    expect(bad).toEqual({ ok: false, problems: { title: "title is required.", key: expect.stringContaining("must be one of"), tempo: "tempo must be 240 or less." } });
    expect(readBody(fields, { scope: "songs/x/**", title: "X", key: "c", tempo: "120" })).toEqual({ ok: true, body: { scope: ["songs/x/**"], title: "X", key: "c", tempo: 120 } });
  });

  test("targets by shape", () => {
    expect(readTarget("none", {})).toEqual({ ok: true, target: null });
    expect(readTarget("thread", { lane: "act_3_0a1b2c3d" })).toEqual({ ok: true, target: { lane: "act_3_0a1b2c3d" } });
    expect(readTarget("thread", { lane: "" })).toEqual({ ok: false, problems: { lane: "Choose a thread." } });
    expect(readTarget("version", { lane: "act_3_0a1b2c3d", generation: "2" })).toEqual({ ok: true, target: { lane: "act_3_0a1b2c3d", generation: 2 } });
    expect(readTarget("version", { lane: "act_3_0a1b2c3d", generation: "0" })).toEqual({ ok: false, problems: { generation: "The version is a whole number, 1 or more." } });
    expect(readTarget("entry", { act: "act_9_ffffffff" })).toEqual({ ok: true, target: { act: "act_9_ffffffff" } });
    expect(readTarget("entry", { act: "9" })).toEqual({ ok: false, problems: { act: "Give an entry ID, such as act_12_0a1b2c3d." } });
    const line = readTarget("line", { lane: "act_3_0a1b2c3d", generation: "1", head: "b".repeat(40), path: "songs/x/bass.ly", line: "4", endLine: "6" });
    expect(line).toEqual({ ok: true, target: { lane: "act_3_0a1b2c3d", generation: 1, head: "b".repeat(40), path: "songs/x/bass.ly", line: 4, endLine: 6 } });
    expect(readTarget("line", { lane: "act_3_0a1b2c3d", generation: "1", head: "b".repeat(40), path: "/abs", line: "4", endLine: "2" })).toMatchObject({ ok: false, problems: { path: expect.any(String), endLine: expect.any(String) } });
  });
});

describe("a record under the meaning in force at its own seq (R-DECL-23)", () => {
  const meaning: RecordMeaning = { vocabulary: "declared", policy: "act_1_aaaaaaaa", kind: "cue", label: "Cue", declaration: SETLIST_ACTS["cue"]!, binding: `sha256:${"1".repeat(64)}`, retired: 14 };

  test("the label, the retirement, the declaration at that seq, the target in words and every field by name; because is left to the reasons", () => {
    const m = entryMeaning({ kind: "cue", target: { act: "act_4_0a1b2c3d" }, body: { signal: "head", to: "@noor", because: [{ act: "act_2_00000000" }] } }, meaning);
    expect(m).toEqual({
      vocabulary: "declared",
      kind: "cue",
      label: "Cue",
      policy: "act_1_aaaaaaaa",
      binding: `sha256:${"1".repeat(64)}`,
      declaration: SETLIST_ACTS["cue"],
      help: "A short signal to the band, attached to an entry.",
      retired: 14,
      target: "Entry act_4_0a1b2c3d",
      fields: [
        { name: "signal", value: "head" },
        { name: "to", value: "@noor" },
      ],
    });
  });

  test("a kind with no meaning keeps its kind and its fields", () => {
    const m = entryMeaning({ kind: "riff", target: null, body: { bars: 4, loud: true, files: ["a", "b"], extra: { x: 1 } } }, { vocabulary: "unknown", policy: "act_1_aaaaaaaa", kind: "riff", label: "riff" });
    expect(m.label).toBe("riff");
    expect(m.target).toBeNull();
    expect(m.retired).toBeUndefined();
    expect(m.fields).toEqual([
      { name: "bars", value: "4" },
      { name: "loud", value: "yes" },
      { name: "files", value: "a, b" },
      { name: "extra", value: '{"x":1}' },
    ]);
  });

  test("target shapes and words", () => {
    expect(shapeOfTarget(null)).toBe("none");
    expect(shapeOfTarget({ lane: "l" })).toBe("thread");
    expect(shapeOfTarget({ lane: "l", generation: 2 })).toBe("version");
    expect(shapeOfTarget({ act: "a" })).toBe("entry");
    expect(shapeOfTarget({ lane: "l", generation: 2, head: "h", path: "p", line: 3 })).toBe("line");
    expect(shapeOfTarget("x")).toBeNull();
    expect(targetText({ lane: "l", generation: 2 })).toBe("Version 2 of thread l");
    expect(targetText({ lane: "l", generation: 2, head: "h", path: "p.ly", line: 3, endLine: 5 })).toBe("p.ly, line 3 to 5, in version 2 of thread l");
    expect(valueText(false)).toBe("no");
  });
});

describe("what changed between two meanings of one kind", () => {
  const was = SETLIST_ACTS["add-part"]!;

  test("a new required field, a changed limit and a removed field are each named", () => {
    const now: ActDeclaration = { ...was, body: { instrument: was.body!["instrument"]!, section: was.body!["section"]!, bars: { type: "int", min: 1, max: 32 }, feel: { type: "enum", values: ["straight", "swung"] } } };
    expect(declarationChanges(was, now)).toEqual([
      "Changed field: bars (a whole number from 1 to 32, required); it was bars (a whole number from 1 to 64, required).",
      "New field: feel (one of straight, swung, required).",
      "The field charts is gone.",
      "The field summary is gone.",
    ]);
  });

  test("changed steps, a new and a lost target, the threads and the hold", () => {
    const now: ActDeclaration = { ...was, label: "Add your part", targets: { thread: ["version", "land"], entry: ["comment"] }, threads: ["start-song", "start-jam"] };
    const changes = declarationChanges(was, now);
    expect(changes).toContain("It was called “Add a part” and is now “Add your part”.");
    expect(changes).toContain("On a thread it now does version then land; it did version.");
    expect(changes).toContain("It can now act on an entry in the log: comment.");
    expect(changes).toContain("It acts on these kinds of thread: start-song, start-jam; it was start-song.");
    const open = SETLIST_ACTS["start-song"]!;
    expect(declarationChanges(open, { ...open, hold: { ...open.hold!, leaseSeconds: 60 } })).toEqual(["What it holds when it opens a thread changed: its scope, lease or workspace."]);
    expect(declarationChanges(now, was)).toContain("It no longer acts on an entry in the log.");
  });

  test("nothing a person fills in changed: the list is empty", () => {
    expect(declarationChanges(was, { ...was, help: "New help." })).toEqual([]);
  });
});
