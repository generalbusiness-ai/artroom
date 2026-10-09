/** The manifest-list successor commissioned by d9e4baa4 and 73ac78ad.
 * Existing lanes retain the earlier digest. A file entry is source data;
 * the final manifest freezes its collection before merge and reservation. */
import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { change } from "./change.ts";
import { changeDemo } from "./demo.ts";

const source = { type: "fact", kind: ["propose-file"], under: "change" } as const;
const files = { type: "list", max: 64, of: { type: "record", of: {
  path: { type: "text", max: 1024, required: true },
  entry: { ...source, required: true },
  digest: { type: "digest", required: true },
} } } as const;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function successor(prior: DeclaredDefinition): DeclaredDefinition {
  const next = clone(prior);
  next.items["source"] = { ...clone(prior.items["manifest"]!), max: 64,
    states: { collected: { final: false }, selected: { final: true } }, initial: "collected" };
  next.items["manifest"]!.refs["operation"] = { fixed: false, required: false, to: { type: "fact", kind: ["merge"], under: "change" } };
  next.items["manifest"]!.values["files"] = { fixed: true, required: false, of: files };
  next.items["manifest"]!.values["tree"]!.fixed = false;
  next.items["manifest"]!.values["integration"]!.fixed = false;
  const file = next.acts["propose-file"]!;
  file.on = "source";
  file.guards = [file.guards[0]!, file.guards[1]!, file.guards[2]!,
    { none: { type: "manifest", states: ["current", "superseded"] }, reason: "collection-closed" },
    { count: { type: "source", states: ["collected"], max: 63 }, reason: "too-many-paths" }];
  next.acts["propose-manifest"] = {
    step: "open", on: "manifest", grant: "change.propose", also: { proposal: { item: "proposal", one: true } },
    fields: { base: { type: "commit", required: true }, files: { ...files, required: true } },
    guards: [
      { state: ["draft", "open"], of: "also.proposal" }, { signer: ["author"], of: "also.proposal" },
      { none: { type: "manifest", states: ["current", "superseded"] }, reason: "one-manifest" },
      { distinct: { list: { field: "files" }, as: "f", key: { element: "f.path" } }, reason: "path-repeated" },
      { each: { list: { field: "files" }, as: "f", guards: [
        { fact: { element: "f.entry" } },
        { equals: { a: { element: "f.entry", part: "scope" }, b: { scope: true } } },
        { equals: { a: { element: "f.entry", part: { field: "base" } }, b: { field: "base" } } },
        { equals: { a: { element: "f.entry", part: { field: "path" } }, b: { element: "f.path" } } },
        { equals: { a: { element: "f.entry", part: { field: "digest" } }, b: { element: "f.digest" } } },
      ] }, reason: "source-mismatch" },
      { sameSet: { list: { field: "files" }, as: "f", key: { element: "f.entry", part: "seq" }, items: { type: "source", states: ["collected"] } }, reason: "source-not-collected" },
    ], effects: [
      { party: { slot: "integrator", from: { signer: true } } }, { party: { slot: "authors", from: [{ signer: true }] } },
      { value: { slot: "base", from: { field: "base" } } }, { value: { slot: "files", from: { field: "files" } } },
      { value: { slot: "complete", from: { const: true } } },
    ], sends: [], attention: [],
  };
  // Required jobs run on the destination's recorded reservation tree.
  next.acts["merge"]!.guards = next.acts["merge"]!.guards.filter((guard) => guard.reason !== "required-check-not-passed");
  next.acts["merge"]!.effects = [...next.acts["merge"]!.effects, { ref: { slot: "operation", from: "self" }, of: "also.manifest" }];
  const sends = next.acts["merge"]!.sends;
  const reserve = sends.find((send) => "tell" in send && send.tell.message === "reserve");
  if (reserve && "tell" in reserve) reserve.tell.fields["sources"] = { slot: "files", of: "also.manifest" };
  for (const kind of ["request-check", "check", "check-error"]) {
    const act = next.acts[kind];
    if (act) act.guards = act.guards.filter((guard) => guard.reason !== "merge-in-progress");
  }
  next.acts["request-check"]!.guards = [...next.acts["request-check"]!.guards, { set: "tree", of: "also.manifest", reason: "not-reserved" }];
  const publication = next.receives["publication"]!;
  publication.fields["tree"] = { type: "tree", required: false };
  publication.effects = [...publication.effects,
    { value: { slot: "tree", from: { field: "tree" } }, of: "also.manifest", if: [{ equals: { a: { field: "outcome" }, b: { const: "committed" } } }] },
    { value: { slot: "integration", from: { field: "commit" } }, of: "also.manifest", if: [{ equals: { a: { field: "outcome" }, b: { const: "committed" } } }] },
  ];
  const check = next.acts["check"]!;
  check.also["manifest"] = { item: "manifest", via: { slot: "manifest", of: "also.job" } };
  check.sends = [{ tell: { to: { slot: "destination", of: "also.proposal" }, message: "checked",
    fields: { operation: { slot: "operation", of: "also.manifest" }, result: "self", job: { item: "also.job" } }, result: {} } }];
  if (!next.acts["check-error"]) next.acts["check-error"] = clone(change.acts["check-error"]!);
  if (next.acts["check-error"]) {
    next.acts["check-error"]!.guards = next.acts["check-error"]!.guards.filter((guard) => guard.reason !== "merge-in-progress");
    next.acts["check-error"]!.also["proposal"] = { item: "proposal", one: true };
    next.acts["check-error"]!.also["manifest"] = { item: "manifest", via: { slot: "manifest", of: "also.job" } };
    next.acts["check-error"]!.sends = clone(check.sends);
  }
  return next;
}

export const change3 = successor(change);
export const changeDemo3 = successor(changeDemo);
