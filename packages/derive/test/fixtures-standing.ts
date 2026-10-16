/** Made-up C1 platform data shared by pure and native witnesses. */
import { desk } from "./fixtures.ts";
const form = { also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function standingData(change: (data: any) => void = () => {}) {
  const data = structuredClone(desk) as any;
  const integer = { type: "int", min: 0, max: 2 };
  data.name = "platform:task";
  data.outcomes = {};
  data.standing = { item: "repo", slot: "count", entries: 3, max: 2 };
  data.items.repo.values.count = { fixed: false, required: true, default: 0, of: integer };
  data.items.repo.refs.peer = { fixed: false, required: false, to: { type: "scope", kind: "directory" } };
  data.items.repo.states.done = { final: true };
  data.acts.set = { ...form, step: "transition", on: "repo", grant: "set", fields: { next: { ...integer, required: true } }, effects: [{ value: { slot: "count", from: { field: "next" } } }] };
  data.acts.finish = { ...form, step: "transition", on: "repo", grant: "set", guards: [{ state: ["open"] }], effects: [{ state: "done" }] };
  data.acts.chatter = { ...form, step: "transition", on: "repo", grant: "set" };
  data.acts.advance = { ...data.acts.set, fields: { ...data.acts.set.fields, peer: { type: "scope", kind: "directory", required: true } }, effects: [...data.acts.set.effects, { ref: { slot: "peer", from: { field: "peer" } } }], sends: [{ tell: { to: { slot: "peer" }, message: "tick", fields: {}, result: { applied: [{ code: "settle-counter", row: "P16" }], undelivered: [{ code: "settle-counter", row: "P16" }] } } }] };
  change(data);
  return data;
}
