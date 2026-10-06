/**
 * One fixture for the tests of the token ledger at a real scope: a lane on
 * real Durable Object storage that runs the capability's code, as the
 * production ports hold it, with the git package's token driver as its port
 * for outside effects.
 *
 * What is real: the scope, its storage, its commit protocol and its alarm;
 * the code of `hold@1`, with its steps and the rules of its operations; the
 * operations driver; and `TokenDriver`. What is a STAND-IN, and proves only
 * the boundary it exposes:
 *
 * - `TokenHost` and `Vault`, of the git package's test support, for the Git
 *   host and for the gateway's side of the handoff.
 * - `Stager`, below, for the one request of an attempt of a staging. Nothing
 *   here creates a ref or reads a repository: a test writes the answer.
 * - The test authority and the scripted clock, as in every test here.
 *
 * The git package's stand-ins are imported by their path: that package
 * exports no test support, and its manifest is not this step's to change.
 */

import type { Answer, Entry, OperationId, Read } from "@generalbusiness/artroom-contract";
import { TokenDriver } from "@generalbusiness/artroom-git";
import { variant } from "@generalbusiness/artroom-derive/testing";
// I3 merge: from the git package's `./testing` export, once its manifest has one and the scope's manifest names the package.
import { TokenHost, Vault } from "../../git/test/support/tokens.ts";
import { CAPABILITY_CODE, type Diagnosis, type EffectAnswer, type EffectRequest, type OperationStatus, type Outside } from "../src/index.ts";
import { controls } from "../src/testing.ts";
import { wired } from "./outside.ts";
import { Lane, START, at, definition, founding, reader, stubOf, una } from "./support.ts";

/** The fixture lane with one form of `hold@1`, so that its holds have a workspace, and a report that names its commit, as `report` of `issue` does. */
export const staged = variant(definition.declared, (def) => {
  // The fixture's acts share one object of fields, so the report gets its own.
  def.acts.report.fields = { ...def.acts.report.fields, commit: { type: "commit", required: true } };
  def.acts.report.guards.push({ capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } });
});

/** A STAND-IN for whatever sends the request of an attempt of a staging: it answers what the test wrote for that attempt, or fails as the test said. */
export class Stager {
  readonly sent: string[] = [];
  readonly answers = new Map<string, EffectAnswer | { throws: unknown }>();
  send(request: EffectRequest): Promise<EffectAnswer | null> {
    const key = `${request.operation}#${request.attempt}`;
    this.sent.push(key);
    const answer = this.answers.get(key) ?? null;
    return answer !== null && "throws" in answer ? Promise.reject(answer.throws) : Promise.resolve(answer);
  }
}

type Surface = { effect(): Promise<number>; operation(reader: unknown, id: OperationId): Promise<Read<OperationStatus>>; operations(reader: unknown, cursor?: string, open?: boolean): Promise<Read<readonly OperationStatus[]>> };

export class Hosted {
  readonly host = new TokenHost();
  readonly vault = new Vault();
  readonly stager = new Stager();
  /** Every diagnosis of the scope, and every line of the token driver's log, in order. */
  readonly diagnoses: Diagnosis[] = [];
  readonly log: string[] = [];
  /** The driver of the object's present life. A restart makes another, which holds nothing. */
  driver!: TokenDriver;
  /** The founded lane. */
  s!: Lane;

  /** The ports of one life of the object. */
  ports() {
    const driver = (this.driver = new TokenDriver({ host: this.host, custody: this.vault, log: (e) => this.log.push(`${e.step} ${e.event}`) }));
    const outside: Outside = {
      accepts: (owner, kind) => driver.accepts(owner, kind) || (owner === "hold@1" && kind === "stage"),
      send: (request) => (request.kind === "stage" ? this.stager.send(request) : driver.send(request)),
      late: (deliver) => driver.late(deliver),
      judged: (attempt, sealed) => driver.judged(attempt, sealed),
    };
    return { capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, outside, diagnoses: (d: Diagnosis) => { this.diagnoses.push(d); } };
  }

  get surface(): Surface { return this.s.object as unknown as Surface; }
  /** Let the operations driver do what is due, until nothing is. */
  async drain(): Promise<void> { while ((await this.surface.effect()) > 0) { /* each pass may make the next one due */ } }
  async seen(id: OperationId): Promise<OperationStatus> {
    const read = await this.surface.operation(reader, id);
    if (!read.ok) throw new Error(`no operation ${id}: ${read.reason}`);
    return read.value;
  }
  /** The operations that are not settled: the duties this scope holds. */
  async duties(): Promise<string[]> {
    const read = await this.surface.operations(reader, undefined, true);
    if (!read.ok) throw new Error(`no operations: ${read.reason}`);
    return read.value.map((o) => `${o.operation.id} ${o.operation.kind} ${o.state}`);
  }
  /** The latest state of each `token` record, by its number, from the scope's own entries. */
  async tokens(): Promise<Record<number, string>> {
    const states: Record<number, string> = {};
    for (const entry of await this.s.entries()) for (const e of entry.effects) if (e.effect === "record" && e.kind === "token") states[e.key[0] as number] = e.state;
    return states;
  }
  /** One step of `hold@1`, asked by una with the intent that it prepares for. */
  step(step: string, kind: string, fields: Record<string, unknown>, expected: Record<string, number> = {}): Promise<Answer> {
    return this.s.stub.prepare(this.s.intent(una, kind, { fields: fields as never, expected }), this.s.grants(), "hold@1", step);
  }
  /** That request's own answer, which the stand-in host kept when its reply was lost, delivered to the driver in the object's memory. */
  redeliver(call: "mint" | "revoke", token: number): Promise<unknown> {
    const lost = this.host.reply.get(`${call} ${token}`)!;
    return this.s.inside(() => this.driver.answered(lost.ask, lost.reply));
  }
}

/** A commit ID: forty of one hex digit. */
export const C = (digit: string): string => digit.repeat(40);

/**
 * A founded lane on the capability's code, with a held hold of una's, its
 * current instance `i1`, and the entry of the step `stage` for a report of
 * commit `a`: a root that is `creating`, the two tokens of attempt 1, each
 * `minting`, and their operations. `before` runs when the scope is founded
 * and nothing is opened, so a test can set the host's faults first: the
 * driver sends what an entry opened as soon as that entry is committed.
 */
export async function hosted(before: (h: Hosted) => void = () => undefined): Promise<{ h: Hosted; prepared: Entry; stage: OperationId; mints: [OperationId, OperationId] }> {
  const { signed, name } = founding(at(60), staged);
  const c = controls(name, START);
  const h = new Hosted();
  wired.set(name, () => h.ports());
  const founded = await stubOf(name).found(signed, staged.declared);
  if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
  const lane = (h.s = new Lane(name, c, founded.receipt.fact.at, founded.receipt, signed));
  before(h);
  const commitment = await lane.commitment();
  const hold = (await lane.did(una, "take-hold", { fields: { commitment }, expected: { commitment: 2 } })).fact.seq;
  const accepted = async (answer: Promise<Answer>) => { const a = await answer; if (a.answer !== "accepted") throw new Error(`a step was not accepted: ${JSON.stringify(a)}`); return a.receipt.fact.seq; };
  await accepted(h.step("instance", "hold@1:instance", { hold, task: { ...lane.at, kind: "task" }, instance: "i1" }));
  const seq = await accepted(h.step("stage", "report", { commitment, commit: C("a") }, { commitment: 2 }));
  await h.drain();
  const [prepared] = await lane.entries(seq);
  return { h, prepared: prepared!, stage: `${seq}:0`, mints: [`${seq}:1`, `${seq}:2`] };
}
