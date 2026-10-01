// Isolation check in workerd (review 8f5dede9, P1.1). Needs a running Worker:
//   npx wrangler dev --port 8787 &   then   npm run test:workerd [-- <base-url>]
// Sends the same evaluations one at a time, then all at once to one isolate,
// and asserts the results (value, steps, inspected bytes, errors) are equal.
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const cases = [];
for (let i = 0; i < 4; i++) for (const guard of ["true", "false", "memo", "steps"]) cases.push(`op=scope&size=80&guard=${guard}`);
cases.push("op=patho&size=25&guard=true", "op=patho&size=50&guard=steps");
const get = async (q) => (await (await fetch(`${base}/w/bench?${q}`)).json()).out;
const sequential = [];
for (const q of cases) sequential.push(await get(q));
const concurrent = await Promise.all(cases.map(get));
assert.deepEqual(concurrent, sequential);
// Within one task the evaluations interleave; each must equal its sequential twin.
const parallel = await get("op=scope-parallel&size=80&inner=16");
assert.deepEqual(parallel, Array.from({ length: 16 }, (_, i) => sequential[i % 4]));
assert.equal(sequential[0].value, 80);
assert.ok(sequential[0].steps > 400);
console.log(`ok: ${cases.length} concurrent requests and 16 evaluations in one task in workerd match sequential (guarded steps ${sequential[0].steps}, inspected ${sequential[0].inspectedBytes} bytes; budget failures ${sequential.at(-2)}, ${sequential.at(-1)})`);
