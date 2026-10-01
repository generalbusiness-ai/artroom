/**
 * A small, deterministic model of one room, enough to replay the scenario
 * and answer the UI's actions with the platform's rules: overlaps from
 * claims (R-PATH-3), obligations from policy (R-OBL-5), carrying
 * (R-CARRY-1..6), review authority (R-OBL-2), the landing operation and its
 * publication slot (R-LAND, R-PUB), leases (R-LANE) and publication of the
 * log. It is not the room: lane A owns that.
 */

import type {
  ActId,
  AttentionItem,
  Authority,
  Check,
  Decision,
  Evidence,
  Flag,
  Generation,
  Glob,
  Lane,
  LandOp,
  MemberId,
  NotCarried,
  Note,
  NoteAnchor,
  Obligation,
  OpId,
  Overlap,
  PathChange,
  PreviewOp,
  Principal,
  Proposal,
  PublicationSlot,
  Reason,
  Refusal,
  RepoPath,
  Result,
  Review,
  ReviewerSpec,
  Role,
  Sha,
  Verdict,
} from "../contract.ts";
import type { FeedEntry, Person, PolicyOutcome, RoomSnapshot, Why } from "../adapter.ts";
import { matches, matchesAny, overlap } from "../glob.ts";
import { actId, at, cursorAt, fakeKey, fakeSha, hex8 } from "./ids.ts";
import { notifiesAuthz, PLATFORM_GLOBAL_INPUTS, POLICY, refusesClaim } from "./policy.ts";

export const PEOPLE: readonly Person[] = [
  { handle: "@maya", name: "Maya Okafor", role: "maintainer", kind: "person", teams: ["@security"] },
  { handle: "@sam", name: "Sam Lindqvist", role: "admin", kind: "person", teams: ["@platform"] },
  { handle: "@ash", name: "Ash", role: "agent", kind: "agent", teams: [] },
  { handle: "@birch", name: "Birch", role: "agent", kind: "agent", teams: [] },
  { handle: "@cedar", name: "Cedar", role: "agent", kind: "agent", teams: [] },
  { handle: "@ci", name: "CI", role: "checker", kind: "service", teams: [] },
];

const LEASE_MINUTES = 15;
const ROOM_ID = `room_${fakeSha("acme/web").slice(0, 32)}` as const;
const CONFIG = `sha256:${fakeSha("tests-config")}${fakeSha("tests-config2").slice(0, 24)}` as const;
const RUNNER = `sha256:${fakeSha("runner")}${fakeSha("runner2").slice(0, 24)}` as const;

const person = (m: MemberId) => PEOPLE.find((p) => p.handle === m)!;
const roleOf = (m: MemberId): Role => person(m).role;
const auth = (m: MemberId): Authority => ({ via: "member", member: m, role: roleOf(m), key: fakeKey(m) });
const quote = (s: string) => `“${s}”`;

interface LaneRec {
  id: ActId;
  tag: string;
  goal: string;
  plan?: string;
  scope: Glob[];
  holder: MemberId | null;
  leaseGen: number;
  expiresAt: number;
  unheldWhy?: "released" | "expired";
  handover?: ActId;
  generation: Generation;
  generations: { generation: Generation; head: Sha; act: ActId; landed?: { commit: Sha; at: number } }[];
  landing?: OpId;
  because?: Reason[];
}

interface OblRec {
  id: `obl_${string}`;
  rule: string;
  paths: RepoPath[];
  spec: { kind: "review"; from: ReviewerSpec[]; count: number; allowSelf: boolean } | { kind: "check"; check: string; by: Principal[] };
  evidence: Evidence[];
  reopened?: Extract<Obligation, { state: "open" }>["reopened"];
}

interface PropRec {
  laneTag: string;
  lane: ActId;
  generation: Generation;
  head: Sha;
  base: Sha;
  id: ActId;
  seq: number;
  t: number;
  by: MemberId;
  summary: string;
  changed: PathChange[];
  since: RepoPath[];
  obligations: OblRec[];
  notCarried: NotCarried[];
  preview: PreviewOp;
  because?: Reason[];
  after?: OpId;
  flags: Flag[];
}

/** An attention item before the room gives it an ID; distributes over the `why` union. */
type NewItem = AttentionItem extends infer T ? (T extends AttentionItem ? Omit<T, "id" | "open"> : never) : never;

interface AttnRec {
  to: MemberId;
  item: AttentionItem;
}

/** The facts the policy dry run replays (src/room/dryrun.ts). */
export interface History {
  claims: { seq: number; act: ActId; by: MemberId; role: Role; scope: Glob[]; lane: ActId | null; refused: boolean }[];
  proposals: { seq: number; act: ActId; by: MemberId; lane: ActId; generation: Generation; paths: RepoPath[]; obligations: string[] }[];
  carries: {
    seq: number;
    act: ActId;
    by: MemberId;
    lane: ActId;
    from: Generation;
    to: Generation;
    scope: Glob[];
    dependsOn: Glob[];
    changedSince: RepoPath[];
    carried: boolean;
  }[];
}

export interface ProposeSpec {
  head: string;
  summary: string;
  changed: PathChange[];
  /** Paths changed since the previous generation's head. */
  since?: RepoPath[];
  because?: Reason[];
}

const pathsOf = (changed: readonly PathChange[]) =>
  changed.flatMap((c) => (c.status === "renamed" ? [c.from, c.path] : [c.path]));

export class World {
  t = 0;
  private seq = 0;
  main: Sha = fakeSha("main-0");
  mainMovedAt = 0;
  readonly lanes = new Map<string, LaneRec>();
  readonly proposals: PropRec[] = [];
  readonly reviews: Review[] = [];
  readonly checks: Check[] = [];
  readonly notes: Note[] = [];
  readonly ops = new Map<OpId, LandOp>();
  slot: PublicationSlot = { state: "free", last: 6 };
  readonly attention: AttnRec[] = [];
  readonly feed: FeedEntry[] = [];
  publishedThrough = 0;
  readonly outcomes: PolicyOutcome[] = [];
  readonly whys = new Map<ActId, Why>();
  readonly history: History = { claims: [], proposals: [], carries: [] };
  policyVersion: ActId = actId(1, "policy");

  constructor() {
    this.genesis();
  }

  // ------------------------------------------------------------ the log

  private entry(type: FeedEntry["type"], kind: string, by: MemberId | null, text: string, extra: { lane?: ActId; refusal?: Refusal } = {}) {
    const seq = this.seq++;
    const id = actId(seq, `${type}:${kind}:${text}`);
    const after = type === "act" && this.slot.state === "held" ? this.slot.op : undefined;
    const flags: Flag[] = after ? ["after-reservation"] : [];
    this.feed.push({
      id,
      seq,
      at: at(this.t),
      type,
      kind,
      by,
      text,
      flags,
      ...(extra.lane ? { lane: extra.lane } : {}),
      ...(extra.refusal ? { refusal: { ...extra.refusal, act: id } } : {}),
      ...(after ? { after } : {}),
    });
    return { id, seq, after, flags };
  }

  private why(id: ActId, seq: number, by: MemberId | null, title: string, outcome: Why["outcome"], decisions: Decision[], invariants: Why["invariants"], reasons: readonly Reason[] = []) {
    this.whys.set(id, { act: id, seq, by, title, outcome, decisions, invariants, reasons, published: false });
  }

  private decision(rule: string, kind: Decision["kind"], outcome: Decision["outcome"]): Decision {
    return {
      rule,
      kind,
      policy: this.policyVersion,
      stamp: { profile: "artroom-jsonata-v1", jsonata: "2.2.2", accounting: "artroom-act-budget-v1" },
      input: `sha256:${fakeSha(`${rule}:${this.seq}`)}${fakeSha(`${rule}:${this.seq}:2`).slice(0, 24)}`,
      outcome,
      usage: { steps: 40 + (this.seq % 17) * 3, inspectedBytes: 900 + (this.seq % 11) * 64 },
    };
  }

  private outcome(seq: number, act: ActId, actKind: string, by: MemberId | null, decision: Decision, text: string, lane?: ActId) {
    this.outcomes.push({ seq, at: at(this.t), act, actKind, by, decision, text, ...(lane ? { lane } : {}) });
  }

  private base<K extends string>(kind: K, id: ActId, seq: number, by: MemberId, after: OpId | undefined, flags: Flag[]) {
    return { id, seq, kind, by: auth(by), at: at(this.t), flags, ...(after ? { after } : {}) };
  }

  private genesis() {
    this.entry("system", "genesis", "@sam", "@sam created the room acme/web.");
    const p = this.entry("system", "policy-activated", "@sam", "The room's first policy became active: 5 rules.");
    this.policyVersion = p.id;
    for (const m of PEOPLE) {
      this.entry("act", "roster", m.handle, `${m.handle} joined as ${/^[aeiou]/.test(m.role) ? "an" : "a"} ${m.role}.`);
    }
    this.checkpoint();
  }

  /** Publish the log through the latest entry (R-LOG-8). */
  checkpoint() {
    const through = this.seq - 1;
    this.entry("system", "checkpoint", null, `The log was published to refs/artroom/log through entry ${through}.`);
    this.publishedThrough = through;
  }

  // -------------------------------------------------------- attention

  private notify(to: MemberId, item: NewItem) {
    const id = `att_${hex8(`${to}:${item.seq}:${item.why}:${this.attention.length}`)}`;
    this.attention.push({ to, item: { ...item, id, open: true } as AttentionItem });
  }

  private resolve(pred: (a: AttnRec) => boolean) {
    for (const a of this.attention) if (a.item.open && pred(a)) a.item = { ...a.item, open: false };
  }

  // ------------------------------------------------------------ helpers

  lane(tag: string): LaneRec {
    const l = this.lanes.get(tag);
    if (!l) throw new Error(`no lane ${tag}`);
    return l;
  }

  private prop(tag: string, generation?: Generation): PropRec | undefined {
    const lane = this.lanes.get(tag);
    if (!lane) return undefined;
    const g = generation ?? lane.generation;
    return this.proposals.find((p) => p.laneTag === tag && p.generation === g);
  }

  private renew(lane: LaneRec) {
    lane.expiresAt = this.t + LEASE_MINUTES;
  }

  tagOf(lane: ActId): string | undefined {
    for (const [tag, l] of this.lanes) if (l.id === lane) return tag;
    return undefined;
  }

  /** Does `m` qualify for a reviewer or checker spec (R-OBL-2)? */
  qualifies(m: MemberId, spec: string, paths: readonly RepoPath[]): boolean {
    const p = person(m);
    if (spec === m) return true;
    if (p.teams.includes(spec as MemberId)) return true;
    if (spec === `role:${p.role}`) return true;
    if (spec === "owners") {
      return paths.some((path) =>
        Object.entries(POLICY.owners).some(([glob, owners]) => matches(path, glob) && owners.some((o) => this.qualifies(m, o, paths))),
      );
    }
    return false;
  }

  private membersFor(specs: readonly string[], paths: readonly RepoPath[]): MemberId[] {
    return PEOPLE.filter((p) => specs.some((s) => this.qualifies(p.handle, s, paths))).map((p) => p.handle);
  }

  private oblState(o: OblRec): "open" | "met" {
    if (o.spec.kind === "review") {
      const approvers = new Set(
        o.evidence.map((e) => this.reviews.find((r) => r.id === e.act)).filter((r) => r?.verdict === "approve").map((r) => r!.by.member),
      );
      return approvers.size >= o.spec.count ? "met" : "open";
    }
    return o.evidence.some((e) => this.checks.find((c) => c.id === e.act)?.ok) ? "met" : "open";
  }

  // ------------------------------------------------------------- claims

  claim(by: MemberId, tag: string, input: { goal: string; scope: Glob[]; plan?: string; because?: Reason[] }): Result<ActId> {
    if (refusesClaim(roleOf(by), input.scope)) {
      const rule = POLICY.rules[0]!;
      const refusal: Refusal = {
        refused: true,
        rule: rule.id,
        reason: rule.kind === "refuse" ? rule.reason : "",
        fix: rule.kind === "refuse" ? rule.fix : "",
      };
      const e = this.entry("refusal", "claim", by, `${by}'s claim ${quote(input.goal)} was refused by rule ${rule.id}.`, { refusal });
      const d = this.decision(rule.id, "refuse", { result: "refuse", reason: refusal.reason, fix: refusal.fix ?? "" });
      this.outcome(e.seq, e.id, "claim", by, d, `Refused ${by}'s claim on ${input.scope.join(", ")}.`);
      this.why(e.id, e.seq, by, `${by} tried to claim ${quote(input.goal)}`, "refused", [d], [{ rule: "R-POL-2", held: true, detail: "Refuse rules run before the act is recorded." }], input.because ?? []);
      this.history.claims.push({ seq: e.seq, act: e.id, by, role: roleOf(by), scope: input.scope, lane: null, refused: true });
      return { ...refusal, act: e.id };
    }
    const overlapsWith = [...this.lanes.values()].filter((l) => this.isActive(l) && this.laneOverlaps(input.scope, l.scope).length > 0);
    const overlapText = overlapsWith.length
      ? ` It overlaps ${overlapsWith.map((l) => `${l.holder ?? "an unheld"}'s lane ${quote(l.goal)}`).join(" and ")}.`
      : "";
    const e = this.entry("act", "claim", by, `${by} claimed ${quote(input.goal)}: ${input.scope.join(", ")}.${overlapText}`);
    const lane: LaneRec = {
      id: e.id,
      tag,
      goal: input.goal,
      scope: input.scope,
      holder: by,
      leaseGen: 1,
      expiresAt: this.t + LEASE_MINUTES,
      generation: 0,
      generations: [],
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.because ? { because: input.because } : {}),
    };
    this.lanes.set(tag, lane);
    this.feed[this.feed.length - 1] = { ...this.feed[this.feed.length - 1]!, lane: e.id };
    this.history.claims.push({ seq: e.seq, act: e.id, by, role: roleOf(by), scope: input.scope, lane: e.id, refused: false });
    const d = this.decision(POLICY.rules[0]!.id, "refuse", { result: "pass" });
    this.why(
      e.id,
      e.seq,
      by,
      `${by} claimed ${quote(input.goal)}`,
      "accepted",
      [d],
      [
        { rule: "R-PATH-1", held: true, detail: "Every scope pattern is valid." },
        { rule: "R-PATH-3", held: true, detail: overlapsWith.length ? `Overlap reported with ${overlapsWith.length} lane.` : "No overlap with any held lane." },
        { rule: "R-LANE-1", held: true, detail: `New lane, generation 0, lease generation 1, expires in ${LEASE_MINUTES} minutes.` },
      ],
      input.because ?? [],
    );
    return e.id;
  }

  takeOver(by: MemberId, tag: string) {
    const lane = this.lane(tag);
    const previous = lane.holder;
    const e = this.entry("act", "claim", by, `${by} took over ${quote(lane.goal)}, which nobody held. New lease generation ${lane.leaseGen + 1}.`, { lane: lane.id });
    lane.holder = by;
    lane.leaseGen += 1;
    delete lane.unheldWhy;
    this.renew(lane);
    this.resolve((a) => a.item.lane === lane.id && (a.item.why === "lane-unheld" || a.item.why === "recut-needed"));
    this.history.claims.push({ seq: e.seq, act: e.id, by, role: roleOf(by), scope: lane.scope, lane: lane.id, refused: false });
    const p = this.prop(tag);
    if (p?.preview.state === "conflict") {
      this.notify(by, { why: "recut-needed", lane: lane.id, op: p.preview.id, unheld: false, seq: e.seq, text: `Recut ${quote(lane.goal)} on main: it conflicts on ${p.preview.paths.join(", ")}.` });
    }
    this.why(e.id, e.seq, by, `${by} took over ${quote(lane.goal)}`, "accepted", [], [
      { rule: "R-LANE-7", held: true, detail: `The lane was unheld${previous ? ` after ${previous}'s lease` : ""}; take-over gives lease generation ${lane.leaseGen}.` },
      { rule: "R-WS-3", held: true, detail: "The new holder gets a new write token for the new lease generation. Tokens are never shown here." },
    ]);
  }

  private isActive(l: LaneRec) {
    return !l.generations.some((g) => g.landed);
  }

  private laneOverlaps(mine: readonly Glob[], theirs: readonly Glob[]) {
    const out: { mine: Glob; theirs: Glob; certain: boolean }[] = [];
    for (const a of mine) for (const b of theirs) {
      const o = overlap(a, b);
      if (o) out.push({ mine: a, theirs: b, certain: o.certain });
    }
    return out;
  }

  // ----------------------------------------------------------- propose

  propose(by: MemberId, tag: string, spec: ProposeSpec): Result<ActId> {
    const lane = this.lane(tag);
    const paths = pathsOf(spec.changed);
    const outside = paths.filter((p) => !matchesAny(p, lane.scope));
    if (lane.holder !== by) {
      return this.platformRefusal(by, "propose", lane, { rule: "not-holder", reason: `${by} does not hold this lane.`, fix: "Take over the lane first, or ask its holder." });
    }
    if (outside.length) {
      return this.platformRefusal(by, "propose", lane, {
        rule: "outside-claim",
        reason: `${outside.join(", ")} ${outside.length === 1 ? "is" : "are"} outside the claim.`,
        fix: `Extend the claim to cover ${outside.join(", ")}, or leave ${outside.length === 1 ? "that file" : "those files"} out of this head.`,
      });
    }
    const generation = lane.generation + 1;
    const prev = this.prop(tag, lane.generation);
    const head = fakeSha(spec.head);
    const e = this.entry("act", "propose", by, `${by} proposed generation ${generation} of ${quote(lane.goal)}: ${spec.changed.length} files.`, { lane: lane.id });
    const decisions: Decision[] = [];

    // Obligations from require rules, on the actual changed paths (R-OBL-5, R-PROP-5).
    const obligations: OblRec[] = [];
    for (const rule of POLICY.rules) {
      if (rule.kind !== "require") continue;
      const hit = paths.filter((p) => matchesAny(p, rule.paths));
      if (!hit.length) continue;
      const o = rule.obligation;
      obligations.push({
        id: `obl_${rule.id}`,
        rule: rule.id,
        paths: hit,
        spec: o.type === "review" ? { kind: "review", from: [...o.from], count: o.count, allowSelf: o.allowSelf } : { kind: "check", check: o.check, by: [...o.by] },
        evidence: [],
      });
      const d = this.decision(rule.id, "require", { result: "obligation", obligation: `obl_${rule.id}` });
      decisions.push(d);
      this.outcome(e.seq, e.id, "propose", by, d, `Generation ${generation} of ${quote(lane.goal)} needs ${o.type === "review" ? `a review from ${o.from.join(", ")}` : `the ${o.check} check from ${o.by.join(", ")}`} (${hit.length} ${hit.length === 1 ? "path" : "paths"}).`, lane.id);
    }

    // Carry earlier evidence (R-CARRY-1..6), or record why not (R-CARRY-5).
    const notCarried: NotCarried[] = [];
    const since = spec.since ?? paths;
    if (prev) {
      for (const old of prev.obligations) {
        const next = obligations.find((o) => o.id === old.id);
        for (const ev of old.evidence) {
          const result = this.carry(ev, since);
          const d = this.decision(old.rule, "carry", { result: result.carried ? "carry" : "no-carry", evidence: ev.act });
          decisions.push(d);
          const review = this.reviews.find((r) => r.id === ev.act);
          if (review) {
            this.history.carries.push({
              seq: e.seq,
              act: ev.act,
              by: review.by.member!,
              lane: lane.id,
              from: review.generation,
              to: generation,
              scope: [...review.scope],
              dependsOn: [...review.dependsOn],
              changedSince: since,
              carried: result.carried,
            });
          }
          const who = review?.by.member ?? this.checks.find((c) => c.id === ev.act)?.by.member ?? null;
          if (result.carried) {
            const source = ev.basis === "carried" ? ev.from : { generation: ev.generation, head: ev.head };
            next?.evidence.push({
              basis: "carried",
              act: ev.act,
              kind: ev.kind,
              from: source,
              reason: {
                code: "paths-unchanged",
                changed: since,
                tested: { scope: review ? [...review.scope] : [], dependsOn: review ? [...review.dependsOn] : [], globalInputs: [...PLATFORM_GLOBAL_INPUTS] },
                policy: "same",
                text: "reviewed paths and declared dependencies unchanged",
              },
              rules: [],
            });
            this.outcome(e.seq, ev.act, "propose", by, d, `${who}'s ${ev.kind} carried to generation ${generation}: reviewed paths and declared dependencies unchanged.`, lane.id);
          } else {
            notCarried.push(result.why);
            if (next && this.oblStateWith(old) === "met") next.reopened = { because: "not-carried", detail: result.why };
            this.outcome(e.seq, ev.act, "propose", by, d, `${who}'s ${ev.kind} did not carry to generation ${generation}: ${result.why.text}`, lane.id);
          }
        }
      }
    }

    const preview: PreviewOp = {
      id: `op_preview_${e.seq}`,
      kind: "preview",
      updatedAt: at(this.t),
      lane: lane.id,
      generation,
      state: "clean",
      base: this.main,
      integration: fakeSha(`int:${spec.head}:${this.main}`),
    };
    const rec: PropRec = {
      laneTag: tag,
      lane: lane.id,
      generation,
      head,
      base: this.main,
      id: e.id,
      seq: e.seq,
      t: this.t,
      by,
      summary: spec.summary,
      changed: spec.changed,
      since,
      obligations,
      notCarried,
      preview,
      flags: e.flags,
      ...(spec.because ? { because: spec.because } : {}),
      ...(e.after ? { after: e.after } : {}),
    };
    this.proposals.push(rec);
    lane.generation = generation;
    lane.generations.push({ generation, head, act: e.id });
    this.renew(lane);
    this.history.proposals.push({ seq: e.seq, act: e.id, by, lane: lane.id, generation, paths, obligations: obligations.map((o) => o.rule) });

    // Earlier generations' requests are superseded.
    this.resolve((a) => a.item.lane === lane.id && (("proposal" in a.item && a.item.proposal.generation < generation) || a.item.why === "policy"));

    // Attention: reviewers and checkers (plan section 3, item 4).
    const ref = { lane: lane.id, generation };
    for (const o of obligations) {
      if (this.oblState(o) === "met") continue;
      if (o.spec.kind === "review") {
        for (const m of this.membersFor(o.spec.from, o.paths)) {
          if (m === by) continue;
          const lost = notCarried.find((n) => this.reviews.find((r) => r.id === n.act)?.by.member === m);
          if (lost) {
            this.notify(m, { why: "evidence-invalidated", proposal: ref, obligation: o.id, lane: lane.id, seq: e.seq, text: `Your approval did not carry to generation ${generation} of ${quote(lane.goal)}. Review it again.` });
          } else {
            this.notify(m, { why: "review-requested", proposal: ref, obligation: o.id, as: (o.spec.from[0] ?? "owners") as MemberId, lane: lane.id, seq: e.seq, text: `Review generation ${generation} of ${quote(lane.goal)}.` });
          }
        }
      } else {
        for (const m of this.membersFor(o.spec.by, o.paths)) {
          this.notify(m, { why: "check-requested", proposal: ref, obligation: o.id, lane: lane.id, seq: e.seq, text: `Run ${o.spec.check} on generation ${generation} of ${quote(lane.goal)}.` });
        }
      }
    }
    if (notifiesAuthz(paths)) {
      const rule = POLICY.rules.find((r) => r.id === "authz-changes")!;
      const to = this.membersFor(["@platform"], paths);
      const d = this.decision(rule.id, "notify", { result: "notify", to });
      this.outcome(e.seq, e.id, "propose", by, d, `Told ${to.join(", ")} that generation ${generation} of ${quote(lane.goal)} changes authorization code.`, lane.id);
      for (const m of to) {
        if (m === by) continue;
        this.notify(m, { why: "policy", rule: rule.id, act: e.id, lane: lane.id, seq: e.seq, text: `Generation ${generation} of ${quote(lane.goal)} changes authorization code. Read it.` });
      }
    }
    this.why(e.id, e.seq, by, `${by} proposed generation ${generation} of ${quote(lane.goal)}`, "accepted", decisions, [
      { rule: "R-LANE-4", held: true, detail: `expectedGeneration was ${generation - 1}.` },
      { rule: "R-PROP-4", held: true, detail: "Every changed path, old and new, is inside the claim." },
      { rule: "R-PROP-2", held: true, detail: `Pinned at refs/artroom/heads/${lane.id}/${generation}; it never moves.` },
      ...(prev ? [{ rule: "R-CARRY-5", held: true, detail: `${notCarried.length} earlier verdict or check did not carry; each is listed with its reason.` }] : []),
    ], spec.because ?? []);
    return e.id;
  }

  private oblStateWith(o: OblRec) {
    return this.oblState(o);
  }

  private carry(ev: Evidence, since: readonly RepoPath[]): { carried: true } | { carried: false; why: NotCarried } {
    const review = this.reviews.find((r) => r.id === ev.act);
    if (!review) {
      return { carried: false, why: { act: ev.act, code: "integration-changed", text: "The integration changed, so the check runs again." } };
    }
    const inScope = since.filter((p) => matchesAny(p, review.scope));
    if (inScope.length) {
      return { carried: false, why: { act: ev.act, code: "scope-changed", paths: inScope, text: `${inScope.join(", ")} changed, inside the reviewed scope.` } };
    }
    const dependsOn = [...review.dependsOn, ...Object.entries(POLICY.carry.dependsOn).filter(([area]) => review.scope.some((s) => overlap(s, area))).flatMap(([, d]) => d)];
    const dep = since.filter((p) => matchesAny(p, dependsOn));
    if (dep.length) {
      return {
        carried: false,
        why: { act: ev.act, code: "dependency-changed", paths: dep, text: `${dep.join(", ")} changed, and ${review.by.member} declared ${dependsOn.join(", ")} as a dependency.` },
      };
    }
    const globals = since.filter((p) => matchesAny(p, [...PLATFORM_GLOBAL_INPUTS, ...POLICY.carry.globalInputs]));
    if (globals.length) {
      return { carried: false, why: { act: ev.act, code: "global-input-changed", paths: globals, text: `${globals.join(", ")} changed, and is a global input.` } };
    }
    return { carried: true };
  }

  private platformRefusal(by: MemberId, kind: string, lane: LaneRec | null, r: { rule: string; reason: string; fix: string }): Refusal {
    const refusal: Refusal = { refused: true, rule: r.rule, reason: r.reason, fix: r.fix };
    const e = this.entry("refusal", kind, by, `${by}'s ${kind} was refused: ${r.rule}.`, { refusal, ...(lane ? { lane: lane.id } : {}) });
    this.why(e.id, e.seq, by, `${by}'s ${kind} was refused`, "refused", [], [{ rule: r.rule, held: false, detail: r.reason }]);
    return { ...refusal, act: e.id };
  }

  // ------------------------------------------------------------ reviews

  review(by: MemberId, tag: string, generation: Generation, input: { verdict: Verdict; scope: Glob[]; dependsOn?: Glob[]; text: string }, head?: Sha): Result<Review> {
    const lane = this.lane(tag);
    const p = this.prop(tag, generation);
    if (!p) return this.platformRefusal(by, "review", lane, { rule: "lane-unknown", reason: "That generation does not exist.", fix: "Open the lane and choose a generation." });
    if (head && head !== p.head) {
      return this.platformRefusal(by, "review", lane, { rule: "head-mismatch", reason: `Generation ${generation}'s head is ${p.head.slice(0, 7)}, not ${head.slice(0, 7)}.`, fix: "Reload the proposal and review the head it shows." });
    }
    const latest = generation === lane.generation;
    const authors = new Set([p.by, lane.holder]);
    const reviewObls = p.obligations.filter((o) => o.spec.kind === "review");
    const qualifying = reviewObls.filter((o) => o.spec.kind === "review" && o.spec.from.some((s) => this.qualifies(by, s, o.paths)));
    if (!qualifying.length) {
      const wanted = [...new Set(reviewObls.flatMap((o) => (o.spec.kind === "review" ? o.spec.from : [])))];
      return this.platformRefusal(by, "review", lane, {
        rule: "not-authorized-reviewer",
        reason: `${by} is not a reviewer this generation needs.`,
        fix: wanted.length ? `Ask ${wanted.join(" or ")} to review it.` : "This generation needs no review.",
      });
    }
    if (authors.has(by)) {
      return this.platformRefusal(by, "review", lane, { rule: "self-review", reason: `${by} wrote or holds this lane.`, fix: "Ask another reviewer." });
    }
    const verb = input.verdict === "approve" ? "approved" : "objected to";
    const e = this.entry("act", "review", by, `${by} ${verb} generation ${generation} of ${quote(lane.goal)}${latest ? "" : " (an earlier generation: kept as history)"}.`, { lane: lane.id });
    const evidence: Evidence = { basis: "here", act: e.id, kind: "review", generation, head: p.head };
    const fulfils: Review["fulfils"][number][] = [];
    const review: Review = {
      ...this.base("review", e.id, e.seq, by, e.after, e.flags),
      lane: lane.id,
      generation,
      head: p.head,
      verdict: input.verdict,
      scope: input.scope,
      dependsOn: input.dependsOn ?? [],
      text: input.text,
      fulfils,
    };
    this.reviews.push(review);
    if (latest && input.verdict === "approve") {
      for (const o of qualifying) {
        o.evidence.push(evidence);
        if (this.oblState(o) === "met") {
          delete o.reopened;
          fulfils.push({ obligation: o.id, evidence });
          this.resolve((a) => "obligation" in a.item && a.item.obligation === o.id && a.item.lane === lane.id);
        }
      }
    }
    if (input.verdict === "object" && lane.holder) {
      this.notify(lane.holder, { why: "objection", proposal: { lane: lane.id, generation }, review: e.id, lane: lane.id, seq: e.seq, text: `${by} objected to generation ${generation}. Answer it with a new generation.` });
    }
    this.resolve((a) => a.to === by && a.item.lane === lane.id && (a.item.why === "note" || a.item.why === "policy"));
    this.why(e.id, e.seq, by, `${by} ${verb} generation ${generation}`, "accepted", [], [
      { rule: "R-OBL-1", held: true, detail: `Bound to generation ${generation} at head ${p.head.slice(0, 7)}.` },
      { rule: "R-OBL-2", held: true, detail: `${by} qualifies through ${qualifying.map((o) => (o.spec.kind === "review" ? o.spec.from.join(", ") : "")).join("; ")}.` },
    ]);
    return review;
  }

  // ------------------------------------------------------------- checks

  check(by: MemberId, tag: string, generation: Generation, ok: boolean, detail: string, landOp?: OpId) {
    const lane = this.lane(tag);
    const p = this.prop(tag, generation)!;
    const o = p.obligations.find((x) => x.spec.kind === "check")!;
    const op = landOp ? this.ops.get(landOp) : undefined;
    const integration = op && "integration" in op && op.integration ? op.integration : p.preview.state === "clean" ? p.preview.integration : p.head;
    const e = this.entry("act", "check", by, `${by} ran tests on generation ${generation} of ${quote(lane.goal)}${landOp ? " for landing" : ""}: ${ok ? "passed" : "failed"}.`, { lane: lane.id });
    const evidence: Evidence = { basis: "here", act: e.id, kind: "check", generation, head: p.head };
    o.evidence = landOp ? [evidence] : [...o.evidence, evidence];
    delete o.reopened;
    const check: Check = {
      ...this.base("check", e.id, e.seq, by, e.after, e.flags),
      lane: lane.id,
      generation,
      obligation: o.id,
      check: "tests",
      integration,
      input: { kind: "tree", tree: fakeSha(`tree:${integration}`) },
      config: CONFIG,
      runner: RUNNER,
      volatile: false,
      ok,
      detail,
      ...(landOp ? { landOp } : {}),
    };
    this.checks.push(check);
    this.resolve((a) => a.item.why === "check-requested" && a.item.lane === lane.id);
    this.why(e.id, e.seq, by, `${by} ran tests on generation ${generation}`, "accepted", [], [
      { rule: "R-OBL-3", held: true, detail: `Bound to integration ${integration.slice(0, 7)}, the configuration and the runner digest.` },
    ]);
  }

  // -------------------------------------------------------------- notes

  note(by: MemberId, anchor: NoteAnchor, text: string, replyTo?: ActId): Note {
    const laneId = "lane" in anchor ? anchor.lane : this.feed.find((f) => f.id === anchor.act)?.lane;
    const tag = laneId ? this.tagOf(laneId) : undefined;
    const lane = tag ? this.lane(tag) : undefined;
    const where = "path" in anchor ? ` on ${anchor.path}:${anchor.line}` : "";
    const e = this.entry("act", "note", by, `${by} ${replyTo ? "replied" : "wrote a note"}${where}${lane ? ` in ${quote(lane.goal)}` : ""}.`, lane ? { lane: lane.id } : {});
    const note: Note = { ...this.base("note", e.id, e.seq, by, e.after, e.flags), anchor, text, ...(replyTo ? { replyTo } : {}) };
    this.notes.push(note);
    if (lane && lane.holder === by) this.renew(lane);
    if (replyTo) {
      const parent = this.notes.find((n) => n.id === replyTo);
      const to = parent?.by.member;
      if (to && to !== by) {
        this.notify(to, { why: "note", note: e.id, replyTo, ...(lane ? { lane: lane.id } : {}), seq: e.seq, text: `${by} replied to your note${where}. Read the reply.` });
      }
    }
    this.why(e.id, e.seq, by, `${by} wrote a note`, "accepted", [], [{ rule: "R-SEC-1", held: true, detail: "Scanned for secrets before it was recorded." }]);
    return note;
  }

  // ------------------------------------------------------------ landing

  private opFields(op: LandOp) {
    const { id, kind, lane, generation, head, act, leaseGeneration, expectedMain, policyVersion, attempts } = op;
    return { id, kind, lane, generation, head, act, leaseGeneration, expectedMain, policyVersion, attempts, updatedAt: at(this.t) };
  }

  landOp(tag: string): LandOp {
    const id = this.lane(tag).landing;
    return this.ops.get(id!)!;
  }

  land(by: MemberId, tag: string): OpId {
    const lane = this.lane(tag);
    const p = this.prop(tag)!;
    const e = this.entry("act", "land", by, `${by} asked to land generation ${p.generation} of ${quote(lane.goal)}.`, { lane: lane.id });
    const id: OpId = `op_land_${e.seq}`;
    this.ops.set(id, {
      id,
      kind: "land",
      updatedAt: at(this.t),
      lane: lane.id,
      generation: p.generation,
      head: p.head,
      act: e.id,
      leaseGeneration: lane.leaseGen,
      expectedMain: this.main,
      policyVersion: this.policyVersion,
      attempts: 0,
      state: "accepted",
    });
    lane.landing = id;
    this.renew(lane);
    this.why(e.id, e.seq, by, `${by} asked to land generation ${p.generation}`, "accepted", [this.decision("objection-open", "land", { result: "pass" })], [
      { rule: "R-LAND-1", held: true, detail: "The landing operation was written before any external I/O." },
      { rule: "R-LANE-10", held: true, detail: "No other landing is in flight on this lane." },
    ]);
    return id;
  }

  prepare(tag: string) {
    const op = this.landOp(tag);
    const f = this.opFields(op);
    const lane = this.lane(tag);
    const waiting = f.expectedMain !== this.main ? ["obl_tests" as const] : [];
    this.ops.set(op.id, { ...f, expectedMain: this.main, attempts: f.attempts + 1, state: "preparing", waiting });
    if (f.attempts > 0) {
      this.entry("system", "land-retry", null, `Main moved, so ${quote(lane.goal)} is preparing again on the new main (attempt ${f.attempts + 1}). Its checks run again.`, { lane: lane.id });
    }
  }

  ready(tag: string) {
    const op = this.landOp(tag);
    const p = this.prop(tag)!;
    const evidence = p.obligations.flatMap((o) => o.evidence.map((e) => e.act));
    this.ops.set(op.id, {
      ...this.opFields(op),
      state: "ready",
      integration: fakeSha(`land:${op.id}:${this.main}`),
      evidence,
      landInput: `sha256:${fakeSha(`li:${op.id}`)}${fakeSha(`li2:${op.id}`).slice(0, 24)}`,
    });
  }

  reserve(tag: string) {
    const op = this.landOp(tag);
    if (op.state !== "ready") throw new Error("reserve needs ready");
    const lane = this.lane(tag);
    const publication = (this.slot.state === "free" ? this.slot.last : this.slot.publication) + 1;
    const e = this.entry("system", "land-reserved", null, `Landing of ${quote(lane.goal)} reserved at entry ${this.seq}: publication ${publication}.`, { lane: lane.id });
    this.ops.set(op.id, { ...this.opFields(op), state: "publishing", integration: op.integration, evidence: op.evidence, publication, reservedAt: e.seq, pushes: 1 });
    this.slot = { state: "held", op: op.id, publication, reservedAt: e.seq };
  }

  unresolved(tag: string) {
    const op = this.landOp(tag);
    if (op.state !== "publishing") throw new Error("unresolved needs publishing");
    const lane = this.lane(tag);
    const e = this.entry("system", "publication-unresolved", null, `Publication ${op.publication} is unresolved: Artifacts did not answer, and main still reads as before. The room keeps pushing the same commit forward.`, { lane: lane.id });
    const { integration, evidence, publication, reservedAt } = op;
    this.ops.set(op.id, { ...this.opFields(op), state: "unresolved", integration, evidence, publication, reservedAt, since: at(this.t), readBack: { main: "expected-main" } });
    if (this.slot.state === "held") this.slot = { ...this.slot, unresolvedSince: at(this.t) };
    for (const m of PEOPLE.filter((x) => x.role === "admin")) {
      this.notify(m.handle, { why: "publication-unresolved", op: op.id, since: at(this.t), lane: lane.id, seq: e.seq, text: `Publication ${publication} of ${quote(lane.goal)} is unresolved. Check that it completes; later landings wait behind it.` });
    }
  }

  landed(tag: string) {
    const op = this.landOp(tag);
    if (op.state !== "publishing" && op.state !== "unresolved") throw new Error("landed needs a held slot");
    const lane = this.lane(tag);
    const e = this.entry("system", "land-outcome", null, `${quote(lane.goal)} landed: main is now ${op.integration.slice(0, 7)} (publication ${op.publication}).`, { lane: lane.id });
    const { integration, evidence, publication, reservedAt } = op;
    this.ops.set(op.id, { ...this.opFields(op), state: "landed", integration, evidence, publication, reservedAt, receipt: e.id });
    this.slot = { state: "free", last: publication };
    this.main = integration;
    this.mainMovedAt = this.t;
    const g = lane.generations.find((x) => x.generation === op.generation)!;
    g.landed = { commit: integration, at: e.seq };
    delete lane.landing;
    this.resolve((a) => a.item.why === "publication-unresolved" && a.item.op === op.id);
    const settled: AttentionItem["why"][] = ["policy", "review-requested", "evidence-invalidated", "check-requested", "note"];
    this.resolve((a) => a.item.lane === lane.id && settled.includes(a.item.why));
    if (lane.holder) {
      this.notify(lane.holder, { why: "land-outcome", op: op.id, state: "landed", lane: lane.id, seq: e.seq, text: `${quote(lane.goal)} landed. Release the lane.` });
    }
  }

  // ------------------------------------------------------------- leases

  leaseWarning(tag: string) {
    const lane = this.lane(tag);
    if (!lane.holder) return;
    this.notify(lane.holder, { why: "lease-expiring", lane: lane.id, expiresAt: at(lane.expiresAt), seq: this.seq - 1, text: `Your lease on ${quote(lane.goal)} ends soon. Renew it or release the lane.` });
  }

  expire(tag: string) {
    const lane = this.lane(tag);
    const holder = lane.holder!;
    const e = this.entry("system", "lease-expired", null, `${holder}'s lease on ${quote(lane.goal)} expired. The room ended its write access. There is no handover note.`, { lane: lane.id });
    lane.holder = null;
    lane.unheldWhy = "expired";
    this.resolve((a) => a.to === holder && a.item.lane === lane.id);
    for (const m of PEOPLE) {
      if (m.handle === holder || m.kind === "service") continue;
      this.notify(m.handle, { why: "lane-unheld", lane: lane.id, reason: "expired", seq: e.seq, text: `Nobody holds ${quote(lane.goal)} now. Decide whether someone should take it over.` });
    }
  }

  release(by: MemberId, tag: string, note?: string) {
    const lane = this.lane(tag);
    const e = this.entry("act", "release", by, `${by} released ${quote(lane.goal)}${note ? ` with a handover note: “${note}”` : "."}`, { lane: lane.id });
    lane.holder = null;
    lane.unheldWhy = "released";
    if (note) lane.handover = e.id;
    this.resolve((a) => a.to === by && a.item.lane === lane.id);
  }

  previewConflict(tag: string, paths: RepoPath[]) {
    const lane = this.lane(tag);
    const p = this.prop(tag)!;
    p.preview = { id: p.preview.id, kind: "preview", updatedAt: at(this.t), lane: lane.id, generation: p.generation, state: "conflict", base: this.main, paths };
    // A head known to conflict cannot land: stop asking anyone to review it (plan section 12).
    this.resolve((a) => "proposal" in a.item && a.item.proposal.lane === lane.id && a.item.proposal.generation === p.generation && a.item.why !== "objection");
    this.resolve((a) => a.item.why === "policy" && a.item.lane === lane.id);
    const e = this.entry("system", "preview", null, `Main moved. Generation ${p.generation} of ${quote(lane.goal)} now conflicts with main on ${paths.join(", ")}.`, { lane: lane.id });
    const unheld = lane.holder === null;
    this.resolve((a) => a.item.why === "lane-unheld" && a.item.lane === lane.id);
    const to = unheld ? PEOPLE.filter((m) => m.kind !== "service" && m.handle !== p.by).map((m) => m.handle) : [lane.holder!];
    for (const m of to) {
      this.notify(m, {
        why: "recut-needed",
        lane: lane.id,
        op: p.preview.id,
        unheld,
        seq: e.seq,
        text: unheld ? `${quote(lane.goal)} conflicts with main and nobody holds it. Someone needs to take it over and recut it.` : `Recut ${quote(lane.goal)} on main.`,
      });
    }
  }

  previewPending(tag: string) {
    const p = this.prop(tag)!;
    p.preview = { id: p.preview.id, kind: "preview", updatedAt: at(this.t), lane: p.lane, generation: p.generation, state: "pending" };
  }

  // ----------------------------------------------------------- snapshot

  private buildObligation(o: OblRec): Obligation {
    const base = { id: o.id, rule: o.rule, policy: this.policyVersion, paths: o.paths };
    const kind = o.spec.kind === "review"
      ? { ...base, kind: "review" as const, from: o.spec.from, count: o.spec.count, allowSelf: o.spec.allowSelf }
      : { ...base, kind: "check" as const, check: o.spec.check, by: o.spec.by };
    const state = this.oblState(o);
    return state === "met"
      ? ({ ...kind, state: "met", evidence: o.evidence } as Obligation)
      : ({ ...kind, state: "open", evidence: o.evidence, ...(o.reopened ? { reopened: o.reopened } : {}) } as Obligation);
  }

  private buildProposal(p: PropRec): Proposal {
    return {
      ...this.base("propose", p.id, p.seq, p.by, p.after, p.flags),
      at: at(p.t),
      lane: p.lane,
      generation: p.generation,
      head: p.head,
      base: p.base,
      pinnedRef: `refs/artroom/heads/${p.lane}/${p.generation}`,
      summary: p.summary,
      changed: p.changed,
      obligations: p.obligations.map((o) => this.buildObligation(o)),
      notCarried: p.notCarried,
      preview: p.preview,
      ...(p.because ? { because: p.because } : {}),
    };
  }

  private buildLane(l: LaneRec): Lane {
    const overlaps: Overlap[] = [];
    if (this.isActive(l)) {
      for (const other of this.lanes.values()) {
        if (other === l || !this.isActive(other)) continue;
        for (const o of this.laneOverlaps(l.scope, other.scope)) overlaps.push({ lane: other.id, holder: other.holder, ...o });
      }
    }
    const base = {
      lane: l.id,
      purpose: "ordinary" as const,
      goal: l.goal,
      scope: l.scope,
      generation: l.generation,
      generations: l.generations.map((g) => ({ generation: g.generation, head: g.head, act: g.act, ...(g.landed ? { landed: { commit: g.landed.commit, at: g.landed.at } } : {}) })),
      overlaps,
      ...(l.plan ? { plan: l.plan } : {}),
      ...(l.landing ? { landing: l.landing } : {}),
    };
    return l.holder
      ? { ...base, state: "held", lease: { holder: l.holder, generation: l.leaseGen, expiresAt: at(l.expiresAt) } }
      : { ...base, state: "unheld", lease: null, leaseGeneration: l.leaseGen, why: l.unheldWhy ?? "released", ...(l.handover ? { handover: l.handover } : {}) };
  }

  snapshot(viewer: MemberId): RoomSnapshot {
    const head = this.seq - 1;
    return {
      room: { id: ROOM_ID, name: "acme/web" },
      now: at(this.t),
      viewer,
      people: PEOPLE,
      main: { head: this.main, movedAt: at(this.mainMovedAt) },
      lanes: [...this.lanes.values()].map((l) => this.buildLane(l)),
      proposals: this.proposals.map((p) => this.buildProposal(p)),
      reviews: [...this.reviews],
      checks: [...this.checks],
      notes: [...this.notes],
      landOps: [...this.ops.values()],
      slot: this.slot,
      attention: this.attention.filter((a) => a.to === viewer).map((a) => a.item),
      feed: [...this.feed],
      log: { head, publishedThrough: this.publishedThrough },
      policy: { version: this.policyVersion, activatedAt: 1, document: POLICY, outcomes: [...this.outcomes] },
      source: { kind: "mock", status: "live", note: "Scripted scenario" },
    };
  }

  whyOf(act: ActId): Why | null {
    const w = this.whys.get(act);
    return w ? { ...w, published: w.seq <= this.publishedThrough } : null;
  }

  changedSince(lane: ActId, generation: Generation): RepoPath[] | null {
    const p = this.proposals.find((x) => x.lane === lane && x.generation === generation);
    return p ? p.since : null;
  }

  cursor() {
    return cursorAt(this.seq);
  }
}
