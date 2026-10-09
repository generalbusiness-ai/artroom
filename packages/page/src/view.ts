/** Native screens built only from the room's recorded observations. */
import { editPath, matches } from "@generalbusiness/artroom-platform";
import type { Answer } from "@generalbusiness/artroom-contract";
import { siteAddress, Unreadable, type Acted, type ChangeView, type IssueView, type LaneRow, type Room, type RulesView } from "./data.ts";
import { changeStates } from "./states.ts";
import { LIST_QUERY_LIMIT, type ListState } from "./list-context.ts";

type Child = Node | string | null | undefined | false;

/** Text children and attributes use DOM APIs, never HTML interpolation. */
export function h(tag: string, attrs: Record<string, string> = {}, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}
const or = (value: string | number | null | undefined, empty = "Not recorded"): string => value === null || value === undefined || value === "" ? empty : String(value);
const list = (values: readonly string[], empty = "Not recorded"): string => values.length ? values.join(", ") : empty;
const state = (name: string): HTMLElement => h("span", { class: `condition state state-${name.toLowerCase().replace(/[^a-z-]/g, "-")}` }, name);
const field = (label: string, value: Child): HTMLElement => h("div", { class: "field" }, h("dt", {}, label), h("dd", {}, value));
const section = (title: string, ...children: (Child | Child[])[]): HTMLElement => h("section", { class: "panel" }, h("h2", { class: "panel-head" }, title), ...children);
const table = (head: string[], rows: Child[][]): HTMLElement | null => rows.length === 0 ? null : h("div", { class: "table-scroll" }, h("table", { class: "record-table" }, h("thead", {}, h("tr", {}, head.map((c) => h("th", { scope: "col" }, c)))), h("tbody", {}, rows.map((row) => h("tr", {}, row.map((c) => h("td", {}, c)))))));
const inspect = (label: string, ...children: (Child | Child[])[]): HTMLElement => h("details", { class: "inspection" }, h("summary", {}, label), ...children);
const commentsRecord = (comments: IssueView["comments"]): HTMLElement | null => table(["Comment", "Author", "State"], comments.map((c) => [String(c.id), or(c.author), c.state]));
const back = (kind: "issue" | "change"): HTMLElement => h("a", { class: "icon-button back", href: kind === "issue" ? "#/" : "#/?kind=change", "aria-label": `Back to ${kind} list` }, "←");
const title = (text: string | null, number: number | null): HTMLElement => h("h1", {}, or(text, "Untitled"), " ", h("span", { class: "number" }, `#${or(number, "?")}`));

/** Membership and read-session evidence is available in record inspection. */
export function whoLine(room: Room): HTMLElement {
  const how = room.reader ? "Reads present a read session from membership." : `Membership gave no read session (${room.unsessioned ?? "not recorded"}): each read is signed by your key, and a scope answers only where your key signed an entry in the last few minutes.`;
  return h("p", { class: "who" }, room.me ? `Signed in as ${room.me.handle} (${room.me.role}), key ${room.key}. ` : `Key ${room.key} is no active member's key in this room; the scopes will refuse your acts. `, h("span", { class: "muted" }, how));
}

/** One list destination, without repeating room identity from the switcher. */
export function roomScreen(room: Room, lanes: { issues: LaneRow[]; changes: LaneRow[] }, kind: "issue" | "change" = "issue", context?: { state: ListState; changed(state: ListState): void }): HTMLElement {
  const label = kind === "issue" ? "Issues" : "Changes";
  const all = kind === "issue" ? lanes.issues : lanes.changes;
  let filter = context?.state.filter ?? "open";
  const query = h("input", { type: "search", value: context?.state.query ?? "", maxlength: String(LIST_QUERY_LIMIT), placeholder: `Search ${label.toLowerCase()}`, "aria-label": `Search ${label.toLowerCase()}` }) as HTMLInputElement;
  const content = h("div", { "data-list": "" });
  const filters = h("div", { class: "filters", "aria-label": `Filter ${label.toLowerCase()}` });
  const render = () => {
    const values = all.filter((row) => (filter === "all" || (filter === "open" ? !["closed", "published", "merged", "cancelled"].includes(row.state ?? "") : kind === "issue" ? row.state === "closed" : ["published", "merged"].includes(row.state ?? ""))) && `${row.title ?? ""} ${row.number ?? ""}`.toLowerCase().includes(query.value.toLowerCase()));
    for (const button of filters.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.getAttribute("data-filter") === filter));
    content.replaceChildren(values.length ? h("ul", { class: `work-list ${kind === "change" ? "change-list" : ""}` }, values.map((row) => h("li", { class: "work-row" },
      h("span", { class: kind === "issue" && row.state !== "closed" ? "issue-ring" : "work-icon", "aria-hidden": "true" }, kind === "issue" ? (row.state === "closed" ? "✓" : "") : "⑂"),
      h("div", { class: "work-copy" }, h("a", { class: "work-title", href: `#/${kind}/${row.scope}` }, h("span", {}, or(row.title, "Untitled")), h("span", { class: "work-meta" }, `#${or(row.number, "?")}${row.draft ? " · Draft" : ""}`))),
      h("div", { class: "row-end" }, state(row.state === "closed" ? "Closed" : row.state === "published" || row.state === "merged" ? "Merged" : or(row.state, "Unknown"))),
    ))) : h("div", { class: "blank" }, h("p", {}, all.length === 0 ? `No ${label.toLowerCase()} yet.` : "No matches.")));
  };
  for (const value of ["open", kind === "issue" ? "closed" : "merged", "all"]) {
    const button = h("button", { type: "button", class: "filter", "data-filter": value }, value[0]!.toUpperCase() + value.slice(1));
    button.addEventListener("click", () => { filter = value as ListState["filter"]; context?.changed({ query: query.value, filter }); render(); });
    filters.append(button);
  }
  query.addEventListener("input", () => { context?.changed({ query: query.value, filter }); render(); });
  render();
  return h("main", { class: "screen" }, h("h1", { class: "hide" }, label), h("div", { class: "toolbar" }, h("label", { class: "search" }, query), filters, h("div", { "data-action-slot": "create" })), content,
    inspect("Inspect room record", whoLine(room), h("dl", {}, field("Directory", h("code", {}, room.directory)))),
  );
}

const discussion = (body: string | null, comments: IssueView["comments"]): HTMLElement => h("section", { class: "discussion", "aria-label": "Discussion" },
  body ? h("p", { class: "description" }, body) : null,
  comments.map((c) => h("article", { class: "comment" }, h("span", { class: "comment-author" }, or(c.author)), h("p", {}, or(c.body, "Text not held")), c.state !== "visible" ? h("p", { class: "muted" }, `Comment ${c.id}: ${c.state}`) : null)),
  h("div", { "data-action-slot": "comment" }),
);

export function issueScreen(room: Room, issue: IssueView): HTMLElement {
  return h("main", { class: "screen" }, back("issue"),
    h("div", { class: "detail-top" }, h("div", { class: "detail-heading" }, title(issue.title, issue.number), h("div", { class: "detail-meta" }, state(issue.state === "closed" ? "Closed" : issue.state === "open" ? "Open" : issue.state), issue.requester ? h("span", {}, `· ${issue.requester}`) : null)), h("div", { "data-action-slot": "next" })),
    issue.assignees.length ? h("p", { class: "record-meta" }, `Assigned to ${list(issue.assignees)}`) : null,
    issue.conditions.length ? section("Conditions", h("ul", {}, issue.conditions.map((c) => h("li", {}, c)))) : null,
    discussion(issue.body, issue.comments),
    inspect("Inspect issue record", whoLine(room), h("dl", {}, field("Lane", h("code", {}, issue.scope)), field("Definition", h("code", {}, issue.definition)), field("Read at", `${issue.head.seq}, ${issue.head.hash}`), issue.closeReason ? field("Close reason", issue.closeReason) : null), commentsRecord(issue.comments)),
  );
}

/** The main condition belongs to the selected version; outside effects never imply a merge. */
export function changeCondition(change: ChangeView, last: Answer | null = null, lastActKind?: string): string {
  const current = change.manifests.find((m) => m.state === "current") ?? change.manifests.at(-1) ?? null;
  const latest = change.merges.filter((m) => m.manifest === current?.id).reduce<ChangeView["merges"][number] | null>((a, b) => !a || b.id > a.id ? b : a, null);
  if (latest?.state === "published") return "Merged";
  const states = changeStates({ requests: change.requests, merges: latest ? [latest] : [] }, lastActKind === "merge" ? last : null);
  if (states.some((s) => s.state === "unavailable authority")) return "Authority unavailable";
  if (states.some((s) => s.state === "publication in progress")) return "Awaiting confirmation";
  if (current?.file && editPath(current.file.path) === null) return "Invalid path";
  if (states.some((s) => s.state === "policy not met")) return "Needs review";
  if (states.some((s) => s.state === "waiting for a reviewer")) return "Waiting for review";
  if (latest?.state === "refused") return "Refused";
  if (change.state === "cancelled" || change.state === "closed") return change.state === "closed" ? "Closed" : "Cancelled";
  return "Open";
}

export function changeScreen(room: Room, change: ChangeView, last: Answer | null, lastActKind?: string): HTMLElement {
  const current = change.manifests.find((m) => m.state === "current") ?? change.manifests.at(-1) ?? null;
  const published = change.merges.find((m) => m.state === "published" && m.manifest === current?.id);
  const states = changeStates(change, lastActKind === "merge" ? last : null);
  const extents = change.rules?.extents ?? [];
  const reviews = extents.map((extent) => {
    const approving = change.reviews.filter((r) => r.manifest === current?.id && r.state === "submitted" && r.verdict === "approve" && r.extent === extent.name);
    return [extent.name, `${approving.length} of ${extent.approvals}`, extent.approver, list(approving.map((r) => or(r.reviewer)))];
  });
  // A one-file proposal records the path. Pattern matching is presentation,
  // not the destination's judgment of the tree or reviewers' authority.
  const path = current?.file?.path;
  const knownPatterns = extents.every((extent) => extent.patterns !== undefined);
  const matching = path && editPath(path) !== null && knownPatterns ? extents.filter((extent) => extent.patterns!.some((pattern) => matches(pattern, path))) : [];
  const applicable = path && editPath(path) !== null && knownPatterns ? matching.length ? matching : extents.filter((extent) => extent.patterns!.length === 0) : [];
  const requiredReviews = applicable.filter((extent) => extent.approvals > 0);
  const currentJobs = change.jobs.filter((job) => job.manifest === current?.id);
  const version = current ? section("Files", current.file ? h("div", {},
    h("div", { class: "filebar" }, h("code", { class: "filename" }, current.file.path), published && editPath(current.file.path) !== null ? h("a", { href: siteAddress(room, current.file.path), class: "button" }, "Open latest page") : null),
    editPath(current.file.path) === null ? h("p", { class: "muted" }, "Choose a file path inside this room.") : current.file.content !== null && current.file.content !== undefined ? h("details", { class: "source-preview" },
      h("summary", {}, "Preview source"),
      h("p", { class: "version-label" }, `Version ${current.id} · ${current.file.path}`),
      current.file.digest ? h("p", { class: "record-meta" }, "Digest ", h("code", {}, current.file.digest)) : null,
      h("pre", { "aria-label": `Source of ${current.file.path}, version ${current.id}` }, h("code", {}, current.file.content)),
      h("div", { "data-action-slot": "edit" }),
    ) : h("p", { class: "muted" }, published ? "Rendering this published version is not available yet." : "Preview of this version is not available yet."),
  ) : h("p", { class: "muted" }, "This version records a Git tree. File preview is not available yet.")) : h("p", { class: "muted" }, "No version proposed yet.");
  return h("main", { class: "screen" }, back("change"),
    h("div", { class: "detail-top" }, h("div", { class: "detail-heading" }, title(change.title, change.number), h("div", { class: "detail-meta" }, state(changeCondition(change, last, lastActKind)), change.author ? h("span", {}, `· ${change.author}`) : null, current ? h("span", {}, `· Version ${current.id}`) : null)), h("div", { "data-action-slot": "next" })),
    version,
    !published && requiredReviews.length ? section("Review requirements", requiredReviews.map((extent) => {
      const approving = change.reviews.filter((review) => review.manifest === current?.id && review.state === "submitted" && review.verdict === "approve" && review.extent === extent.name);
      return h("p", {}, h("strong", {}, extent.name), ` · ${approving.length} of ${extent.approvals} approvals recorded`);
    })) : null,
    !published && currentJobs.length ? section("Checks", h("ul", {}, currentJobs.map((job) => h("li", {}, job.name ? `${job.name}: ${job.state}` : `Job ${job.id}: ${job.state}`)))) : null,
    discussion(change.body, change.comments),
    inspect("Inspect change record", whoLine(room),
      h("dl", {}, field("Lane", h("code", {}, change.scope)), field("Definition", h("code", {}, change.definition)), field("Read at", `${change.head.seq}, ${change.head.hash}`), field("Lifecycle", change.state),
        current ? field("Version item", `${current.id}: ${current.state}${current.complete === false ? ", incomplete" : ""}`) : null,
        current?.integrator ? field("Integrated by", current.integrator) : null, current?.authors.length ? field("Authors", list(current.authors)) : null,
        current?.base ? field("Base", h("code", {}, current.base)) : null, current?.integration ? field("Integration commit", h("code", {}, current.integration)) : null,
        current?.tree ? field("Tree", h("code", {}, current.tree)) : null, current?.file && current.file.size !== null ? field("Bytes", String(current.file.size)) : null,
        current?.file?.digest ? field("Digest", h("code", {}, current.file.digest)) : null,
      ),
      change.manifests.length > 1 ? section("Versions", table(["Item", "State", "Integrator", "Authors", "Base", "Integration", "Tree", "Complete", "Path", "Digest", "Bytes"], change.manifests.map((m) => [String(m.id), m.state, or(m.integrator), list(m.authors), or(m.base), or(m.integration), or(m.tree), m.complete === null ? "Not recorded" : String(m.complete), or(m.file?.path), or(m.file?.digest), or(m.file?.size)]))) : null,
      states.length ? section("Recorded outcomes", h("ul", {}, states.map((s) => h("li", {}, h("strong", {}, s.state), `: ${s.detail}`)))) : null,
      extents.length ? section("Review requirements", table(["Extent", "Approvals of this version", "Role", "By"], reviews)) : null,
      change.jobs.length ? section("Checks", table(["Job", "Name", "Version", "State"], change.jobs.map((j) => [String(j.id), or(j.name), or(j.manifest), j.state]))) : null,
      change.rules ? h("p", {}, `Lane-held rules update ${or(change.rules.revision)}; ${or(change.rules.approvals)} approval(s) in its own count. The destination judges the rules it observes for each merge.`) : h("p", {}, "This lane has not received rules yet."),
      change.reviews.length ? section("Reviews", table(["Review", "Reviewer", "Verdict", "Extent", "Version", "State"], change.reviews.map((r) => [String(r.id), or(r.reviewer), or(r.verdict), or(r.extent), or(r.manifest), r.state]))) : null,
      change.requests.length ? section("Review requests", table(["Request", "Asked of", "Asked by", "State"], change.requests.map((r) => [String(r.id), or(r.requested), or(r.requester), r.state]))) : null,
      change.links.length ? section("Links", table(["Link", "Issue", "How", "State"], change.links.map((l) => [String(l.id), l.issue ? h("a", { href: `#/issue/${l.issue}` }, l.issue) : "Not recorded", or(l.how), l.state]))) : null,
      commentsRecord(change.comments),
      change.merges.length ? section("Branch publication", change.merges.map((m) => h("article", { class: "merge" },
        h("p", {}, `Merge item ${m.id}, version ${or(m.manifest)}: ${m.state}${m.reason ? ` (${m.reason})` : ""}.`),
        m.commit ? h("p", {}, "Commit ", h("code", {}, m.commit)) : null,
        m.publication ? h("p", {}, `Destination publication ${m.publication.id}: ${m.publication.state}${m.publication.reason ? ` (${m.publication.reason})` : ""}.`) : h("p", {}, "No destination publication recorded yet."),
        m.publication?.operations.length ? table(["Outside operation", "Kind", "Attempts"], m.publication.operations.map((o) => [o.id, o.kind, list(o.attempts, "No attempt yet")])) : null,
      ))) : null,
    ),
  );
}

export function rulesScreen(room: Room, rules: RulesView, editable = false): HTMLElement {
  return h("main", { class: "screen form-layout" }, h("h1", { class: "rules-title" }, "Rules"),
    !editable ? rules.extents?.length ? section("Review requirements", rules.extents.map((e) => h("div", { class: "rule-row" },
      h("div", {}, h("strong", { class: "rule-label" }, e.name), h("span", { class: "rule-path" }, list(e.patterns ?? [], "Paths unmatched by another extent"))),
      h("span", {}, `${e.approvals} approval${e.approvals === 1 ? "" : "s"}`),
      e.checks.length ? h("p", { class: "muted" }, `Required checks: ${list(e.checks)}`) : null,
    ))) : h("p", { class: "muted" }, "No review requirements published yet.") : null,
    !editable && rules.checks.some((c) => c.required) ? section("Required checks", h("ul", {}, rules.checks.filter((c) => c.required).map((c) => h("li", {}, c.name)))) : null,
    inspect("Inspect rules record", whoLine(room), h("dl", {},
      field("Rules scope", h("code", {}, rules.scope)), field("Read at", `${rules.head.seq}, ${rules.head.hash}`), field("Revision", rules.revision === null ? "No rules published yet" : String(rules.revision)),
      field("Lanes' approval count", or(rules.approvals)), field("Author's agent controller may review", rules.ownerMayReview === null ? "Not stated" : rules.ownerMayReview ? "Yes" : "No"),
      field("Single-controller exception", rules.singleControllerException ? "Declared" : "Not declared"), field("Controllers", list(rules.controllers, "No eligible controller")),
      rules.labels.length ? field("Labels", list(rules.labels)) : null,
    ),
      rules.extents?.length ? section("Extent authority", table(["Extent", "Class", "Role", "Approvals", "Required checks", "Paths"], rules.extents.map((e) => [e.name, e.class, e.approver, String(e.approvals), list(e.checks, "No required checks"), list(e.patterns ?? [], "Paths unmatched by another extent")]))) : null,
      rules.checks.length ? section("Check configuration", table(["Name", "Required", "Checker"], rules.checks.map((check) => [check.name, check.required ? "Yes" : "No", check.checker === undefined ? "Not configured" : JSON.stringify(check.checker)]))) : null,
      rules.definitions.length ? section("Active definitions", table(["Name", "Digest", "State"], rules.definitions.map((d) => [d.name, h("code", {}, d.digest), d.state]))) : null,
    ),
  );
}

// ---------------------------------------------------------------- acts

/** Actual nonaccepted category; no claim that a timed drain wrote nothing. */
export function nonacceptedAnswerText(answer: Exclude<Answer, { answer: "accepted" }>): string {
  switch (answer.answer) {
    case "refused": return `Refused: ${answer.reason}${"name" in answer && answer.name ? ` (${answer.name})` : ""}. The request was refused.`;
    case "unavailable": return `Unavailable: ${answer.reason}. Outcome unknown; no acceptance is confirmed.`;
    case "mismatch": return `Mismatch: ${answer.reason}. The idempotency key names another recorded intent.`;
  }
}

/** Known submit result and separate observation phase. No head is invented. */
export function answerText(acted: Acted): string[] {
  const a = acted.answer;
  let known: string;
  switch (a.answer) {
    case "accepted": known = `Accepted ${acted.kind}: ${a.receipt.fact.at.scope}:${a.receipt.fact.seq}, hash ${a.receipt.fact.hash}, incarnation ${a.receipt.fact.at.inc}.`; break;
    case "refused": case "unavailable": case "mismatch": known = nonacceptedAnswerText(a); break;
  }
  const recovery = a.answer === "unavailable" || a.answer === "mismatch" ? [`Inspect artroom log ${acted.scope} and the original request before another act. Recovery requires the same signed envelope; this page does not retain it.`] : [];
  return [known, ...recovery, ...(acted.observation === null ? [] : [`Observation unknown: ${acted.observation} Inspect artroom log ${acted.scope}${a.answer === "accepted" ? ` and artroom show ${a.receipt.fact.at.scope}:${a.receipt.fact.seq}` : ""} before submitting another act; do not resubmit to recover observation.`])];
}
export function answerLine(acted: Acted): HTMLElement {
  return h("div", { class: "answer", role: "status" }, h("p", {}, `Known answer for ${acted.kind} on ${acted.scope}${acted.on === null ? "" : `, item ${acted.on}`}.`), answerText(acted).map((line) => h("p", {}, line)));
}
/** The actual failure screen keeps known results visible when a view reload fails. */
export function failureScreen(error: unknown, known: readonly Acted[] = []): HTMLElement {
  return h("main", { class: "screen" }, h("h1", {}, "Observation unknown"), h("p", { class: "answer bad" }, error instanceof Unreadable ? error.message : "The view could not be read."),
    known.map((result) => answerLine({ ...result, observation: result.observation ?? "The subsequent view could not be read." })),
    h("p", {}, h("a", { href: "#/settings" }, "Settings")));
}

export { actsPanel } from "./actions.ts";
