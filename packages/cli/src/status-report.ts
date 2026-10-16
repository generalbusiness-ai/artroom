/** Bounded operational readings. Each column owns its native head. */
import type { Head, Read, ScopeId } from "@generalbusiness/dap-contract";
import { isScopeRef, scopeIdOf } from "@generalbusiness/artroom-bytes";
import type { OperationalApi, Transport } from "@generalbusiness/artroom-client";

export const STATUS_PAGES = 20;
export const STATUS_SCOPES = 1000;
type Http = Transport & OperationalApi;
interface Column<T> { value: T; head: Head | null; state: "complete" | "more" | "denied" | "unknown" }
const headText = (head: Head | null): string => head ? `at entry ${head.seq}, ${head.hash}` : "head unknown";
const sameHead = (a: Head, b: Head): boolean => a.seq === b.seq && a.hash === b.hash;
const stateOf = (reason: string): "denied" | "unknown" => reason === "forbidden" ? "denied" : "unknown";
async function pages<T, A>(read: (cursor?: string) => Promise<Read<readonly T[]>>, initial: A, fold: (value: A, row: T) => void): Promise<Column<A>> {
  const value = initial, seen = new Set<string>();
  let head: Head | null = null, cursor: string | undefined;
  for (let n = 0; n < STATUS_PAGES; n++) {
    try {
      const reply = await read(cursor);
      if (!reply.ok) return { value, head, state: stateOf(reply.reason) };
      if (head && !sameHead(head, reply.at)) return { value, head, state: "unknown" };
      head = reply.at;
      if (reply.complete && reply.next !== undefined) return { value, head, state: "unknown" };
      for (const row of reply.value) fold(value, row);
      if (reply.complete) return { value, head, state: "complete" };
      if (reply.next === undefined || !reply.next || reply.next.length > 256 || seen.has(reply.next)) return { value, head, state: "unknown" };
      seen.add(reply.next); cursor = reply.next;
    } catch { return { value, head, state: "unknown" }; }
  }
  return { value, head, state: "more" };
}
function column<T>(name: string, read: Column<T>, show: (value: T) => string): string {
  return read.state === "denied" || read.state === "unknown" ? `  ${name}: ${read.state}; ${headText(read.head)}.` : `  ${name}: ${show(read.value)}${read.state === "more" ? " (more; partial)" : ""}; ${headText(read.head)}.`;
}

/** Reads no sidecar without the explicit request selector. Discovery has its
 * own limits and never presents an incomplete room as a complete inventory. */
export async function statusReport(http: Http, reader: string, known: readonly { kind: string; scope: ScopeId }[], admin: boolean, request?: string, discover = true): Promise<string[]> {
  const queue = [...new Map(known.map(row => [row.scope, row])).values()], seen = new Set(queue.map(row => row.scope)), lines: string[] = [];
  const add = (kind: string, scope: ScopeId): boolean => {
    if (seen.has(scope)) return true;
    if (queue.length >= STATUS_SCOPES) return false;
    seen.add(scope); queue.push({ kind, scope }); return true;
  };
  for (let index = 0; index < queue.length; index++) {
    const { kind, scope } = queue[index]!;
    lines.push(`${kind} ${scope}`);
    try {
      const summary = await http.summary(scope, reader);
      if (!summary.ok) lines.push(`  summary: ${stateOf(summary.reason)}; head unknown.`);
      else {
        lines.push(`  summary: ${summary.value.status}, time ${summary.value.time}, counts ${JSON.stringify(summary.value.counts)}${summary.complete ? "" : " (more; partial)"}; ${headText(summary.at)}.`);
        if (discover) for (const item of summary.value.items) for (const name of ["register", "membership", "rules", "destination", "root"]) {
          const reference = item.refs[name];
          if (isScopeRef(reference) && !add(reference.kind, reference.scope)) lines.push("  discovery: more; scope limit reached.");
        }
      }
    } catch { lines.push("  summary: unknown; head unknown."); }
    const outbox = await pages(cursor => http.outbox(scope, reader, cursor), { unanswered: 0, diagnosed: 0 }, (value, row) => {
      if (row.class === "request" && row.result === null) value.unanswered++;
      if (row.diagnosis !== null) value.diagnosed++;
    });
    lines.push(column("outbox", outbox, value => `${value.unanswered} requests without a result, ${value.diagnosed} diagnosed sends`));
    if (admin) {
      for (const list of ["diagnosed", "unanswered"] as const) {
        const got = await pages(cursor => http.waiting(scope, reader, list, cursor), { count: 0 }, value => { value.count++; });
        lines.push(column(`waiting ${list}`, got, value => `${value.count}`));
      }
      const incidents = await pages(cursor => http.incidents(scope, reader, cursor), { count: 0 }, value => { value.count++; });
      lines.push(column("incidents", incidents, value => `${value.count}`));
      if (request !== undefined) {
        let window: string | null = null;
        const got = await pages(async cursor => {
          const reply = await http.requests(scope, reader, request, cursor);
          if (!reply.ok) return reply;
          const nextWindow = JSON.stringify(reply.value.window);
          if (window !== null && window !== nextWindow) throw Error("Operational window changed");
          window = nextWindow;
          return { ...reply, value: reply.value.rows };
        }, { rows: [] as string[] }, (value, row) => { value.rows.push(JSON.stringify(row)); });
        lines.push(column(`request ${request}`, got, value => `${value.rows.length} rows, window ${window ?? "unknown"}`));
        if (got.state === "complete" || got.state === "more") lines.push(...got.value.rows.map(row => `    ${row}`));
      }
    } else {
      lines.push("  waiting diagnosed: denied.", "  waiting unanswered: denied.", "  incidents: denied.");
      if (request !== undefined) lines.push(`  request ${request}: denied.`);
    }
    if (!discover) continue;
    let capacity = false;
    const discovery = await pages(cursor => http.history(scope, reader, cursor), { count: 0 }, (value, row) => {
      for (const send of row.entry.sends) if ("creator" in send.to) {
        if (!add(send.to.kind, scopeIdOf(send.to))) capacity = true;
        value.count++;
      }
    });
    if (capacity || discovery.state !== "complete") lines.push(`  discovery: ${capacity || discovery.state === "more" ? "more; partial" : discovery.state}; ${headText(discovery.head)}.`);
  }
  lines.push(`Observed ${queue.length} scopes. Reads are separate observations; operational rows can change without a native entry. Discovery is bounded to ${STATUS_SCOPES} scopes and ${STATUS_PAGES} history pages per scope.`);
  return lines;
}
