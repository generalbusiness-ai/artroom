/** The destination's reading of the pinned change lane's retained entries (authority revision 28, sections 3.3 and 6.5). */
import type { Entry, FactRef, KeyId, MemberId, RulesObservation } from "@generalbusiness/artroom-contract";
import { canonicalize, isMemberRef } from "@generalbusiness/artroom-bytes";
import type { RuleGiven } from "@generalbusiness/artroom-derive";
import type { LaneRead } from "./destination.ts";
import type { EditFile, Statement } from "./reservation.ts";

const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const of = (given: Pick<RuleGiven, "uses">, fact: FactRef): Entry | null => given.uses.find((copy) => same(copy.fact, fact))?.entry ?? null;
const fields = (entry: Entry | null, kind: string) => entry?.input.type === "act" && entry.input.signed.intent.kind === kind ? entry.input.signed.intent.fields : null;
const actor = (entry: Entry | null): KeyId | null => entry?.input.type === "act" ? entry.input.signed.intent.actor : null;
const signer = (entry: Entry | null) => entry?.input.type === "act" ? entry.input.authority[0]?.subject ?? null : null;
const held = (entry: Entry, slot: string) => entry.effects.find((effect) => effect.effect === "value" && effect.item === entry.seq && effect.slot === slot);

/** Each recorded addition to the manifest's authors party list, and its integrator, once. Attribution records ordinary list effects. */
export function manifestAuthors(entry: Entry): MemberId[] {
  const authors = entry.effects.flatMap((effect) => effect.effect === "list" && effect.item === entry.seq && effect.slot === "authors" && effect.change === "add" ? [effect.member.member] : []);
  const integrator = entry.effects.find((effect) => effect.effect === "party" && effect.item === entry.seq && effect.slot === "integrator");
  if (integrator?.effect === "party" && integrator.member) authors.push(integrator.member.member);
  else { const by = signer(entry); if (by) authors.push(by.member); }
  return [...new Set(authors)];
}

/** The act of the pinned `change` lane that opens a one-file manifest (i5 edit). */
export const PROPOSE_FILE = "propose-file";

/** The one-file manifest that an entry of the change lane opens, as its signed intent holds it, or null when it is no `propose-file` entry or its fields are out of form. */
export function fileOf(entry: Entry | null | undefined): EditFile | null {
  const proposed = fields(entry ?? null, PROPOSE_FILE);
  if (!proposed) return null;
  const { path, digest, size, content } = proposed;
  return typeof path === "string" && typeof digest === "string" && typeof size === "number" && typeof content === "string" ? { path, digest, size, content } : null;
}

/** Read the statement from its retained entries, and compare each listed check against the currently observed rules. Nothing is fetched here. */
export function readLane(given: Pick<RuleGiven, "uses" | "observed">, statement: Statement, rules: RulesObservation | null): LaneRead | null {
  const [merge, manifest] = [of(given, statement.operation), of(given, statement.manifest)];
  const merged = fields(merge, "merge");
  const file = fileOf(manifest);
  const proposed = file ? fields(manifest, PROPOSE_FILE) : fields(manifest, "propose-manifest");
  if (!manifest || !merged || !proposed) return null;
  // A one-file manifest names no integration commit and no tree: the rule `judge` derives both from the host's evidence.
  const { base, integration = null, tree = null } = proposed;
  const complete = file ? true : proposed["complete"];
  if (typeof base !== "string" || (file === null && (typeof integration !== "string" || typeof tree !== "string")) || typeof complete !== "boolean") return null;
  const checks = rules?.content.asked === "rules" ? rules.content.checks : [];
  return {
    sound: merged["manifest"] === statement.manifest.seq,
    manifest: { base, integration: integration as string | null, tree: tree as string | null, file, complete, authors: manifestAuthors(manifest) },
    verdicts: statement.verdicts.map((verdict) => {
      const review = of(given, verdict.review);
      const reviewed = fields(review, "review-verdict");
      return { sound: !!reviewed && reviewed["manifest"] === statement.manifest.seq && reviewed["verdict"] === verdict.verdict && same(signer(review), verdict.reviewer), key: actor(review) };
    }),
    checks: Object.fromEntries(statement.jobs.map((job) => {
      const [opening, deciding] = [of(given, job.job), job.decidedBy ? of(given, job.decidedBy) : null];
      const [opened, decided] = [fields(opening, "request-check"), fields(deciding, "check")];
      const required = checks.find((check) => check.name === job.name);
      const assigned = opened?.["configuration"];
      const storedTree = opening ? held(opening, "tree") : null;
      const sound = !!opened && opened["manifest"] === statement.manifest.seq && opened["name"] === job.name && storedTree?.effect === "value" && storedTree.value === tree;
      const states = deciding?.effects.filter((effect) => effect.effect === "state" && effect.state === "passed") ?? [];
      const grant = deciding?.input.type === "act" ? deciding.input.authority.find((authority) => authority.actions.includes("change.check")) : undefined;
      const key = actor(deciding);
      const counted = required !== undefined && job.state === "passed" && statement.jobs.filter((listed) => listed.name === job.name).length === 1;
      const observed = counted && key !== null ? given.observed({ key })?.observation : null;
      // The rules answer projects its checker to a MemberId. The destination's current key observation supplies the full
      // membership reference, including its incarnation; the historical signing subject and grant must both name that member.
      const checker = required && observed && !("subject" in observed) && observed.key === key && observed.member === required.checker ? { membership: observed.of, member: required.checker } : null;
      const proved = !!decided && !!required && decided["job"] === job.job.seq && decided["tree"] === tree && decided["configuration"] === assigned && decided["outcome"] === "passed"
        && states.length === 1 && states[0]?.effect === "state" && states[0].item === job.job.seq && checker !== null && same(signer(deciding), checker)
        && !!grant && grant.key === key && grant.fresh !== null && !("subject" in grant.fresh.observation) && grant.fresh.observation.key === key
        && grant.fresh.observation.actions.includes("change.check") && grant.fresh.observation.member === required.checker && same(grant.fresh.observation.of, checker.membership)
        && isMemberRef(grant.subject) && same(grant.subject, checker);
      return [job.name, { opening: !sound ? "unsound" : !required || assigned !== required.configuration ? "other-configuration" : "sound", deciding: proved, key: actor(deciding) }];
    })),
  };
}

/** Keys of the approving verdicts and of passed live jobs for every listed check; the second step reads no retained value. */
export function decidingKeys(given: Pick<RuleGiven, "uses">, statement: Statement, rules: RulesObservation | null): KeyId[] {
  const checks = rules?.content.asked === "rules" ? rules.content.checks : [];
  return [
    ...statement.verdicts.filter((verdict) => verdict.verdict === "approve").map((verdict) => actor(of(given, verdict.review))),
    ...checks.flatMap((check) => { const jobs = statement.jobs.filter((job) => job.name === check.name); const job = jobs.length === 1 ? jobs[0] : null; return job?.state === "passed" && job.decidedBy ? [actor(of(given, job.decidedBy))] : []; }),
  ].filter((key): key is KeyId => key !== null);
}
