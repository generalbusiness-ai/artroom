/**
 * The page's screens, as DOM built from what the data functions return. A
 * screen shows only what was read from the room, or the scope's answer to
 * the last act; nothing here decides what a record means beyond naming it.
 *
 * | Screen | Shows |
 * |---|---|
 * | `roomScreen` | The room's issues and changes, from the directory's index and each lane's own state. |
 * | `issueScreen` | One issue: number, title, state, opener, assignees, conditions, body and comments. |
 * | `changeScreen` | One change: plan 016's states, versions, reviews by extent against the rules the lane holds, review requests, checks, links, merges with the destination's publication and its operations, and comments. |
 * | `rulesScreen` | The rules of this room, and who may change them. |
 * | `actsPanel` | The acts the caller may sign now on the scope shown, each a form whose button signs and sends it, and the scope's answer. |
 */

import { editPath } from "@generalbusiness/artroom-platform";
import type { Answer } from "@generalbusiness/artroom-contract";
import { siteAddress, Unreadable, type Acted, type ChangeView, type IssueView, type LaneRow, type Offered, type Room, type RulesView } from "./data.ts";
import { changeStates } from "./states.ts";

type Child = Node | string | null | undefined | false;

/** One element, with its attributes and children. A child that is null, undefined or false is left out. */
export function h(tag: string, attrs: Record<string, string> = {}, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

const short = (id: string | null | undefined): string => (id ? (id.length > 18 ? `${id.slice(0, 14)}...` : id) : "none");
const or = (value: string | number | null | undefined, none = "none"): string => (value === null || value === undefined || value === "" ? none : String(value));
const list = (values: readonly string[], none = "none"): string => (values.length > 0 ? values.join(", ") : none);
const state = (name: string): HTMLElement => h("span", { class: `state state-${name.replace(/[^a-z-]/g, "")}` }, name);
const field = (label: string, value: Child): HTMLElement => h("div", { class: "field" }, h("dt", {}, label), h("dd", {}, value));
const section = (title: string, ...children: (Child | Child[])[]): HTMLElement => h("section", {}, h("h2", {}, title), ...children);
const table = (head: string[], rows: Child[][]): HTMLElement =>
  rows.length === 0 ? h("p", { class: "muted" }, "None.") : h("table", {}, h("thead", {}, h("tr", {}, head.map((c) => h("th", {}, c)))), h("tbody", {}, rows.map((row) => h("tr", {}, row.map((c) => h("td", {}, c))))));

/** Who the page acts as: the caller's handle and role in membership, or that the key is no active member's. */
export function whoLine(room: Room): HTMLElement {
  const how = room.reader ? "Reads present a read session from membership." : `Membership gave no read session (${room.unsessioned ?? "none"}): each read is signed by your key, and a scope answers only where your key signed an entry in the last few minutes.`;
  return h("p", { class: "who" }, room.me ? `Signed in as ${room.me.handle} (${room.me.role}), key ${short(room.key)}. ` : `Key ${short(room.key)} is no active member's key in this room; the scopes will refuse your acts. `, h("span", { class: "muted" }, how));
}

// ---------------------------------------------------------------- the room

export function roomScreen(room: Room, lanes: { issues: LaneRow[]; changes: LaneRow[] }): HTMLElement {
  const rows = (kind: "issue" | "change", items: LaneRow[]) => items.map((row) => [
    `#${or(row.number, "?")}`, h("a", { href: `#/${kind}/${row.scope}` }, or(row.title, "(no title)")), state(or(row.state, "unknown")), row.draft ? "draft" : "",
  ]);
  return h("main", {},
    h("h1", {}, "Room"), whoLine(room),
    h("p", {}, h("a", { href: "#/rules" }, "The rules of this room"), " · ", h("a", { href: siteAddress(room, "") }, "Latest published site")),
    section("Issues", table(["Number", "Title", "State", ""], rows("issue", lanes.issues))),
    section("Changes", table(["Number", "Title", "State", ""], rows("change", lanes.changes))),
    h("p", { class: "muted" }, `Directory ${room.directory}.`),
  );
}

// ---------------------------------------------------------------- an issue

export function issueScreen(room: Room, issue: IssueView): HTMLElement {
  return h("main", {},
    h("p", {}, h("a", { href: "#/" }, "Room")),
    h("h1", {}, `${or(issue.title, "(no title)")} `, h("span", { class: "muted" }, `#${or(issue.number, "?")}`)),
    whoLine(room),
    h("dl", {},
      field("State", h("span", {}, state(issue.state), issue.closeReason ? ` (${issue.closeReason})` : "")),
      field("Opened by", or(issue.requester)),
      field("Assignees", list(issue.assignees)),
      field("Conditions", issue.conditions.length > 0 ? h("ul", {}, issue.conditions.map((c) => h("li", {}, c))) : "none"),
    ),
    issue.body ? h("p", { class: "body" }, issue.body) : null,
    section(`Comments (${issue.comments.length})`, issue.comments.length === 0 ? h("p", { class: "muted" }, "None.") : issue.comments.map((c) =>
      h("article", { class: "comment" }, h("p", { class: "meta" }, `${or(c.author)}, comment ${c.id}`, c.state !== "visible" ? `, ${c.state}` : ""), h("p", {}, or(c.body, "(text not held)"))))),
    h("p", { class: "muted" }, `Lane ${issue.scope}, read at entry ${issue.head.seq}.`),
  );
}

// ---------------------------------------------------------------- a change

export function changeScreen(room: Room, change: ChangeView, last: Answer | null): HTMLElement {
  // The version that is current, or after a merge the latest one.
  const current = change.manifests.find((m) => m.state === "current") ?? change.manifests.at(-1) ?? null;
  const states = changeStates(change, last);
  const published = change.merges.find((merge) => merge.state === "published" && merge.manifest === current?.id);
  const extents = change.rules?.extents ?? [];
  // Reviews by extent: the approvals of the current version that state each extent of the rules the lane holds.
  const byExtent = extents.map((extent) => {
    const approving = change.reviews.filter((r) => r.manifest === current?.id && r.state === "submitted" && r.verdict === "approve" && r.extent === extent.name);
    return [extent.name, `${approving.length} of ${extent.approvals}`, extent.approver, list(approving.map((r) => or(r.reviewer)))];
  });
  return h("main", {},
    h("p", {}, h("a", { href: "#/" }, "Room")),
    h("h1", {}, `${or(change.title, "(no title)")} `, h("span", { class: "muted" }, `#${or(change.number, "?")}`)),
    whoLine(room),
    h("p", {}, h("a", { href: siteAddress(room, "") }, "Latest published site")),
    h("dl", {}, field("State", state(change.state)), field("Opened by", or(change.author))),
    change.body ? h("p", { class: "body" }, change.body) : null,
    section("Where it stands", states.length === 0 ? h("p", { class: "muted" }, "No review is asked for, no merge is in progress and none has been refused.") :
      h("ul", { class: "states" }, states.map((s) => h("li", {}, h("strong", {}, s.state), `: ${s.detail}`)))),
    section("Version", current ? h("dl", {},
      field("Version", h("span", {}, `item ${current.id}${current.complete === false ? ", not complete" : ""} `, state(current.state))), field("Integrated by", or(current.integrator)), field("Authors", list(current.authors)),
      field("Base", h("code", {}, short(current.base))),
      current.file ? [
        field("File", h("code", {}, current.file.path)), field("Bytes", or(current.file.size)), field("Digest", h("code", {}, short(current.file.digest))),
        // HEAD is latest navigation, never an immutable version preview.
        // This branch has no receipt-eligible immutable site selector.
        field("Rendered page", editPath(current.file.path) === null ? "Not available for an invalid path." : published ? "Rendering this published version is not available yet." : "Not published."),
        published?.commit ? field("Recorded publication commit", h("code", {}, published.commit)) : null,
      ] : [field("Integration commit", h("code", {}, short(current.integration))), field("Tree", h("code", {}, short(current.tree)))],
    ) : h("p", { class: "muted" }, "No version is proposed yet."), change.manifests.length > 1 ? h("p", { class: "muted" }, `${change.manifests.length - 1} earlier version(s).`) : null),
    section("Reviews by extent",
      change.rules ? h("p", { class: "muted" }, `The rules this lane holds, from update ${or(change.rules.revision)} of the rules scope: ${or(change.rules.approvals)} approval(s) in the lane's own count. The destination judges each merge on the rules it observes then.`) : h("p", { class: "muted" }, "This lane holds no rules yet: it has not asked the rules scope."),
      table(["Extent", "Approvals of this version", "Counts from a member holding", "By"], byExtent),
      table(["Review", "Reviewer", "Verdict", "Extent", "Version", "State"], change.reviews.map((r) => [String(r.id), or(r.reviewer), or(r.verdict), or(r.extent), or(r.manifest), state(r.state)]))),
    section("Review requests", table(["Request", "Asked of", "Asked by", "State"], change.requests.map((r) => [String(r.id), or(r.requested), or(r.requester), state(r.state)]))),
    section("Checks", table(["Job", "Name", "Version", "State"], change.jobs.map((j) => [String(j.id), or(j.name), or(j.manifest), state(j.state)]))),
    section("Links", table(["Link", "Closes issue", "How", "State"], change.links.map((l) => [String(l.id), l.issue ? h("a", { href: `#/issue/${l.issue}` }, short(l.issue)) : "none", or(l.how), state(l.state)]))),
    section("Merges", change.merges.length === 0 ? h("p", { class: "muted" }, "None.") : change.merges.map((m) => h("article", { class: "merge" },
      h("p", {}, `Merge ${m.id} of version ${or(m.manifest)}: `, state(m.state), m.reason ? ` (${m.reason})` : "", m.commit ? `, commit ${short(m.commit)}` : ""),
      m.publication ? h("p", { class: "muted" }, `The destination's publication ${m.publication.id}: ${m.publication.state}${m.publication.reason ? ` (${m.publication.reason})` : ""}.`) : h("p", { class: "muted" }, "The destination has recorded no publication for it yet."),
      m.publication && m.publication.operations.length > 0 ? table(["Outside operation", "Kind", "Attempts"], m.publication.operations.map((o) => [o.id, o.kind, list(o.attempts, "none yet")])) : null,
    ))),
    section(`Comments (${change.comments.length})`, change.comments.length === 0 ? h("p", { class: "muted" }, "None.") : change.comments.map((c) =>
      h("article", { class: "comment" }, h("p", { class: "meta" }, `${or(c.author)}, comment ${c.id}`), h("p", {}, or(c.body, "(text not held)"))))),
    h("p", { class: "muted" }, `Lane ${change.scope}, read at entry ${change.head.seq}.`),
  );
}

// ---------------------------------------------------------------- the rules

export function rulesScreen(room: Room, rules: RulesView): HTMLElement {
  return h("main", {},
    h("p", {}, h("a", { href: "#/" }, "Room")),
    h("h1", {}, "The rules of this room"), whoLine(room),
    h("p", {}, `A controller may change them: a member whose role holds rules.publish. In this room: ${list(rules.controllers, "nobody")}. A change of the rules is the act publish on the rules scope; the destination judges each merge on the rules it observes then.`),
    h("dl", {},
      field("Revision", rules.revision === null ? "none published yet" : `${rules.revision}, the position of the last publish in the rules scope`),
      field("Approvals the lanes count", or(rules.approvals)),
      field("An author's agent controller may review", rules.ownerMayReview === null ? "not stated" : rules.ownerMayReview ? "yes" : "no"),
      field("Single-controller exception", rules.singleControllerException ? "declared: the one controller may land a rules change that they author" : "not declared"),
      field("Required checks", list(rules.checks.filter((c) => c.required).map((c) => c.name))),
      field("Labels", list(rules.labels)),
    ),
    section("Extents", rules.extents === null ? h("p", { class: "muted" }, "No extents are published yet.") :
      table(["Extent", "Class", "Approvals", "Counts from a member holding", "Required checks", "Paths"], rules.extents.map((e) => [e.name, e.class, String(e.approvals), e.approver, list(e.checks), list(e.patterns ?? [], "every path that no pattern of the rules matches")]))),
    section("Active definitions", table(["Name", "Digest", "State"], rules.definitions.map((d) => [d.name, h("code", {}, short(d.digest)), state(d.state)]))),
    h("p", { class: "muted" }, `Rules scope ${rules.scope}, read at entry ${rules.head.seq}.`),
  );
}

// ---------------------------------------------------------------- acts

/** Known submit result and separate observation phase. No head is invented. */
export function answerText(acted: Acted): string[] {
  const a = acted.answer;
  let known: string;
  switch (a.answer) {
    case "accepted": known = `Accepted ${acted.kind}: ${a.receipt.fact.at.scope}:${a.receipt.fact.seq}, hash ${a.receipt.fact.hash}, incarnation ${a.receipt.fact.at.inc}.`; break;
    case "refused": known = `Refused: ${a.reason}${"name" in a && a.name ? ` (${a.name})` : ""}. Nothing was written by this request.`; break;
    case "unavailable": known = `Unavailable: ${a.reason}.`; break;
    case "mismatch": known = `Mismatch: ${a.reason}.`; break;
  }
  return [known, ...(acted.observation === null ? [] : [`Observation unknown: ${acted.observation} Inspect artroom log ${acted.scope}${a.answer === "accepted" ? ` and artroom show ${a.receipt.fact.at.scope}:${a.receipt.fact.seq}` : ""} before submitting another act; do not resubmit to recover observation.`])];
}
export function answerLine(acted: Acted): HTMLElement {
  return h("div", { class: "answer", role: "status" }, h("p", {}, `Known answer for ${acted.kind} on ${acted.scope}${acted.on === null ? "" : `, item ${acted.on}`}.`), answerText(acted).map((line) => h("p", {}, line)));
}
/** The actual failure screen keeps known results visible when a view reload fails. */
export function failureScreen(error: unknown, known: readonly Acted[] = []): HTMLElement {
  return h("main", {}, h("h1", {}, "Observation unknown"), h("p", { class: "answer bad" }, error instanceof Unreadable ? error.message : "The view could not be read."),
    known.map((result) => answerLine({ ...result, observation: result.observation ?? "The subsequent view could not be read." })),
    h("p", {}, h("a", { href: "#/settings" }, "Settings")));
}

/**
 * The acts the caller may sign now, each as a form. A transition names the
 * item it is on; each field is typed as its declared type reads it. The
 * button signs the act with the caller's key and sends it.
 */
export function actsPanel(offered: { acts: Offered[]; hidden: number }, send: (kind: string, on: string, typed: Record<string, string>) => void, last: HTMLElement | null): HTMLElement {
  return section("What you may do here",
    last,
    offered.acts.length === 0 ? h("p", { class: "muted" }, "Your role holds no act of this definition.") : offered.acts.map((a) => {
      const form = h("form", { "data-act": a.kind },
        a.step === "transition" ? h("label", {}, "On item ", h("input", { name: "on", inputmode: "numeric", value: "0" })) : null,
        a.fields.map((f) => h("label", {}, `${f.name} (${f.type}${f.required ? "" : ", optional"}) `, f.choices
          ? h("select", { name: `field:${f.name}`, "data-type": f.type }, f.choices.length === 0 ? h("option", { value: "" }, "the rules scope holds no definition active") : f.choices.map((c) => h("option", { value: c.value }, c.label)))
          : h("input", { name: `field:${f.name}`, "data-type": f.type }))),
        h("button", { type: "submit" }, `Sign and send ${a.kind}`),
      );
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form as HTMLFormElement);
        const typed: Record<string, string> = {};
        for (const [name, value] of data.entries()) if (name.startsWith("field:") && String(value) !== "") typed[name.slice(6)] = String(value);
        send(a.kind, String(data.get("on") ?? ""), typed);
      });
      return h("details", {}, h("summary", {}, a.line), form);
    }),
    offered.hidden > 0 ? h("p", { class: "muted" }, `Not shown: ${offered.hidden} act(s) that need an action your role does not hold.`) : null,
  );
}
