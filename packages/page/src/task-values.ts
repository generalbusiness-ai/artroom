import type { ChangeView } from "./data.ts";
interface TaskContext {
  defaults: Record<string, { on?: number; fields?: Record<string, string> }>;
  choices: Record<string, Record<string, readonly { label: string; value: string }[]>>;
}

/** The supported Create issue intent: its title states the work to complete. */
export function issueTaskValues(typed: Record<string, string>): Record<string, string> {
  return { ...typed, conditions: JSON.stringify([typed["title"] ?? ""]) };
}

/** Technical form values come from the authenticated selected version and membership projections. */
export function changeTaskContext(change: ChangeView): TaskContext {
  const selected = change.currentManifest === undefined ? change.manifests.find((manifest) => manifest.state === "current") : change.manifests.find((manifest) => manifest.id === change.currentManifest);
  const defaults: TaskContext["defaults"] = {};
  if (selected) {
    for (const kind of ["review-verdict", "request-check"]) defaults[kind] = { fields: { manifest: String(selected.id) } };
    if (selected.selectedReports !== undefined && selected.selectedReports !== null) defaults["merge"] = { fields: { manifest: String(selected.id), reports: JSON.stringify(selected.selectedReports) } };
  }
  if (change.proposal !== undefined) for (const kind of ["ready-own", "ready-any"]) defaults[kind] = { on: change.proposal };
  const choices: TaskContext["choices"] = {};
  if (change.reviewExtents !== undefined && change.reviewExtents !== null) choices["review-verdict"] = { extent: change.reviewExtents };
  if (change.reviewMembers !== undefined && change.reviewMembers !== null) for (const kind of ["request-review-own", "request-review-any"]) choices[kind] = { requested: change.reviewMembers };
  return { defaults, choices };
}

