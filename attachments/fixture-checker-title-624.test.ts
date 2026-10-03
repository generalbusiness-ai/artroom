/** Independent bounded reader vectors; no production admission or mutation credit. */
import { describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, Catalogue, RecordMeaning } from "@generalbusiness/artroom-contract";
import { STEP_FIELD_SPECS, threadTitle as policyThreadTitle, titleOf as policyTitleOf } from "@generalbusiness/artroom-policy/declared";
import { fieldsOf, meaningOf, threadTitle, titleOf } from "../src/index.ts";

const song: ActDeclaration = {
  label: "Open a score", targets: { none: ["open"] }, who: { roles: ["member"] }, hold: { scope: "body.scope" },
  body: { aKey: { type: "enum", values: ["same", "minor"], optional: true }, bMember: { type: "member", optional: true }, cAct: { type: "act", optional: true }, title: { type: "text", max: 80, optional: true } },
};
const declared = (declaration: ActDeclaration): RecordMeaning => ({ vocabulary: "declared", policy: "act_2_aaaaaaaa", kind: "score", label: declaration.label, declaration, binding: `sha256:${"a".repeat(64)}` });

describe("independent title reader controls at exact 624", () => {
  test("the client and policy reader entrypoints share the same pure functions", () => {
    expect(titleOf).toBe(policyTitleOf);
    expect(threadTitle).toBe(policyThreadTitle);
  });

  test("identical enum/text values agree, while distinct values expose the descriptor rather than JavaScript string rule", () => {
    const swapped: ActDeclaration = { ...song, body: { aKey: { type: "text", max: 80 }, title: { type: "enum", values: ["same", "minor"] } } };
    const equal = { title: "same", aKey: "same" };
    expect(titleOf(declared(song), equal)).toBe("Open a score: same");
    expect(titleOf(declared(swapped), equal)).toBe("Open a score: same");
    const different = { aKey: "minor", bMember: "@player", cAct: "act_4_00000000", title: "same" };
    expect(titleOf(declared(song), different)).toBe("Open a score: same");
    expect(titleOf(declared(swapped), different)).toBe("Open a score: minor");
    expect(titleOf({ label: song.label }, different)).toBe("Open a score: minor");
  });

  test("body and declaration insertion orders do not choose a different name; absent text is passed over", () => {
    const two: ActDeclaration = { ...song, body: { title: { type: "text", max: 80, optional: true }, composer: { type: "text", max: 80, optional: true }, aKey: { type: "enum", values: ["minor"], optional: true } } };
    const typed = { title: "Nardis", composer: "Davis", aKey: "minor", scope: ["scores/**"], because: [] };
    const canonical = { aKey: "minor", because: [], composer: "Davis", scope: ["scores/**"], title: "Nardis" };
    expect(Object.keys(typed)).not.toEqual(Object.keys(canonical));
    expect(titleOf(declared(two), typed)).toBe("Open a score: Davis");
    expect(titleOf(declared(two), canonical)).toBe("Open a score: Davis");
    expect(titleOf(declared(two), { title: "Nardis", aKey: "minor" })).toBe("Open a score: Nardis");
    expect(titleOf(declared(two), { aKey: "minor" })).toBe("Open a score: minor");
  });

  test("member and act strings do not outrank present text, and nontext-only values retain the original formatting", () => {
    expect(titleOf(declared(song), { bMember: "@player", cAct: "act_4_00000000", title: "Nardis" })).toBe("Open a score: Nardis");
    expect(titleOf(declared(song), { bMember: "@player", cAct: "act_4_00000000" })).toBe("Open a score: @player");
    const nontext: ActDeclaration = { ...song, body: { enabled: { type: "bool" }, count: { type: "int", min: 0, max: 9 }, charts: { type: "globs", max: 4 } } };
    expect(titleOf(declared(nontext), { enabled: false })).toBe("Open a score: no");
    expect(titleOf(declared(nontext), { count: 0 })).toBe("Open a score: 0");
    expect(titleOf(declared(nontext), { charts: ["scores/**", "parts/**"] })).toBe("Open a score: scores/**, parts/**");
    expect(titleOf(declared(nontext), { scope: ["scores/**"], because: [] })).toBe("Open a score");
  });

  test("an own text descriptor named toString is used, while inherited metadata and body values do not choose the title", () => {
    const odd = { ...song, body: { aKey: song.body!["aKey"]!, toString: { type: "text", max: 80, optional: true } } } as ActDeclaration;
    expect(titleOf(declared(odd), { aKey: "minor", toString: "Nardis" })).toBe("Open a score: Nardis");
    const inherited = Object.assign(Object.create({ title: { type: "text", max: 80 } }) as NonNullable<ActDeclaration["body"]>, { aKey: song.body!["aKey"]! });
    expect(titleOf(declared({ ...song, body: inherited }), { aKey: "minor", title: "Nardis" })).toBe("Open a score: minor");
    const body = Object.assign(Object.create({ title: "Nardis" }) as Record<string, unknown>, { aKey: "minor" });
    expect(titleOf(declared(song), body)).toBe("Open a score: minor");
  });

  test("legacy/platform/unknown/label-only meanings keep the first present field fallback", () => {
    const legacy: Catalogue = { vocabulary: "artroom-legacy-v1", policy: "act_1_aaaaaaaa", since: 0, until: null };
    const current: ActsCatalogue = { vocabulary: "declared", policy: "act_2_bbbbbbbb", since: 2, until: null, steps: "artroom-steps-v1", lanes: "by-scope", acts: { score: { declaration: song, binding: `sha256:${"a".repeat(64)}` } } };
    expect(titleOf(meaningOf(legacy, "claim"), { z: "Nardis", a: "minor" })).toBe("Claim: minor");
    expect(titleOf(meaningOf(current, "recover"), { z: "Nardis", a: "minor" })).toBe("Recover: minor");
    expect(titleOf(meaningOf(current, "unknown"), { z: "Nardis", a: "minor" })).toBe("unknown: minor");
    expect(titleOf({ label: song.label }, { z: "Nardis", a: "minor" })).toBe("Open a score: minor");
  });

  test("a nonempty goal wins; an available empty opening body gives the label; only unavailable opening gives the ID", () => {
    const opening = { meaning: declared(song), body: { title: "Nardis", aKey: "minor" } };
    expect(threadTitle({ lane: "act_4_00000000", goal: "Plan" }, opening)).toBe("Plan");
    expect(threadTitle({ lane: "act_4_00000000", goal: " " }, opening)).toBe(" ");
    expect(threadTitle({ lane: "act_4_00000000", goal: "" }, { meaning: declared(song), body: {} })).toBe("Open a score");
    expect(threadTitle({ lane: "act_4_00000000", goal: "" })).toBe("act_4_00000000");
  });

  test("the applicable opening step has only excluded scope metadata; check/release text fields belong to other targets", () => {
    expect(STEP_FIELD_SPECS.open).toEqual({ scope: { type: "globs", min: 1, max: 64 } });
    expect(fieldsOf(song, "none")!.filter((f) => f.from === "step").map((f) => f.name)).toEqual(["scope"]);
    expect(STEP_FIELD_SPECS.check["detail"]!.type).toBe("text");
    expect(STEP_FIELD_SPECS.release["note"]!.type).toBe("text");
    expect(titleOf(declared(song), { scope: ["scores/**"], aKey: "minor", title: "Nardis" })).toBe("Open a score: Nardis");
  });
});
