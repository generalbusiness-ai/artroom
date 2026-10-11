import type { ChangeView, Offered, Room } from "./data.ts";
import { classify, editPath, type Extent } from "@generalbusiness/artroom-platform";
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

/** Applicability uses full policy bound by the data reader to this recorded
 * one-file version. Held extents never supply missing patterns. */
export function taskReviewExtents(change: ChangeView): readonly Extent[] | null {
  const current = change.manifests.find(manifest => manifest.id === change.currentManifest);
  const policy = change.reviewPolicy;
  if (!current || !policy || policy.manifest !== current.id) return null;
  const extents = policy.extents;
  const path = current?.file?.path;
  if (!path || editPath(path) === null || extents.some(extent => extent.patterns === undefined)) return null;
  // Only this verified literal file path is presented here. The destination
  // still reads and classifies the actual changed trees and links at merge.
  const touched = classify(extents, [path], [], 0).touched;
  return extents.filter(extent => touched.some(row => row.extent === extent.name));
}

/** The same applicable requirements feed the primary task and its recipients.
 * Missing current authority stays unknown rather than becoming an empty pool. */
export function requestedReviewCandidates(change: ChangeView): { label: string; value: string }[] | null {
  const applicable = taskReviewExtents(change);
  if (applicable === null || change.reviewMembersByExtent == null) return null;
  const required = applicable.filter(extent => extent.approvals > 0);
  const recipients = new Map<string, { label: string; value: string }>();
  for (const extent of required.length ? required : applicable) {
    const candidates = change.reviewMembersByExtent[extent.name];
    if (candidates == null) return null;
    for (const candidate of candidates) recipients.set(candidate.value, candidate);
  }
  return [...recipients.values()];
}

/** A retained ordinary review must keep its selected version AND requirement.
 * This is presentation qualification; the native lane/destination still judge it. */
export function reviewSelectionProblem(room: Room, change: ChangeView, manifest: number, extent: string): string | null {
  if (change.currentManifest !== manifest) return "This version is no longer current. Keep this draft and choose the new version explicitly.";
  if (change.state !== "open") return "This change is no longer open for ordinary review. This draft keeps its original version.";
  if (!extent) return "Choose a review requirement before submitting this version.";
  const applicable = taskReviewExtents(change);
  if (applicable === null) return "The rules policy for this recorded version could not be verified. This draft keeps its original requirement.";
  if (!applicable.some(row => row.name === extent)) return "This requirement is no longer available for the selected file. Keep the draft and choose a requirement explicitly.";
  const candidates = change.reviewMembersByExtent?.[extent];
  if (!candidates || !room.me) return "Current reviewer authority could not be read for this requirement. This draft is kept.";
  if (!candidates.some(candidate => candidate.value === room.me!.handle)) return "You are no longer eligible to review this requirement. Keep the draft and choose an eligible requirement explicitly.";
  return null;
}

/** A single prominent task; native declarations remain the final authority. */
export function nextChangeAction(room: Room, change: ChangeView, offered: readonly Offered[], allowed: readonly string[]): Offered | null {
  const current = change.currentManifest === undefined ? change.manifests.find((manifest) => manifest.state === "current") : change.manifests.find((manifest) => manifest.id === change.currentManifest);
  if (["merged", "closed", "cancelled"].includes(change.state)) return null;
  if (change.state === "draft") return ["ready-own", "ready-any"].map(kind => offered.find(act => act.kind === kind && allowed.includes(kind))).find(act => act !== undefined) ?? null;
  if (!current || current.file && editPath(current.file.path) === null) return null;
  const author = !!room.me && (current?.authors.includes(room.me.handle) || change.author === room.me.handle);
  const applicable = taskReviewExtents({ ...change, currentManifest: current.id });
  if (applicable === null) return null;
  const approving = change.reviews.filter(review => review.manifest === current.id && review.state === "submitted" && review.verdict === "approve");
  // This selects a useful task from held records; the destination still judges fresh rules and evidence.
  const needsReview = (change.rules?.approvals ?? 0) > approving.length || applicable.some(extent => approving.filter(review => review.extent === extent.name).length < extent.approvals)
    || change.reviews.some(review => review.manifest === current.id && review.state === "submitted" && review.verdict === "request-changes");
  const canReview = change.reviewMembersByExtent === undefined || !!room.me && applicable.some(extent => change.reviewMembersByExtent?.[extent.name]?.some(member => member.value === room.me!.handle));
  const requests = ["request-review-own", "request-review-any"];
  const order = author ? needsReview ? [...requests, "merge"] : ["merge", ...requests] : canReview ? ["review-verdict", "merge"] : ["merge"];
  return order.map((kind) => offered.find((act) => act.kind === kind && allowed.includes(kind))).find((act) => act !== undefined) ?? null;
}
