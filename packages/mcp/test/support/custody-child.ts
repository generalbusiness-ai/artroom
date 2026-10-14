/**
 * A second process for the custody witnesses: it runs one operation on a file store that the test process shares, and prints
 * what happened on one line. Run as `node --import tsx custody-child.ts <json>`. Operations:
 *
 * - `archive`: keep and accept each of `keys`, with a store that archives every terminal record.
 * - `crash`: the same, and the process ends at the named fault point of the first archival, as a crash would.
 * - `admit`: keep one record under `key`; prints `admitted` or `full`.
 * - `settle-hang`: settle `key`, whose reading never answers; prints `reading` and waits to be killed.
 * - `resubmit`: resubmit the refused record under `key`, whose reply is lost; prints `admitted` or why it was held back.
 * - `lease`: take the lock file at `path`; prints `entered` and holds it for 300 ms, or `refused`.
 */
import { timeOf } from "@generalbusiness/artroom-bytes";
import { Custody, CustodyError, Lost, meaningOf } from "../../src/index.ts";
import { fileStore, releaseLock, takeLock } from "../../src/node.ts";
import { T0, accepted, build, identity, notAfter } from "./custody.ts";

const asked = JSON.parse(process.argv[2]!) as { op: string; dir: string; keys?: string[]; key?: string; path?: string; point?: "archive-written" | "index-published"; now?: number };
const now = () => asked.now ?? T0;
const store = fileStore(asked.dir, { terminalMost: 0, ageDays: 30, archiveBytes: 2048, ...(asked.point ? { fault: (p) => { if (p === asked.point) process.exit(70); } } : {}) }, now);
const custody = new Custody(store, () => timeOf(now()));

if (asked.op === "archive" || asked.op === "crash") {
  for (const key of asked.keys!) await custody.send(identity(key), meaningOf(key), build(key), async (e) => accepted(e.signed), { notAfter });
  console.log("done");
} else if (asked.op === "admit") {
  try { await custody.keep(identity(asked.key!), meaningOf(asked.key), build(asked.key!), notAfter); console.log("admitted"); }
  catch (error) { console.log(error instanceof CustodyError ? error.why.held : String(error)); }
} else if (asked.op === "settle-hang") {
  await custody.settle(identity(asked.key!), () => { console.log("reading"); return new Promise(() => {}); });
}
else if (asked.op === "resubmit") {
  try { await custody.send(identity(asked.key!), meaningOf(asked.key), build(asked.key!), async () => { throw new Lost(); }, { notAfter, resubmit: true }); console.log("admitted"); }
  catch (error) { console.log(error instanceof CustodyError ? error.why.held : String(error)); }
} else if (asked.op === "lease") {
  const held = takeLock(asked.path!, {});
  if (!held) console.log("refused");
  else {
    // When this process was inside, by the wall clock all children share: just after taking the lock, just before releasing it.
    const at = () => performance.timeOrigin + performance.now();
    const entered = at();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const leaving = at();
    releaseLock(held);
    console.log(`entered ${entered} ${leaving}`);
  }
}
