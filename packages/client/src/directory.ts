/** Bounded advisory navigation for the explicit partition cohort. These
 * reads locate indexes; they do not attest Native provenance or grant acts. */
import type { Head, Item, ItemQuery, ItemQueryRead, Read, ScopeId, ScopeRef, Summary } from "@generalbusiness/dap-contract";
import { canonicalize, isScopeRef, itemQueryReadFor, utf8, within, LATE } from "@generalbusiness/artroom-bytes";

const ROOT = "platform:directory@10", PARTITION = "platform:directory-partition@1";
/** Logical data calls and admitted decoded reply bytes. Session acquisition,
 * transport retries and parser residency are not a wire or heap claim. */
export const DIRECTORY_READ_BOUNDS = Object.freeze({ calls: 32, bytes: 8 * 1024 * 1024, milliseconds: 10_000, pagesPerSelection: 4 });
const REPLY_BYTES = 256 * 1024;
export interface DirectoryReader {
  summary(scope: ScopeId): Promise<Read<Summary>>;
  query(scope: ScopeId, query: ItemQuery): Promise<ItemQueryRead>;
}
export interface DirectoryIndex {
  ref: ScopeRef;
  at: Head;
  summary: Summary;
  control: Item;
  lanes: readonly Item[];
  applications: readonly Item[];
}
export interface DirectoryInventory {
  indexes: readonly DirectoryIndex[];
  /** Each index keeps its own head; there is no invented common snapshot. */
  rootAt: Head | null;
  complete: boolean;
  reason: string | null;
  calls: number;
}
class Incomplete extends Error {}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);

/** One operation shares all page, byte and time allowances. Reads are
 * sequential. Logical expiry cannot cancel an uncooperative transport. */
async function operation<T>(work: (read: <V>(task: () => Promise<V>) => Promise<V>) => Promise<T>): Promise<{ value?: T; reason: string | null; calls: number }> {
  let calls = 0, bytes = 0;
  const deadline = Date.now() + DIRECTORY_READ_BOUNDS.milliseconds;
  const result = await within(DIRECTORY_READ_BOUNDS.milliseconds / 1000, async signal => {
    const expired = () => signal.aborted || Date.now() >= deadline;
    const read = async <V>(task: () => Promise<V>): Promise<V> => {
      if (expired()) throw new Incomplete("deadline");
      if (calls >= DIRECTORY_READ_BOUNDS.calls || bytes + REPLY_BYTES > DIRECTORY_READ_BOUNDS.bytes) throw new Incomplete("read-budget");
      calls++; bytes += REPLY_BYTES;
      const value = await task();
      if (expired()) throw new Incomplete("deadline");
      if (utf8(canonicalize(value)).length > REPLY_BYTES) throw new Incomplete("reply-too-large");
      if (expired()) throw new Incomplete("deadline");
      return value;
    };
    try { const value = await work(read); if (expired()) throw new Incomplete("deadline"); return { value, reason: null }; }
    catch (error) { return { reason: error instanceof Incomplete ? error.message : "unavailable" }; }
  });
  return result === LATE ? { reason: "deadline", calls } : { ...result, calls };
}
type BoundedRead = Parameters<Parameters<typeof operation>[0]>[0];

async function summary(reader: DirectoryReader, read: BoundedRead, ref: ScopeRef, pin: string): Promise<{ value: Summary; at: Head; control: Item }> {
  const result = await read(() => reader.summary(ref.scope));
  if (!result.ok) throw new Incomplete(result.reason);
  // Summary's bounded prefix must contain the singleton control; no lane
  // inventory is inferred from that prefix or its completeness flag.
  const control = result.value.items.find(item => item.id === 0 && item.type === "repository" && item.state === "open");
  if (!same(result.value.scope, ref) || result.value.status !== "active" || result.value.definition !== pin || !control) throw new Incomplete("directory-mismatch");
  return { value: result.value, at: result.at, control };
}
async function selection(reader: DirectoryReader, read: BoundedRead, ref: ScopeRef, type: string, states: readonly string[], at?: Head, limit = 100): Promise<{ items: Item[]; at: Head }> {
  let cursor: string | null = null, head = at;
  const items: Item[] = [];
  for (let page = 0; page < DIRECTORY_READ_BOUNDS.pagesPerSelection; page++) {
    const query: ItemQuery = { v: 1, scope: ref, type, states, ids: null, limit, cursor };
    const result = await read(() => reader.query(ref.scope, query));
    if (!itemQueryReadFor(result, query)) throw new Incomplete("invalid-index");
    if (!result.ok) throw new Incomplete(result.reason);
    if (!same(result.value.scope, ref) || head && !same(result.at, head)) throw new Incomplete("head-changed");
    head = result.at;
    for (const item of result.value.items) {
      if (item.type !== type || !states.includes(item.state) || items.some(prior => prior.id >= item.id)) throw new Incomplete("invalid-index");
      items.push(item);
    }
    if (result.complete && result.next === undefined) return { items, at: head };
    if (typeof result.next !== "string" || result.next === cursor) throw new Incomplete("incomplete-index");
    cursor = result.next;
  }
  throw new Incomplete("page-budget");
}
function affiliated(control: Item, root: ScopeRef, membership: ScopeRef): void {
  if (!same(control.refs["root"], root) || !same(control.refs["membership"], membership)) throw new Incomplete("partition-affiliation-mismatch");
}

/** Locate the current opening target. No partition is opened or sealed;
 * pending, exhaustion and native refusal remain explicit caller outcomes. */
export async function activeDirectory(reader: DirectoryReader, root: ScopeRef, membership: ScopeRef): Promise<{ ref?: ScopeRef; at?: Head; reason: string | null }> {
  const result = await operation(async read => {
    const held = await summary(reader, read, root, ROOT);
    if (!same(held.control.refs["membership"], membership)) throw new Incomplete("membership-mismatch");
    const rows = await selection(reader, read, root, "partition", ["active", "creating"], held.at, 2);
    if (rows.items.length !== 1 || rows.items[0]!.state !== "active") throw new Incomplete(rows.items.some(row => row.state === "creating") ? "partition-pending" : rows.items.length > 1 ? "partition-conflict" : "no-active-partition");
    const ref = rows.items[0]!.refs["scope"];
    if (!isScopeRef(ref) || ref.kind !== "directory") throw new Incomplete("partition-mismatch");
    const part = await summary(reader, read, ref, PARTITION);
    affiliated(part.control, root, membership);
    if (part.control.values["sealed"] !== false) throw new Incomplete("partition-sealed");
    return { ref, at: part.at };
  });
  return { ...result.value, reason: result.reason };
}

/** Read complete selected lane/application prefixes under finite shared
 * limits. If any index is incomplete, callers must expose that condition;
 * already collected indexes are advisory and cannot prove absence. */
export async function partitionIndexes(reader: DirectoryReader, root: ScopeRef, membership: ScopeRef): Promise<DirectoryInventory> {
  const indexes: DirectoryIndex[] = [];
  let rootAt: Head | null = null;
  const result = await operation(async read => {
    const held = await summary(reader, read, root, ROOT); rootAt = held.at;
    if (!same(held.control.refs["membership"], membership)) throw new Incomplete("membership-mismatch");
    const rows = await selection(reader, read, root, "partition", ["active", "sealed"], held.at);
    const seen = new Set<ScopeId>();
    for (const row of rows.items) {
      const ref = row.refs["scope"];
      if (!isScopeRef(ref) || ref.kind !== "directory" || seen.has(ref.scope)) throw new Incomplete("partition-mismatch");
      seen.add(ref.scope);
      const part = await summary(reader, read, ref, PARTITION);
      affiliated(part.control, root, membership);
      const lanes = await selection(reader, read, ref, "lane", ["listed"], part.at);
      const applications = await selection(reader, read, ref, "application", ["conflict", "created", "creating", "refused"], part.at);
      indexes.push({ ref, at: part.at, summary: part.value, control: part.control, lanes: lanes.items, applications: applications.items });
    }
  });
  return { indexes, rootAt, complete: result.reason === null, reason: result.reason, calls: result.calls };
}
