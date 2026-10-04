/**
 * The vocabulary a workerd test file tests the Room against (docs/protocol.md
 * section 33.6, request fd6f00b6 condition 3).
 *
 * - A test file runs as it is written: every room's document is `v1`, so the
 *   legacy vocabulary. Nothing here changes anything in it.
 * - declared-run.test.ts calls `runDeclared` and then loads a few of the
 *   same test files again. In that file every room's document is the test's
 *   document as `v2` with `CODE_REVIEW_ACTS` (the run's premise,
 *   `documents`), and the harness applies the four fixture-format
 *   conversions of section 33.6, and no others:
 *   1. `bindings`: envelopes of declared kinds are `v: 2` with the active
 *      declaration's binding (R-DECL-16);
 *   2. `recover`: a configuration-recovery `claim`, and every act on a
 *      thread it opened, become `recover` ops (R-DECL-21);
 *   3. `checker-v2`: checker configurations are `artroom-checker-v2` and
 *      name `"act": "check"` (R-DECL-18); a check names the converted
 *      configuration's digest;
 *   4. `grant-maps`: `delegate` ops and room-custody sessions carry signed
 *      maps from kind to binding instead of kind lists or `*` (R-DECL-17).
 *   `applied` counts the tests each conversion was applied in.
 *
 * The switch is module state. Each test file has its own instance of every
 * module it loads, so it is on in declared-run.test.ts and nowhere else.
 */

import { runInDurableObject } from "cloudflare:test";
import { expect } from "vitest";
import type { PolicyDocument, Role, RoomId } from "@generalbusiness/artroom-contract";
import { codeReviewPolicy, defaultPolicy, delegableBy, isPlatformKind, CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";

/** True in the declared run: in declared-run.test.ts, after `runDeclared`. */
export let DECLARED = false;

/** Start the declared run in this test file. Call it before the witness files are loaded. */
export function runDeclared(): void {
  DECLARED = true;
}

export type Conversion = "documents" | "bindings" | "recover" | "checker-v2" | "grant-maps";

/** How many tests each conversion was applied in, so far in this test file. */
export const applied: Record<Conversion, number> = { documents: 0, bindings: 0, recover: 0, "checker-v2": 0, "grant-maps": 0 };

const logged = new Set<string>();

/** Record that a conversion was applied in the current test. */
export function converted(c: Conversion): void {
  const test = expect.getState().currentTestName ?? "(outside a test)";
  const key = `${c}\u0000${test}`;
  if (logged.has(key)) return;
  logged.add(key);
  applied[c]++;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A policy document in the file's vocabulary: as written; as `v2` with the code-review declarations in the declared run. */
export function inVocabulary<D extends PolicyDocument>(doc: D): D {
  if (!DECLARED || !isObj(doc) || doc.format !== "artroom-policy-v1") return doc;
  converted("documents");
  return codeReviewPolicy(doc) as unknown as D;
}

/** The default policy, as a room with no policy file uses it, in the run's vocabulary. */
export function defaultDocument(): PolicyDocument {
  return inVocabulary(defaultPolicy());
}

/** Configuration digests the harness converted: the `v1` configuration's to the `v2` one's. */
const configDigests = new Map<string, string>();

/** Conversion 3: a checker configuration as `artroom-checker-v2` naming its act, in the declared run. */
export function checkerInVocabulary<C>(cfg: C): C {
  if (!DECLARED || !isObj(cfg) || cfg["format"] !== "artroom-checker-v1") return cfg;
  converted("checker-v2");
  const v2 = { ...cfg, format: "artroom-checker-v2", act: "check" };
  configDigests.set(digestJson(cfg), digestJson(v2));
  return v2 as C;
}

/** The digest a check names for a configuration the test wrote: the converted one's, in the declared run. */
export function configDigest(digest: string): string {
  const v2 = configDigests.get(digest);
  if (v2 === undefined) return digest;
  converted("checker-v2");
  return v2;
}

/** Files committed to a repository, with `.artroom/` documents and checker configurations in the run's vocabulary. */
export function filesInVocabulary<F extends Record<string, string | null>>(files: F): F {
  if (!DECLARED) return files;
  const out: Record<string, string | null> = { ...files };
  for (const [path, text] of Object.entries(files)) {
    if (text === null || !(path === ".artroom/policy.json" || (path.startsWith(".artroom/checkers/") && path.endsWith(".json")))) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const next = path === ".artroom/policy.json" ? inVocabulary(parsed as PolicyDocument) : checkerInVocabulary(parsed);
    // The converted document, with the text's own trailing whitespace: a test may change a file by that alone.
    if (next !== parsed) out[path] = JSON.stringify(next) + text.slice(text.trimEnd().length);
  }
  return out as F;
}

// ------------------------------------------------------------ the room as the harness knows it

interface Known {
  /** The active declarations' bindings, read from the room. */
  bindings: Record<string, string>;
  /** Each key's member role, and each member's. */
  keyRoles: Map<string, Role>;
  memberRoles: Map<string, Role>;
  /** Threads a converted configuration-recovery claim opened, and the acts on them: an entry target names one of these. */
  readonly recovery: Set<string>;
}

const known = new Map<RoomId, Known>();

function knownOf(room: RoomId): Known {
  let k = known.get(room);
  if (!k) {
    k = { bindings: {}, keyRoles: new Map(), memberRoles: new Map(), recovery: new Set() };
    known.set(room, k);
  }
  return k;
}

/** Read the room's active bindings and roles, before an act is signed. Declared run only; otherwise it does nothing. */
export async function refresh(room: RoomId, stub: DurableObjectStub<Room>): Promise<void> {
  if (!DECLARED) return;
  const read = await runInDurableObject(stub, (r: Room) => {
    if (!r.core.founded) return null;
    const bindings: Record<string, string> = {};
    for (const kind of Object.keys(CODE_REVIEW_ACTS)) {
      const b = r.core.declaredBinding(kind);
      if (b !== null) bindings[kind] = b;
    }
    const roles = r.core.sql.all("SELECT k.key AS key, m.handle AS handle, m.role AS role FROM keys k JOIN members m ON m.handle = k.member");
    return { bindings, roles: roles.map((x) => [String(x["key"]), String(x["handle"]), String(x["role"]) as Role] as const) };
  });
  if (!read) return;
  const k = knownOf(room);
  k.bindings = read.bindings;
  k.keyRoles = new Map(read.roles.map(([key, , role]) => [key, role]));
  k.memberRoles = new Map(read.roles.map(([, handle, role]) => [handle, role]));
}

/** After a `recover` op is admitted: its thread, and the act itself, take `recover` ops from now on. */
export function noteRecovery(room: RoomId, record: { readonly id: string; readonly lane?: string }): void {
  const k = knownOf(room);
  k.recovery.add(record.id);
  if (record.lane !== undefined) k.recovery.add(record.lane);
}

/**
 * The kinds a delegation covers, as a test reads them: its `kinds`, and in
 * the declared run its signed map's kinds first (conversion 4), which is the
 * legacy expansion's order.
 */
export function coveredKinds(d: { readonly kinds: readonly string[] | "*"; readonly acts?: Readonly<Record<string, string>> }): readonly string[] | "*" {
  if (!DECLARED || d.kinds === "*") return d.kinds;
  converted("grant-maps");
  return [...Object.keys(d.acts ?? {}), ...d.kinds];
}

/** The step each legacy act runs on a configuration-recovery thread, as a `recover` op (R-DECL-21). */
const RECOVER_OP: Readonly<Record<string, string>> = { claim: "take", propose: "version", review: "approve", land: "land", release: "release", note: "note" };

/** Conversion 4: a grant's kind list or `*` as platform kinds and a signed map, expanded for the grantor's role. */
function grantMap(k: Known, kinds: unknown, role: Role | undefined): { kinds: string[]; acts: Record<string, string> } {
  const doc = codeReviewPolicy(defaultPolicy());
  const all = role ? delegableBy(doc, role) : { platform: [], declared: [] };
  const list = kinds === "*" ? [...all.platform, ...all.declared] : Array.isArray(kinds) ? (kinds as string[]) : [];
  const acts: Record<string, string> = {};
  for (const kind of list) if (!isPlatformKind(kind)) acts[kind] = k.bindings[kind] ?? `sha256:${"0".repeat(64)}`;
  return { kinds: list.filter((kind) => isPlatformKind(kind)), acts };
}

/**
 * An act as the file signs it: as the test wrote it, or, in the declared
 * run, with conversions 2, 4 and 3 (a check's configuration digest), then 1
 * (the binding) applied.
 */
export function actInVocabulary(
  room: RoomId,
  actor: string,
  kind: string,
  target: unknown,
  body: unknown,
): { v: 1 | 2; kind: string; target: unknown; body: unknown; binding?: string; recoveryOpen: boolean } {
  if (!DECLARED) return { v: 1, kind, target, body, recoveryOpen: false };
  const k = knownOf(room);
  let recoveryOpen = false;
  const lane = isObj(target) && typeof target["lane"] === "string" ? target["lane"] : isObj(target) && typeof target["act"] === "string" ? target["act"] : null;
  if (kind === "claim" && target === null && isObj(body) && body["purpose"] === "config-recovery") {
    converted("recover");
    const { purpose: _p, ...rest } = body;
    void _p;
    kind = "recover";
    body = { op: "open", ...rest };
    recoveryOpen = true;
  } else if (lane !== null && k.recovery.has(lane) && Object.hasOwn(RECOVER_OP, kind) && isObj(body)) {
    converted("recover");
    body = { op: RECOVER_OP[kind], ...body };
    kind = "recover";
  }
  if (kind === "roster" && isObj(body) && body["op"] === "delegate") {
    converted("grant-maps");
    const { kinds, ...rest } = body;
    const g = grantMap(k, kinds, k.keyRoles.get(actor));
    body = { ...rest, kinds: g.kinds, acts: g.acts };
  }
  if (kind === "roster" && isObj(body) && body["op"] === "invite" && isObj(body["session"])) {
    converted("grant-maps");
    const { kinds, ...rest } = body["session"];
    const role = (typeof body["role"] === "string" ? body["role"] : k.memberRoles.get(String(body["member"]))) as Role | undefined;
    const g = grantMap(k, kinds, role);
    body = { ...body, session: { ...rest, kinds: g.kinds, acts: g.acts } };
  }
  if (kind === "check" && isObj(body) && typeof body["config"] === "string") body = { ...body, config: configDigest(body["config"]) };
  const binding = k.bindings[kind];
  if (!isPlatformKind(kind) && binding !== undefined) {
    converted("bindings");
    return { v: 2, kind, target, body, binding, recoveryOpen };
  }
  return { v: 1, kind, target, body, recoveryOpen };
}
