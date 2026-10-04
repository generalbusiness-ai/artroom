/**
 * Declared acts (docs/protocol.md section 33): the acts validator's rules
 * and bounds for a `v2` document (R-DECL-24, R-DECL-26), the binding
 * identity (R-DECL-15), and the built-in data (R-DECL-1, section 33.7).
 *
 * The refusals are one table, run by one test. Each row is a rule or a
 * bound of section 33, named by the guard that enforces it (`G:<id>` in
 * src/acts.ts), so a failure names the row.
 */

import { describe, expect, test } from "vitest";
import { ARTROOM_LEGACY_V1, ARTROOM_LEGACY_V1_DIGEST, type PolicyDocumentV2 } from "@generalbusiness/artroom-contract";
import { validateCheckerConfigV2, validatePolicyV2, type PolicyV2Context } from "../src/acts.ts";
import { bindingOf, bindingSubject } from "../src/binding.ts";
import { CODE_REVIEW_ACTS } from "../src/codereview.ts";
import { defaultPolicy } from "../src/helpers.ts";
import { canonicalize, digestJson } from "../src/integrity.ts";
import { validatePolicy } from "../src/validate.ts";
import { IN_KEY, JAM_ACTS, JAM_RULES } from "./support/jam.ts";

type Doc = Record<string, unknown> & { acts: Record<string, Record<string, unknown>> };
type Any = Record<string, any>;
/** Test edits reach into declarations freely. */
type Loose = any;

const clone = <T>(v: T): T => structuredClone(v) as T;

/** A `v2` document: today's default policy fields, the steps version and these acts. */
function v2(acts: object, extra: object = {}): Doc {
  return clone({ ...defaultPolicy(), format: "artroom-policy-v2", steps: "artroom-steps-v1", acts, ...extra }) as unknown as Doc;
}
const codeReview = () => v2(CODE_REVIEW_ACTS);
const jam = () => v2(JAM_ACTS, { rules: [...defaultPolicy().rules, ...JAM_RULES] });
const CI = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 600 };

function problems(doc: unknown, ctx?: PolicyV2Context): readonly string[] {
  const v = validatePolicyV2(doc, ctx);
  return v.ok ? [] : v.problems;
}

/** Expect `policy-invalid` with a problem matching `pattern`. */
function refused(doc: unknown, pattern: RegExp, ctx?: PolicyV2Context): void {
  const v = validatePolicyV2(doc, ctx);
  expect(v.ok, "the document should be refused").toBe(false);
  if (v.ok) return;
  expect(v.refusal.rule).toBe("policy-invalid");
  expect(v.problems.some((p) => pattern.test(p)), `no problem matches ${pattern}: ${v.problems.join(" | ")}`).toBe(true);
}

describe("accepted documents (R-DECL-24)", () => {
  test("the code-review declarations validate, with a checker naming check, and no warnings", () => {
    const v = validatePolicyV2(codeReview(), { checkers: { ci: CI } });
    expect(v.ok ? [] : v.problems).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(Object.keys(CODE_REVIEW_ACTS).sort()).toEqual(["check", "claim", "land", "note", "propose", "release", "review"]);
  });

  test("the jam's declarations validate with in-key.json; propose-rules holds end only by expiry", () => {
    const v = validatePolicyV2(jam(), { checkers: { "in-key": IN_KEY } });
    expect(v.ok ? [] : v.problems).toEqual([]);
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatch(/^hold-unending: .*propose-rules/);
  });

  test("rules may name declared kinds and platform kinds", () => {
    const doc = codeReview();
    (doc["rules"] as unknown[]).push({ id: "quiet", kind: "notify", on: ["claim", "renew", "roster", "recover"], to: ["holder"], why: "A change." });
    expect(problems(doc)).toEqual([]);
  });

  test("a historical opening kind is a valid thread name", () => {
    const doc = codeReview();
    doc.acts["release"]!["threads"] = ["claim", "room", "draft"];
    expect(problems(doc, { historicalOpeningKinds: ["draft"] })).toEqual([]);
  });

  test("the v1 validator is unchanged: a v2 document is not a valid v1 document", () => {
    expect(validatePolicy(codeReview()).ok).toBe(false);
    expect(validatePolicy(defaultPolicy()).ok).toBe(true);
  });
});

/** [guard id, what, make the document, pattern, context]. */
type Case = readonly [string, string, () => unknown, RegExp, PolicyV2Context?];
const at = (doc: Doc, kind: string): Any => doc.acts[kind] as Any;
const edit = (base: () => Doc, f: (d: Doc) => void) => () => {
  const d = base();
  f(d);
  return d;
};
const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { label: "K", targets: { none: ["comment"] }, who: { roles: [] } }]));

const cases: readonly Case[] = [
  ["doc-object", "a document that is not an object", () => [], /^policy: must be a JSON object/],
  ["doc-keys", "an unknown document field", edit(codeReview, (d) => (d["extra"] = 1)), /unknown field extra/],
  ["doc-format", "format v1 with acts", edit(codeReview, (d) => (d["format"] = "artroom-policy-v1")), /^format: must be artroom-policy-v2/],
  ["doc-profile", "an unknown profile", edit(codeReview, (d) => (d["profile"] = "artroom-jsonata-v9")), /^profile: /],
  ["doc-steps", "an unknown steps version", edit(codeReview, (d) => (d["steps"] = "artroom-steps-v9")), /^steps: must be a steps version/],
  ["acts-count", "65 kinds", () => v2(many(65)), /more than 64 kinds/],
  ["rule-on", "a rule on an undeclared kind", edit(codeReview, (d) => (d["rules"] as unknown[]).push({ id: "x", kind: "refuse", on: ["claimz"], refuse: "true", reason: "No.", fix: "No." })), /"claimz" is not an act kind/],
  ["kind-grammar", "a kind with a capital letter", edit(codeReview, (d) => (d.acts["Claim2"] = clone(d.acts["release"]!))), /acts\.Claim2: a kind must match/],
  ["kind-reserved", "a reserved kind", edit(codeReview, (d) => (d.acts["prepared"] = clone(d.acts["release"]!))), /prepared is reserved/],
  ["decl-keys", "an unknown declaration field", edit(codeReview, (d) => (at(d, "propose")["color"] = "red")), /acts\.propose: unknown field color/],
  ["label", "an empty label", edit(codeReview, (d) => (at(d, "propose")["label"] = "")), /acts\.propose\.label: must be 1 to 128/],
  ["help", "help over 4,096 bytes", edit(codeReview, (d) => (at(d, "propose")["help"] = "h".repeat(4097))), /acts\.propose\.help: must be a string/],
  ["targets-nonempty", "no targets", edit(codeReview, (d) => (at(d, "propose")["targets"] = {})), /must name at least one target shape/],
  ["target-shape", "an unknown target shape", edit(codeReview, (d) => (at(d, "propose")["targets"] = { everywhere: ["version"] })), /everywhere is not a target shape/],
  ["target-steps", "a step on the wrong target", edit(codeReview, (d) => (at(d, "propose")["targets"] = { thread: ["review"] })), /targets\.thread: must be one step that thread allows/],
  ["target-steps", "a third step", edit(codeReview, (d) => (at(d, "propose")["targets"] = { thread: ["version", "land", "release"] })), /targets\.thread: must be one step/],
  ["target-steps", "version then land on a version target", edit(codeReview, (d) => (at(d, "land")["targets"] = { version: ["version", "land"] })), /targets\.version: must be one step/],
  ["threads-required", "a thread act without threads", edit(codeReview, (d) => delete at(d, "propose")["threads"]), /propose\.threads: is required/],
  ["threads-unused", "threads on an act with no thread target", () => v2({ ...JAM_ACTS, signal: { ...JAM_ACTS.signal, threads: ["lead"] } }), /signal\.threads: is only for/],
  ["threads-list", "a repeated thread kind", edit(codeReview, (d) => (at(d, "propose")["threads"] = ["claim", "claim"])), /propose\.threads: must be 1 to 64 distinct/],
  ["threads-known", "a misspelt thread kind", edit(codeReview, (d) => (at(d, "propose")["threads"] = ["clam"])), /threads\[0\]: clam is not room/],
  ["threads-known", "a kind that never opened a thread here", edit(codeReview, (d) => (at(d, "release")["threads"] = ["claim", "draft"])), /draft is not room/],
  ["handover-reserve", "a hand-over onto a hold without reserveSeconds", edit(jam, (d) => delete at(d, "take-solo")["hold"]["reserveSeconds"]), /take-solo has no reserveSeconds/],
  ["body-count", "33 body fields", edit(codeReview, (d) => (at(d, "propose")["body"] = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`f${i}`, { type: "bool", optional: true }])))), /more than 32 fields/],
  ["field-name", "a field name with a capital first letter", edit(codeReview, (d) => (at(d, "propose")["body"]["Summary"] = { type: "bool" })), /body\.Summary: a field name must match/],
  ["field-reserved", "a field named like its step's field", edit(codeReview, (d) => (at(d, "propose")["body"]["lease"] = { type: "int", min: 0, max: 9 })), /body\.lease: lease is a field of this act's steps/],
  ["field-reserved", "a field named because", edit(codeReview, (d) => (at(d, "propose")["body"]["because"] = { type: "bool" })), /body\.because: because is a field/],
  ["field-type", "an unknown field type", edit(codeReview, (d) => (at(d, "propose")["body"]["x"] = { type: "blob" })), /body\.x: type must be text, int/],
  ["field-keys", "a parameter its type does not have", edit(codeReview, (d) => (at(d, "propose")["body"]["summary"]["min"] = 1)), /body\.summary: unknown field min/],
  ["text-max", "text over 16 KiB", edit(codeReview, (d) => (at(d, "propose")["body"]["summary"]["max"] = 16385)), /summary\.max: must be an integer from 1 to 16384/],
  ["globs-max", "globs over 64", edit(codeReview, (d) => (at(d, "propose")["body"]["paths"] = { type: "globs", max: 65 })), /paths\.max: must be an integer from 1 to 64/],
  ["int-range", "an int with min over max", edit(codeReview, (d) => (at(d, "propose")["body"]["n"] = { type: "int", min: 5, max: 1 })), /body\.n: min and max must be safe integers/],
  ["enum-values", "a repeated enum value", edit(codeReview, (d) => (at(d, "propose")["body"]["e"] = { type: "enum", values: ["a", "a"] })), /body\.e\.values: must be 1 to 64 distinct/],
  ["enum-values", "an enum value that cannot fill a scope", edit(codeReview, (d) => (at(d, "propose")["body"]["e"] = { type: "enum", values: ["A/b"] })), /body\.e\.values: must be 1 to 64 distinct/],
  ["optional-and-requiredfor", "both optional and requiredFor", edit(codeReview, (d) => (at(d, "claim")["body"]["goal"]["optional"] = true)), /body\.goal: may say optional or requiredFor, not both/],
  ["requiredfor-targets", "requiredFor naming a target the act lacks", edit(codeReview, (d) => (at(d, "claim")["body"]["goal"]["requiredFor"] = ["version"])), /goal\.requiredFor: must be a non-empty list/],
  ["who-keys", "an unknown who field", edit(codeReview, (d) => (at(d, "propose")["who"]["teams"] = ["@a"])), /propose\.who: unknown field teams/],
  ["roles-admin", "admin listed explicitly", edit(codeReview, (d) => (at(d, "propose")["who"]["roles"] = ["admin", "member"])), /who\.roles: must not list admin/],
  ["roles-known", "an unknown role", edit(codeReview, (d) => (at(d, "propose")["who"]["roles"] = ["owner"])), /who\.roles: "owner" is not a role/],
  ["roles-checker", "checker on an act with step version", edit(codeReview, (d) => (at(d, "propose")["who"]["roles"] = ["member", "checker"])), /may list checker only for an act whose steps are check or comment/],
  ["hold-required", "an opening act without a hold", edit(codeReview, (d) => delete at(d, "claim")["hold"]), /claim\.hold: is required/],
  ["hold-unused", "a hold on an act without step open", edit(codeReview, (d) => (at(d, "propose")["hold"] = { scope: "body.scope" })), /propose\.hold: is only for an act with step open/],
  ["hold-keys", "an unknown hold field", edit(codeReview, (d) => (at(d, "claim")["hold"]["owner"] = "@a")), /claim\.hold: unknown field owner/],
  ["hold-conflict", "an unknown conflict mode", edit(codeReview, (d) => (at(d, "claim")["hold"]["conflict"] = "shared")), /hold\.conflict: must be exclusive or by-scope/],
  ["hold-lease", "a lease under 10 seconds", edit(codeReview, (d) => (at(d, "claim")["hold"]["leaseSeconds"] = 9)), /hold\.leaseSeconds: must be an integer from 10 to 86400/],
  ["hold-lease", "a lease over 24 hours", edit(codeReview, (d) => (at(d, "claim")["hold"]["leaseSeconds"] = 86401)), /hold\.leaseSeconds/],
  ["hold-reserve", "a reservation over 10 minutes", edit(jam, (d) => (at(d, "take-solo")["hold"]["reserveSeconds"] = 601)), /hold\.reserveSeconds: must be an integer from 1 to 600/],
  ["hold-reserve", "a reservation of 0 seconds", edit(jam, (d) => (at(d, "take-solo")["hold"]["reserveSeconds"] = 0)), /hold\.reserveSeconds/],
  ["hold-scope", "a scope source naming another body field", edit(codeReview, (d) => (at(d, "claim")["hold"]["scope"] = "body.goal")), /claim\.hold\.scope: must be body\.scope/],
  ["template-chars", "a template glob over 256 characters", edit(jam, (d) => (at(d, "lead")["hold"]["scope"] = [`${"a/".repeat(128)}x`])), /lead\.hold\.scope\[0\]: must be a glob of at most 256/],
  ["slot-field", "a slot naming a text field", edit(jam, (d) => (at(d, "take-part")["hold"]["scope"] = ["parts/{name}/**"], at(d, "take-part")["body"]["name"] = { type: "text", max: 20 })), /\{name\} must name a segment or enum field/],
  ["slot-field", "a slot naming an optional field", edit(jam, (d) => (at(d, "take-part")["body"]["part"]["optional"] = true)), /\{part\} must name a segment or enum field of this act that is required on target none/],
  ["template-glob", "a template that is not a glob once filled", edit(jam, (d) => (at(d, "take-part")["hold"]["scope"] = ["parts/{part}/[ab]"])), /is not a valid glob once its slots are filled/],
  ["refusal-code", "wording for an unknown refusal code", edit(jam, (d) => (at(d, "lead")["refusals"] = { "no-such": { reason: "R.", fix: "F." } })), /no-such is not a platform refusal code/],
  ["refusal-keys", "wording with an unknown field", edit(jam, (d) => (at(d, "lead")["refusals"] = { "lane-held": { reason: "R.", fix: "F.", help: "H." } })), /refusals\.lane-held: unknown field help/],
  ["wording-length", "a fix over 512 bytes", edit(jam, (d) => (at(d, "lead")["refusals"] = { "lane-held": { reason: "R.", fix: "f".repeat(513) } })), /lane-held\.fix: must be 1 to 512 bytes/],
  ["wording-slot", "a slot that is not a refusal slot", edit(jam, (d) => (at(d, "lead")["refusals"] = { "lane-held": { reason: "{goal} is busy.", fix: "F." } })), /\{goal\} is not a refusal slot/],
  ["wording-brace", "a brace that opens no slot", edit(jam, (d) => (at(d, "lead")["refusals"] = { "lane-held": { reason: "Busy } now.", fix: "F." } })), /a brace must open a slot/],
  ["sound-version", "reviews with no act that makes versions", edit(codeReview, (d) => delete d.acts["propose"]), /review: acts on versions, but no declared act with step version/],
  ["sound-handover", "a hand-over with no act that can take the thread", edit(jam, (d) => (at(d, "take-solo")["targets"] = { none: ["open"] }, delete at(d, "take-solo")["threads"])), /pass-solo: hands take-solo threads over, but no declared act with step take/],
  ["checker-shape", "a v1 checker configuration in a v2 document", codeReview, /checkers\.ci: format: must be artroom-checker-v2/, { checkers: { ci: { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 } } }],
  ["checker-act", "a checker configuration with no act", jam, /checkers\.in-key: act: must name the declared kind/, { checkers: { "in-key": { ...IN_KEY, act: undefined } } }],
  ["checker-declared", "a checker naming an undeclared kind", codeReview, /checkers\.ci\.act: lint is not declared/, { checkers: { ci: { ...CI, act: "lint" } } }],
  ["checker-step", "a checker naming signal", jam, /checkers\.in-key\.act: signal must run only the step check/, { checkers: { "in-key": { ...IN_KEY, act: "signal" } } }],
  ["checker-role", "a check act checkers may not sign", edit(jam, (d) => (at(d, "in-key-check")["who"]["roles"] = ["member"])), /in-key-check must list checker in who\.roles/, { checkers: { "in-key": IN_KEY } }],
  ["checker-body", "a check act with a required body field", edit(jam, (d) => (at(d, "in-key-check")["body"] = { key: { type: "enum", values: ["c", "g"] } })), /in-key-check requires body field key/, { checkers: { "in-key": IN_KEY } }],
];

/** A value of the wrong type at each place a document has an object, a list or a flag: [where, edit]. */
const wrongTypes: readonly (readonly [string, () => unknown, PolicyV2Context?])[] = [
  ["acts", edit(codeReview, (d) => (d["acts"] = [] as never))],
  ["a declaration", edit(codeReview, (d) => (d.acts["x"] = "act" as never))],
  ["targets", edit(codeReview, (d) => (at(d, "propose")["targets"] = "thread"))],
  ["threads", edit(codeReview, (d) => (at(d, "propose")["threads"] = "claim"))],
  ["body", edit(codeReview, (d) => (at(d, "propose")["body"] = []))],
  ["a field", edit(codeReview, (d) => (at(d, "propose")["body"]["x"] = 3))],
  ["optional", edit(codeReview, (d) => (at(d, "propose")["body"]["summary"]["optional"] = "yes"))],
  ["who", edit(codeReview, (d) => delete at(d, "propose")["who"])],
  ["who.roles", edit(codeReview, (d) => (at(d, "propose")["who"]["roles"] = "member"))],
  ["who.delegable", edit(codeReview, (d) => (at(d, "propose")["who"]["delegable"] = "no"))],
  ["hold", edit(codeReview, (d) => (at(d, "claim")["hold"] = "body.scope"))],
  ["hold.scope", edit(jam, (d) => (at(d, "lead")["hold"]["scope"] = []))],
  ["hold.workspace", edit(codeReview, (d) => (at(d, "claim")["hold"]["workspace"] = "yes"))],
  ["refusals", edit(jam, (d) => (at(d, "lead")["refusals"] = []))],
  ["a refusal's wording", edit(jam, (d) => (at(d, "lead")["refusals"] = { "lane-held": "Busy." }))],
  ["a checker configuration", codeReview, { checkers: { ci: "check" } }],
];

describe("refused documents (R-DECL-24, R-DECL-26)", () => {
  test("each rule and bound of section 33 refuses its document with policy-invalid, and names the place", () => {
    for (const [id, what, make, pattern, ctx] of cases) {
      const v = validatePolicyV2(make(), ctx);
      const row = `G:${id}, ${what}`;
      expect(v.ok, row).toBe(false);
      if (v.ok) continue;
      expect(v.refusal.rule, row).toBe("policy-invalid");
      expect(v.problems.some((p) => pattern.test(p)), `${row}: no problem matches ${pattern}: ${v.problems.join(" | ")}`).toBe(true);
    }
  });

  test("a value of the wrong type anywhere in a document is refused, never thrown on", () => {
    for (const [where, make, ctx] of wrongTypes) {
      const v = validatePolicyV2(make(), ctx);
      expect(v.ok, where).toBe(false);
      if (!v.ok) expect(v.refusal.rule, where).toBe("policy-invalid");
    }
  });
});

describe("checker configurations (R-DECL-18)", () => {
  test("a v2 configuration names its act; a v1 format, an unknown field and a value that is not an object are refused", () => {
    expect(validateCheckerConfigV2(IN_KEY).ok).toBe(true);
    const problems = (config: unknown) => {
      const v = validateCheckerConfigV2(config);
      return v.ok ? [] : v.problems;
    };
    expect(problems({ ...CI, format: "artroom-checker-v1" })).toContain("format: must be artroom-checker-v2");
    expect(problems({ ...CI, acts: ["check"] })).toContain("checker: unknown field acts");
    expect(validateCheckerConfigV2("check").ok).toBe(false);
  });
});

describe("the binding identity (R-DECL-15)", () => {
  const doc = () => codeReview() as unknown as PolicyDocumentV2;
  const changed = (f: (d: Loose) => void, kind = "claim") => {
    const d = codeReview();
    f(d);
    return bindingOf(d as unknown as PolicyDocumentV2, kind);
  };

  test("the subject resolves every default", () => {
    expect(bindingSubject(doc(), "claim")).toEqual({
      steps: "artroom-steps-v1",
      kind: "claim",
      targets: { none: ["open"], thread: ["take"] },
      threads: ["claim", "room"],
      body: { goal: { type: "text", max: 1024, required: ["none"] }, plan: { type: "text", max: 16384, required: [] } },
      hold: { scope: "body.scope", conflict: "by-scope", leaseSeconds: "room", reserveSeconds: null, workspace: true },
    });
    expect(bindingSubject(doc(), "check")).toEqual({ steps: "artroom-steps-v1", kind: "check", targets: { version: ["check"] }, threads: ["claim", "room"], body: {}, hold: null });
  });

  test("label, help, refusal wording and who leave the binding unchanged", async () => {
    const base = await bindingOf(doc(), "claim");
    expect(await changed((d) => (d.acts.claim.label = "Take"))).toBe(base);
    expect(await changed((d) => (d.acts.claim.help = "Claim a scope."))).toBe(base);
    expect(await changed((d) => (d.acts.claim.refusals = { "lane-held": { reason: "{holder} has it.", fix: "Wait." } }))).toBe(base);
    expect(await changed((d) => (d.acts.claim.who = { roles: ["member"], delegable: false }))).toBe(base);
  });

  test("writing a default out leaves the binding unchanged", async () => {
    const base = await bindingOf(doc(), "claim");
    expect(await changed((d) => (d.acts.claim.hold.conflict = "by-scope"))).toBe(base);
    expect(await changed((d) => (d.acts.claim.body.plan.optional = true, d.acts.claim.body.goal.requiredFor = ["none"]))).toBe(base);
    const land = await bindingOf(doc(), "release");
    expect(await changed((d) => (d.acts.release.threads = ["claim", "room"]), "release")).toBe(land);
    const note = await bindingOf(doc(), "note");
    expect(await changed((d) => (d.acts.note.body.text.requiredFor = ["entry", "line"]), "note")).toBe(note);
    const solo = jam() as unknown as PolicyDocumentV2;
    const written = jam() as Loose;
    written.acts["take-solo"].hold.workspace = false;
    expect(await bindingOf(written, "take-solo")).toBe(await bindingOf(solo, "take-solo"));
    expect(bindingSubject(solo, "take-solo").hold).toEqual({ scope: ["solo/**"], conflict: "exclusive", leaseSeconds: 64, reserveSeconds: 8, workspace: false });
  });

  test("a step list, body field, scope source, hold setting, threads, kind or steps version changes it", async () => {
    const base = await bindingOf(doc(), "claim");
    const variants = await Promise.all([
      changed((d) => (d.acts.claim.targets = { none: ["open"] })),
      changed((d) => (d.acts.claim.body.goal.max = 2048)),
      changed((d) => (d.acts.claim.body.plan.optional = false)),
      changed((d) => (d.acts.claim.body.extra = { type: "bool", optional: true })),
      changed((d) => (d.acts.claim.hold.scope = ["src/**"])),
      changed((d) => (d.acts.claim.hold.leaseSeconds = 600)),
      changed((d) => (d.acts.claim.hold.reserveSeconds = 8)),
      changed((d) => (d.acts.claim.hold.conflict = "exclusive")),
      changed((d) => (d.acts.claim.hold.workspace = false)),
      changed((d) => (d.acts.claim.threads = ["claim"])),
      changed((d) => (d["lanes"] = "exclusive")),
      changed((d) => (d["steps"] = "artroom-steps-v2")),
      changed((d) => (d.acts.take = d.acts.claim), "take"),
    ]);
    for (const [i, b] of variants.entries()) expect(b, `variant ${i}`).not.toBe(base);
    // An explicit `exclusive` and `exclusive` from the policy's lanes resolve alike, as they should.
    expect(variants[7]).toBe(variants[10]);
  });

  test("a hold that sets its conflict mode does not follow the policy's lanes", async () => {
    const base = await changed((d) => (d.acts.claim.hold.conflict = "exclusive"));
    expect(await changed((d) => ((d.acts.claim.hold.conflict = "exclusive"), (d["lanes"] = "exclusive")))).toBe(base);
  });

  test("a change to one kind leaves every other kind's binding unchanged", async () => {
    const before = await bindingOf(doc(), "propose");
    expect(await changed((d) => (d.acts.claim.hold.leaseSeconds = 600), "propose")).toBe(before);
  });

  test("the binding is sha256 of the subject's canonical JSON", async () => {
    expect(await bindingOf(doc(), "land")).toBe(await digestJson(bindingSubject(doc(), "land") as never));
    expect(await bindingOf(doc(), "land")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("built-in data (R-DECL-1, section 33.7)", () => {
  test("the legacy vocabulary's digest is the one the contract states", async () => {
    expect(await digestJson(ARTROOM_LEGACY_V1 as never)).toBe(ARTROOM_LEGACY_V1_DIGEST);
    expect(ARTROOM_LEGACY_V1_DIGEST).toBe("sha256:ea4361a697d1c7e1bf7ecdfe6576b81ecbad48aee78b857e0a7958dfa14b3937");
  });

  test("the legacy vocabulary is frozen, to the leaves", () => {
    const goal = ARTROOM_LEGACY_V1.acts.claim[0]!.body.goal;
    expect(Object.isFrozen(ARTROOM_LEGACY_V1)).toBe(true);
    expect(Object.isFrozen(goal)).toBe(true);
    expect(() => ((goal as { max: number }).max = 2048)).toThrow(TypeError);
  });

  test("the code-review declarations are frozen, to the leaves", () => {
    const goal = CODE_REVIEW_ACTS["claim"]!.body!["goal"]!;
    expect(Object.isFrozen(CODE_REVIEW_ACTS)).toBe(true);
    expect(Object.isFrozen(goal)).toBe(true);
    expect(() => ((goal as { max: number }).max = 2048)).toThrow(TypeError);
  });
});

describe("names and sizes the evaluator's value profile limits (R-DECL-2, R-DECL-12, R-DECL-26)", () => {
  test("a kind or a body field named constructor or prototype is refused: the value profile reserves those key names", () => {
    for (const name of ["constructor", "prototype"]) {
      refused(edit(codeReview, (d) => (d.acts[name] = clone(d.acts["release"]!)))(), new RegExp(`^acts\\.${name}: ${name} is a key name the evaluator's value profile reserves`));
      refused(edit(codeReview, (d) => (at(d, "propose")["body"][name] = { type: "bool", optional: true }))(), new RegExp(`body\\.${name}: ${name} is a key name the evaluator's value profile reserves`));
    }
  });

  test("every other name of an object's prototype is a valid kind or field, and its binding can be computed", async () => {
    const d = codeReview();
    for (const name of ["toString", "valueOf", "hasOwnProperty", "isPrototypeOf"]) at(d, "propose")["body"][name] = { type: "bool", optional: true };
    d.acts["valueof"] = clone(d.acts["release"]!);
    expect(problems(d)).toEqual([]);
    expect(await bindingOf(d as unknown as PolicyDocumentV2, "propose")).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await bindingOf(d as unknown as PolicyDocumentV2, "valueof")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  const BOUND = 1048576;
  const TOO_LARGE = ["policy: the document's canonical JSON must be at most 1048576 bytes"];
  const bytes = (d: unknown) => new TextEncoder().encode(canonicalize(d as never)).length;
  /** The code-review document with one more rule, whose description brings the canonical form to `size` bytes. */
  const sized = (size: number, base: Doc = codeReview()) => {
    const rule: Any = { id: "describe", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A change.", description: "" };
    (base["rules"] as Any[]).push(rule);
    rule["description"] = "x".repeat(size - new TextEncoder().encode(JSON.stringify(base)).length);
    return base;
  };

  test("a document of exactly 1,048,576 canonical bytes validates, and one byte more is refused", () => {
    const exact = sized(BOUND);
    // The size the validator counts is the size of the canonical form.
    expect(bytes(exact)).toBe(BOUND);
    expect(problems(exact)).toEqual([]);
    expect(problems(sized(BOUND + 1))).toEqual(TOO_LARGE);
  });

  // An owner path or a dependency glob may be any legal glob, `constructor` and `prototype` included. The evaluator's
  // canonical writer refuses those as keys, so the document's size is not counted with it (checker finding 23766004).
  test("an owner path or a dependency glob named constructor or prototype is legal, and does not hide a document over the bound", () => {
    const keyed: readonly (readonly [string, (d: Doc, name: string) => void])[] = [
      ["an owner path", (d, name) => (d["owners"] = { [name]: ["role:admin"] })],
      ["a dependency glob", (d, name) => ((d["carry"] as Any)["dependsOn"] = { [name]: ["src/**"] })],
    ];
    for (const name of ["constructor", "prototype"])
      for (const [what, put] of keyed) {
        const made = () => {
          const d = codeReview();
          put(d, name);
          return d;
        };
        expect(problems(made()), `${what} named ${name}`).toEqual([]);
        // Only the size refuses the larger document: the same document on the bound is valid.
        expect(problems(sized(BOUND, made())), `${what} named ${name}, on the bound`).toEqual([]);
        expect(problems(sized(BOUND + 1, made())), `${what} named ${name}, over the bound`).toEqual(TOO_LARGE);
      }
  });

  test("a document that has no JSON form is refused, not thrown on", () => {
    const d = codeReview();
    (d["rules"] as Any[]).push({ id: "describe", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A change.", description: 10n });
    expect(problems(d)).toContain("policy: must be plain JSON");
  });
});
