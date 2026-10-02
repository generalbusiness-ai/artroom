/**
 * Shape checks for everything a caller sends.
 *
 * - The envelope and its target are checked at admission step 1: an unknown
 *   field or a wrong type is `ArtroomError` `bad-request` (R-SIG-4).
 * - The body is checked at step 5: `invalid-body`, `body-too-large`
 *   (R-SIG-6) or `glob-invalid` (R-PATH-1), none of them recorded.
 *
 * Body checks also return the paths of fixed-format fields, which skip the
 * entropy check of the secret scan (R-SEC-4).
 */

import type { EnvelopeKind, PlatformRule } from "@generalbusiness/artroom-contract";
import { RE } from "./ids.ts";
import { globProblem, pathProblem } from "./glob.ts";

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

export const LIMITS = {
  envelope: 64 * 1024,
  goal: 1024,
  long: 16 * 1024,
  medium: 8 * 1024,
  patterns: 64,
  patternChars: 256,
  reasons: 64,
} as const;

export const KINDS: readonly EnvelopeKind[] = ["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"];
export const DELEGABLE = ["claim", "propose", "note", "review", "check", "land", "release", "renew"] as const;
export const ROLES = ["admin", "maintainer", "member", "agent", "checker"] as const;

/** A shape failure: the rule to refuse with and one plain sentence. */
export class ShapeError extends Error {
  constructor(
    readonly rule: Extract<PlatformRule, "invalid-body" | "body-too-large" | "glob-invalid"> | "bad-request" | "payload-too-large",
    reason: string,
  ) {
    super(reason);
    this.name = "ShapeError";
  }
}

type Obj = Record<string, unknown>;

export function isPlainObject(v: unknown): v is Obj {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

class Checker {
  readonly fixed = new Set<string>();
  constructor(readonly fail: ShapeError["rule"]) {}

  error(path: string, what: string, rule: ShapeError["rule"] = this.fail): never {
    throw new ShapeError(rule, `${path} ${what}.`);
  }

  object<R extends string, O extends string = never>(
    v: unknown,
    path: string,
    required: readonly R[],
    optional: readonly O[] = [],
  ): { readonly [k in R]: unknown } & { readonly [k in O]?: unknown } {
    if (!isPlainObject(v)) this.error(path, "must be an object");
    for (const k of Object.keys(v)) {
      if (!(required as readonly string[]).includes(k) && !(optional as readonly string[]).includes(k)) this.error(`${path}.${k}`, "is not a field of this type");
      if (v[k] === undefined) this.error(`${path}.${k}`, "is undefined; omit absent fields");
    }
    for (const k of required) if (!(k in v)) this.error(`${path}.${k}`, "is required");
    return v as { readonly [k in R]: unknown } & { readonly [k in O]?: unknown };
  }

  string(v: unknown, path: string, max?: number): string {
    if (typeof v !== "string") this.error(path, "must be a string");
    if (max !== undefined && bytes(v) > max) this.error(path, `is longer than ${max} bytes`, "body-too-large");
    return v;
  }

  format(v: unknown, path: string, re: RegExp, what: string): string {
    if (typeof v !== "string" || !re.test(v)) this.error(path, `must be ${what}`);
    this.fixed.add(path);
    return v;
  }

  int(v: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) this.error(path, `must be an integer from ${min} to ${max}`);
    return v;
  }

  bool(v: unknown, path: string): boolean {
    if (typeof v !== "boolean") this.error(path, "must be true or false");
    return v;
  }

  oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T {
    if (typeof v !== "string" || !values.includes(v as T)) this.error(path, `must be one of ${values.join(", ")}`);
    return v as T;
  }

  array(v: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(v)) this.error(path, "must be an array");
    if (v.length > max) this.error(path, `has more than ${max} items`, "body-too-large");
    return v;
  }

  globs(v: unknown, path: string, minItems = 0): void {
    const list = this.array(v, path, LIMITS.patterns);
    if (list.length < minItems) this.error(path, `needs at least ${minItems} pattern`);
    list.forEach((g, i) => {
      const p = `${path}[${i}]`;
      if (typeof g !== "string") this.error(p, "must be a string");
      if (g.length > LIMITS.patternChars) this.error(p, `is longer than ${LIMITS.patternChars} characters`, "body-too-large");
      const problem = globProblem(g);
      if (problem) this.error(p, `is not a valid pattern: ${problem}`, "glob-invalid");
    });
  }

  reasons(v: unknown, path: string): void {
    const list = this.array(v, path, LIMITS.reasons);
    list.forEach((r, i) => {
      const p = `${path}[${i}]`;
      if (!isPlainObject(r)) this.error(p, "must be an object");
      if ("act" in r) this.format(this.object(r, p, ["act"]).act, `${p}.act`, RE.actId, "an entry ID");
      else if ("commit" in r) this.format(this.object(r, p, ["commit"]).commit, `${p}.commit`, RE.sha, "a git object name");
      else if ("url" in r) {
        const u = this.string(this.object(r, p, ["url"]).url, `${p}.url`, 2048);
        if (!RE.https.test(u)) this.error(`${p}.url`, "must be an https URL");
      } else this.error(p, "must name an act, a commit or a URL");
    });
  }
}

// ------------------------------------------------------------ envelopes (step 1)

/** Check a signed envelope's outer shape. Throws `ShapeError` with `bad-request` or `payload-too-large`. */
export function checkSignedEnvelope(v: unknown): void {
  const c = new Checker("bad-request");
  const signed = c.object(v, "act", ["envelope", "sig"]);
  c.format(signed.sig, "act.sig", RE.sig, "an Ed25519 signature in base64url");
  const e = c.object(signed.envelope, "envelope", ["v", "room", "actor", "kind", "target", "body", "idempotencyKey"], ["delegation"]);
  if (e.v !== 1) c.error("envelope.v", "must be 1");
  c.format(e.room, "envelope.room", RE.roomId, "a room ID");
  c.format(e.actor, "envelope.actor", RE.keyId, "a key ID");
  const kind = c.oneOf(e.kind, "envelope.kind", KINDS);
  c.format(e.idempotencyKey, "envelope.idempotencyKey", RE.idempotencyKey, "1 to 64 characters from A-Z, a-z, 0-9, _ and -");
  if (e.delegation !== undefined) c.format(e.delegation, "envelope.delegation", RE.actId, "an entry ID");
  checkTarget(c, kind, e.target, e.body);
}

function laneTarget(c: Checker, t: unknown, path: string): void {
  c.format(c.object(t, path, ["lane"]).lane, `${path}.lane`, RE.actId, "a lane ID");
}

function proposalTarget(c: Checker, t: unknown, path: string): void {
  const o = c.object(t, path, ["lane", "generation"]);
  c.format(o.lane, `${path}.lane`, RE.actId, "a lane ID");
  c.int(o.generation, `${path}.generation`, 1);
}

function checkTarget(c: Checker, kind: EnvelopeKind, t: unknown, body: unknown): void {
  const path = "envelope.target";
  switch (kind) {
    case "claim":
      if (t !== null) laneTarget(c, t, path);
      return;
    case "roster":
      if (t !== null) c.error(path, "must be null for roster acts");
      return;
    case "propose":
    case "release":
    case "renew":
      laneTarget(c, t, path);
      return;
    case "review":
    case "check":
    case "land":
      proposalTarget(c, t, path);
      return;
    case "note": {
      if (isPlainObject(t) && "act" in t) {
        c.format(c.object(t, path, ["act"]).act, `${path}.act`, RE.actId, "an entry ID");
        return;
      }
      const o = c.object(t, path, ["lane", "generation", "head", "path", "line"], ["endLine"]);
      c.format(o.lane, `${path}.lane`, RE.actId, "a lane ID");
      c.int(o.generation, `${path}.generation`, 1);
      c.format(o.head, `${path}.head`, RE.sha, "a git object name");
      const p = c.string(o.path, `${path}.path`, 4096);
      if (pathProblem(p)) c.error(`${path}.path`, "must be a repository path");
      const line = c.int(o.line, `${path}.line`, 1);
      if (o.endLine !== undefined) c.int(o.endLine, `${path}.endLine`, line);
      return;
    }
  }
  void body;
}

/** Canonical size of the whole envelope (R-SIG-6, R-ADM-1 step 1). */
export function checkEnvelopeSize(canonicalLength: number): void {
  if (canonicalLength > LIMITS.envelope) throw new ShapeError("payload-too-large", `The signed envelope is ${canonicalLength} bytes; the limit is ${LIMITS.envelope}.`);
}

// ------------------------------------------------------------ bodies (step 5)

export interface BodyCheck {
  /** Paths of fixed-format fields: the entropy check skips them (R-SEC-4). */
  readonly fixed: ReadonlySet<string>;
  /** Paths not scanned at all: a `join` act's `secret` (R-SEC-4). */
  readonly exempt: ReadonlySet<string>;
}

/** Check a body against its kind and target. Throws `ShapeError` (`invalid-body`, `body-too-large`, `glob-invalid`). */
export function checkBody(kind: EnvelopeKind, target: unknown, body: unknown): BodyCheck {
  const c = new Checker("invalid-body");
  const exempt = new Set<string>();
  const p = "body";
  switch (kind) {
    case "claim": {
      if (target === null) {
        const b = c.object(body, p, ["goal", "scope"], ["purpose", "plan", "because"]);
        c.string(b.goal, "body.goal", LIMITS.goal);
        c.globs(b.scope, "body.scope", 1);
        if (b.purpose !== undefined) c.oneOf(b.purpose, "body.purpose", ["config-recovery"] as const);
        if (b.plan !== undefined) c.string(b.plan, "body.plan", LIMITS.long);
        if (b.because !== undefined) c.reasons(b.because, "body.because");
      } else {
        const b = c.object(body, p, ["scope", "expectedGeneration"], ["goal", "plan", "because", "lease"]);
        c.globs(b.scope, "body.scope", 1);
        if (b.goal !== undefined) c.string(b.goal, "body.goal", LIMITS.goal);
        if (b.plan !== undefined) c.string(b.plan, "body.plan", LIMITS.long);
        if (b.because !== undefined) c.reasons(b.because, "body.because");
        c.int(b.expectedGeneration, "body.expectedGeneration", 0);
        if (b.lease !== undefined) c.int(b.lease, "body.lease", 1);
      }
      break;
    }
    case "propose": {
      const b = c.object(body, p, ["lease", "expectedGeneration", "head", "summary"], ["because"]);
      c.int(b.lease, "body.lease", 1);
      c.int(b.expectedGeneration, "body.expectedGeneration", 0);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      c.string(b.summary, "body.summary", LIMITS.medium);
      if (b.because !== undefined) c.reasons(b.because, "body.because");
      break;
    }
    case "note": {
      const b = c.object(body, p, ["text"], ["replyTo"]);
      c.string(b.text, "body.text", LIMITS.long);
      if (b.replyTo !== undefined) c.format(b.replyTo, "body.replyTo", RE.actId, "an entry ID");
      break;
    }
    case "review": {
      const b = c.object(body, p, ["head", "verdict", "scope", "text"], ["dependsOn"]);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      c.oneOf(b.verdict, "body.verdict", ["approve", "object"] as const);
      c.globs(b.scope, "body.scope", 1);
      if (b.dependsOn !== undefined) c.globs(b.dependsOn, "body.dependsOn");
      c.string(b.text, "body.text", LIMITS.long);
      break;
    }
    case "check": {
      const b = c.object(body, p, ["obligation", "check", "integration", "input", "config", "runner", "volatile", "ok", "detail"], ["landOp"]);
      c.format(b.obligation, "body.obligation", RE.obligationId, "an obligation ID");
      c.format(b.check, "body.check", RE.ruleId, "a checker name");
      c.format(b.integration, "body.integration", RE.sha, "a git object name");
      const input = b.input;
      if (isPlainObject(input) && input["kind"] === "filtered") {
        const i = c.object(input, "body.input", ["kind", "snapshot", "paths"]);
        c.format(i.snapshot, "body.input.snapshot", RE.digest, "a digest");
        c.globs(i.paths, "body.input.paths");
      } else {
        const i = c.object(input, "body.input", ["kind", "tree"]);
        c.oneOf(i.kind, "body.input.kind", ["tree"] as const);
        c.format(i.tree, "body.input.tree", RE.sha, "a git object name");
      }
      c.format(b.config, "body.config", RE.digest, "a digest");
      c.format(b.runner, "body.runner", RE.digest, "a digest");
      c.bool(b.volatile, "body.volatile");
      c.bool(b.ok, "body.ok");
      c.string(b.detail, "body.detail", LIMITS.long);
      if (b.landOp !== undefined) c.format(b.landOp, "body.landOp", RE.opId, "an operation ID");
      break;
    }
    case "land": {
      const b = c.object(body, p, ["lease", "head"]);
      c.int(b.lease, "body.lease", 1);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      break;
    }
    case "release": {
      const b = c.object(body, p, ["lease"], ["note"]);
      c.int(b.lease, "body.lease", 1);
      if (b.note !== undefined) c.string(b.note, "body.note", LIMITS.medium);
      break;
    }
    case "renew": {
      const b = c.object(body, p, ["lease"]);
      c.int(b.lease, "body.lease", 1);
      break;
    }
    case "roster":
      checkRosterOp(c, body, exempt);
      break;
  }
  return { fixed: c.fixed, exempt };
}

function kindsOrStar(c: Checker, v: unknown, path: string): void {
  if (v === "*") return;
  const list = c.array(v, path, DELEGABLE.length);
  if (list.length === 0) c.error(path, "must name at least one kind");
  list.forEach((k, i) => c.oneOf(k, `${path}[${i}]`, DELEGABLE));
  if (new Set(list).size !== list.length) c.error(path, "must not repeat a kind");
}

function checkRosterOp(c: Checker, body: unknown, exempt: Set<string>): void {
  if (!isPlainObject(body)) return c.error("body", "must be an object");
  const op = c.oneOf(body["op"], "body.op", ["invite", "join", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate", "rotate-recovery"] as const);
  const p = "body";
  switch (op) {
    case "invite": {
      const b = c.object(body, p, ["op", "member", "custody", "expiresAt", "secretHash"], ["role", "session"]);
      c.format(b.member, "body.member", RE.handle, "a member handle");
      if (b.role !== undefined) c.oneOf(b.role, "body.role", ROLES);
      c.oneOf(b.custody, "body.custody", ["client", "room"] as const);
      c.format(b.expiresAt, "body.expiresAt", RE.timestamp, "an RFC 3339 UTC time");
      c.format(b.secretHash, "body.secretHash", RE.digest, "a digest");
      if (b.session !== undefined) {
        if (b.custody !== "room") c.error("body.session", "is only for room-custody invitations");
        const s = c.object(b.session, "body.session", ["kinds", "lanes", "ttlSeconds"]);
        kindsOrStar(c, s.kinds, "body.session.kinds");
        if (s.lanes !== "*") c.error("body.session.lanes", 'must be "*"');
        c.int(s.ttlSeconds, "body.session.ttlSeconds", 60, 30 * 24 * 3600);
      }
      break;
    }
    case "join": {
      const b = c.object(body, p, ["op", "invitation", "secret"]);
      c.format(b.invitation, "body.invitation", RE.actId, "an entry ID");
      const secret = c.string(b.secret, "body.secret", 1024);
      if (!RE.b64url.test(secret) || secret.length < 43) c.error("body.secret", "must be at least 32 bytes in base64url");
      exempt.add("body.secret");
      break;
    }
    case "set-role": {
      const b = c.object(body, p, ["op", "member", "role"]);
      c.format(b.member, "body.member", RE.handle, "a member handle");
      c.oneOf(b.role, "body.role", ROLES);
      break;
    }
    case "remove": {
      const b = c.object(body, p, ["op", "member"]);
      c.format(b.member, "body.member", RE.handle, "a member handle");
      break;
    }
    case "revoke-key": {
      const b = c.object(body, p, ["op", "key", "reason"]);
      c.format(b.key, "body.key", RE.keyId, "a key ID");
      c.oneOf(b.reason, "body.reason", ["retired", "compromised"] as const);
      break;
    }
    case "team": {
      const b = c.object(body, p, ["op", "team", "members"]);
      c.format(b.team, "body.team", RE.handle, "a team handle");
      const list = c.array(b.members, "body.members", 1000);
      list.forEach((m, i) => c.format(m, `body.members[${i}]`, RE.handle, "a member handle"));
      break;
    }
    case "delegate": {
      const b = c.object(body, p, ["op", "to", "kinds", "lanes", "expiresAt"]);
      c.format(b.to, "body.to", RE.keyId, "a key ID");
      kindsOrStar(c, b.kinds, "body.kinds");
      if (b.lanes !== "*") {
        const list = c.array(b.lanes, "body.lanes", 256);
        if (list.length === 0) c.error("body.lanes", "must name at least one lane");
        list.forEach((l, i) => c.format(l, `body.lanes[${i}]`, RE.actId, "a lane ID"));
      }
      c.format(b.expiresAt, "body.expiresAt", RE.timestamp, "an RFC 3339 UTC time");
      break;
    }
    case "undelegate": {
      const b = c.object(body, p, ["op", "delegation"]);
      c.format(b.delegation, "body.delegation", RE.actId, "an entry ID");
      break;
    }
    case "rotate-recovery": {
      const b = c.object(body, p, ["op", "key"]);
      c.format(b.key, "body.key", RE.keyId, "a key ID");
      break;
    }
  }
}

// ------------------------------------------------------------ requests and redemption

/** Check a signed request (R-CRED-5, R-CRED-6). Throws `ShapeError` `bad-request`. */
export function checkSignedRequest(v: unknown): void {
  const c = new Checker("bad-request");
  const signed = c.object(v, "request", ["request", "sig"]);
  c.format(signed.sig, "request.sig", RE.sig, "an Ed25519 signature in base64url");
  const r = c.object(signed.request, "request.request", ["v", "room", "actor", "request", "nonce", "notAfter"], ["delegation"]);
  if (r.v !== 1) c.error("request.request.v", "must be 1");
  c.format(r.room, "request.request.room", RE.roomId, "a room ID");
  c.format(r.actor, "request.request.actor", RE.keyId, "a key ID");
  if (r.delegation !== undefined) c.format(r.delegation, "request.request.delegation", RE.actId, "an entry ID");
  c.format(r.nonce, "request.request.nonce", RE.nonce, "16 to 64 characters from A-Z, a-z, 0-9, _ and -");
  c.format(r.notAfter, "request.request.notAfter", RE.timestamp, "an RFC 3339 UTC time");
  const body = r.request;
  if (isPlainObject(body) && body["kind"] === "session") {
    const b = c.object(body, "request.request.request", ["kind", "ttlSeconds"]);
    c.int(b.ttlSeconds, "request.request.request.ttlSeconds", 1, 3600);
  } else {
    const b = c.object(body, "request.request.request", ["kind", "lane", "lease"]);
    c.oneOf(b.kind, "request.request.request.kind", ["workspace", "workspace-token"] as const);
    c.format(b.lane, "request.request.request.lane", RE.actId, "a lane ID");
    c.int(b.lease, "request.request.request.lease", 1);
  }
}

/** Check a redemption's outer shape (R-CRED-9). Throws `ShapeError` `bad-request`. */
export function checkRedemption(v: unknown): void {
  const c = new Checker("bad-request");
  if (!isPlainObject(v)) return c.error("redemption", "must be an object");
  if (v["custody"] === "client") {
    const r = c.object(v, "redemption", ["custody", "join"]);
    checkSignedEnvelope(r.join);
  } else {
    const r = c.object(v, "redemption", ["custody", "invitation", "secret"]);
    c.oneOf(r.custody, "redemption.custody", ["client", "room"] as const);
    c.format(r.invitation, "redemption.invitation", RE.actId, "an entry ID");
    const s = c.string(r.secret, "redemption.secret", 1024);
    if (!RE.b64url.test(s)) c.error("redemption.secret", "must be base64url");
  }
}
