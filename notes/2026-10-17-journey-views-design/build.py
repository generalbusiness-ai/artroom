"""Build static design examples. No service, signing, or package dependencies."""

from pathlib import Path
from html import escape
import hashlib
import json

ROOT = Path(__file__).resolve().parent
COMMITS = {
    "Base": "8475e1beda99cd9b32d3617f1fb255664090fbe0",
    "Version 1 source": "94e6b0427e0779b4cd686d3c46ec196cf105aacc",
    "Version 2 source": "569c9aeed9e74b4d803f874cfbfbd90a9218c24d",
    "Version 1 integration": "62a6aced9f5b9e2473d33960fb336721de14582f",
    "Version 2 integration": "6ef56437b0cf81a1d95c2a00b7c539d1856e0fdf",
    "Change 9 integration": "1faf54e188a46dd8edeb5ead4adb7f9fbee10fb4",
    "Change 18 integration": "d664779063515feb27b0532f708970d1c4f68008",
    "Change 18 source": "edc3a252bcf84cdd0fb28ea459bf6419106ea223",
}
E = escape


def url(key, theme):
    return f"{key}-{theme}.html"


def link(key, text, theme, secondary=False, action=None):
    attrs = f' data-prototype-action="{E(action, quote=True)}"' if action else ""
    css = "button secondary" if secondary else "button"
    return f'<a class="{css}" href="{url(key, theme)}"{attrs}>{E(text)}</a>'


def text_link(key, text, theme):
    return f'<a href="{url(key, theme)}">{E(text)}</a>'


def disabled(text):
    return f'<button class="button" disabled>{E(text)}</button>'


def actor(name, kind="agent", controller="Ari"):
    extra = f'<span class="controller">Controlled by {E(controller)}</span>' if kind == "agent" else ""
    return f'<div class="actor"><span class="actor-mark {kind}" aria-hidden="true"></span><div class="actor-copy">{E(name)} · {kind}{extra}</div></div>'


def notice(title, text, kind=""):
    return f'<section class="notice {kind}"><h2>{E(title)}</h2><p>{E(text)}</p></section>'


def comment(label="Comment", value="Keep earlier tasks recoverable after clearing."):
    return f'<label for="comment">{E(label)}</label><textarea id="comment" readonly aria-describedby="example-comment">{E(value)}</textarea><p id="example-comment" class="receipt">Example comment, read-only in this static mockup.</p>'


def full_commits(labels):
    rows = "".join(f'<dt>{E(name)}</dt><dd>{COMMITS[name]}</dd>' for name in labels)
    return f'<details><summary>Full commits</summary><dl class="full-commits">{rows}</dl></details>'


def heading(title, crumb=None):
    return (f'<p class="crumb">{E(crumb)}</p>' if crumb else "") + f'<h1>{E(title)}</h1>'


def needs(theme, state):
    content = heading("Needs you")
    if state == "loading":
        return content + notice("Reading your work", "Reading the requested scopes and your saved review points. No write action is available yet.")
    if state == "unavailable":
        return content + notice("The current record could not be read", "Your last saved review points remain unchanged. This is not an empty list.") + link("needs-you", "Read again", theme, True)
    if state == "empty":
        return content + notice("Nothing needs you at this read point", "The inspected scopes have no matching open request. Future updates can add work.") + '<p class="receipt">3 scopes checked · read points available</p>' + link("work-active", "Open Work", theme, True)
    partial = state == "partial"
    reviewed = state == "reviewed"
    count = "6 new entries loaded; more may remain" if partial else "0 new entries since your last review" if reviewed else "7 new entries since your last review"
    mark = disabled("Mark reviewed") if partial else link("needs-reviewed", "Mark reviewed", theme, True, "mark-reviewed")
    if reviewed:
        mark = '<span class="receipt">Review points saved for the inspected scopes</span>'
    checked = "2 of 3 scopes checked" if partial else "3 scopes checked"
    content += f'<section class="band"><strong>{count}</strong><span class="receipt">{checked}</span>{mark}<p class="muted">Reading an item leaves its work open.</p></section>'
    if partial:
        content += notice("More updates have not been loaded", "This read reached its entry limit. One scope has not been read. Its previous review point is retained.")
        content += '<div class="actions">' + link("needs-you", "Load more", theme, True) + '<p class="muted">Only a complete inspected range can advance its review point.</p></div>'
    rows = [
        ("Keep completed tasks in history?", "Storage agent", "agent", "A product decision is waiting.", "You were asked to approve text v2.", "Review the alternatives and record your choice.", "decision-requested", "Read decision", "question-7"),
        ("Improve empty-list message · version 2", "Interface agent", "agent", "A change is ready for review.", "Your review is requested.", "Review this version before merging.", "change-secondary", "Review change", "change-18"),
        ("Keyboard focus fix · outcome unknown", "Ari", "person", "The merge reply did not arrive.", "You sent the original request.", "Check that request’s outcome.", "change-unknown", "Check outcome", "change-9"),
    ]
    for title, name, kind, what, why, settles, dest, action, subject in rows:
        snapshot = '<p class="receipt">Last known item; this scope has not been read.</p>' if partial and subject == "change-9" else ""
        content += f'<article class="needs-row" data-subject="{subject}"><div class="needs-title"><h2>{E(title)}</h2>{actor(name, kind)}{snapshot}</div>'
        for label, value in [("What needs you", what), ("Why you", why), ("What settles it", settles)]:
            content += f'<div><span class="label">{label}</span><p>{E(value)}</p></div>'
        content += link(dest, action, theme) + '</article>'
    return content + f'<footer class="foot receipt">3 items shown · {checked}</footer>'


def conditions(version):
    values = ["Add Clear completed to the task list.", "Hide completed tasks from the active list.", "Do not change unfinished tasks."] if version == 1 else ["Keep completed tasks in history.", "Hide them from the active list.", "Keep earlier tasks recoverable."]
    entry = 220 if version == 1 else 250
    return f'<section class="section"><div class="section-heading"><h2>Current conditions</h2><span class="receipt">Terms v{version} · entry {entry}</span></div><div class="conditions">' + "".join(f'<p>{E(v)}</p>' for v in values) + '</div></section>'


def work(theme, state):
    renewing = state in ["terms-changed", "reoffered-interface", "reoffered-storage", "reoffered"]
    starting = state in ["ready", "offered-interface", "offered-storage", "offered"]
    version = 2 if renewing or state in ["resumed", "delivered"] else 1
    content = heading("Work") + '<h2>Clear completed</h2><p>Add a button that clears completed tasks from the active list.</p>' + conditions(version)
    if state == "terms-changed":
        content += notice("Conditions changed; old commitments still name v1", "A recorded decision adopted history retention. New offers must name v2. The existing commitments are not relabelled.")
    if state == "stalled":
        content += notice("No later activity is known at this read point", "Storage agent’s last recorded update is issue entry 245. The cause of the stall is not known; this is not a live heartbeat.")
    content += '<section class="section"><h2>Agent work</h2><div class="work-head" aria-hidden="true">' + "".join(f'<span class="label">{x}</span>' for x in ["Agent", "Assignment", "Terms", "State", "Next"]) + '</div>'
    for i, (name, task) in enumerate([("Interface agent", "Button and empty list"), ("Storage agent", "Storage and history")]):
        terms = "v2 · accepted" if state in ["resumed", "delivered"] else "v1 · accepted"
        status = "Working" if i == 0 else "Waiting for a decision"
        dest, action = ("change-review", "View change") if i == 0 else ("decision-requested", "Read decision")
        as_button = False
        if starting or renewing:
            prefix = "reoffered" if renewing else "offered"
            offered = state == prefix or state == f"{prefix}-{'interface' if i == 0 else 'storage'}"
            terms = f"v{version} · offered" if offered else ("v1 · accepted" if renewing else "v1 · not offered")
            status = "Waiting for acceptance" if offered else ("Old terms" if renewing else "Ready for an offer")
            dest = f"work-{prefix}" if state in [f"{prefix}-interface", f"{prefix}-storage"] else f"work-{prefix}-{'interface' if i == 0 else 'storage'}"
            action, as_button = "Offer current terms" if renewing else "Offer work", True
        elif state == "resumed":
            status, dest, action = "Working", "change-review", "View change"
        elif state == "delivered":
            status, dest, action = "Delivered by Change 12", "change-published", "Read publication"
        next_action = link(dest, action, theme, True, "offer") if as_button and status not in ["Waiting for acceptance"] else text_link(dest, action, theme)
        if status == "Waiting for acceptance":
            next_action = '<span class="muted">The offeree accepts</span>'
        old = '<p class="receipt">Old commitment: v1 · still accepted. This offer is a new commitment.</p>' if renewing and offered else ''
        content += f'<article class="work-row" data-subject="commitment-{i + 1}">{actor(name)}<div><span class="label cell-label">Assignment</span>{E(task)}</div><div><span class="label cell-label">Terms</span><span class="receipt">{terms}</span>{old}</div><div><span class="label cell-label">State</span>{E(status)}</div><div><span class="label cell-label">Next</span>{next_action}</div>'
        if i == 1 and state in ["active", "stalled"]:
            content += '<p class="block receipt">Blocked by: Keep completed tasks in history?</p>'
        content += '</article>'
    content += '</section><section class="section"><h2>Recent record</h2>'
    entries = [(221, "Ari", "person", "offered terms v1"), (223, "Interface agent", "agent", "accepted terms v1"), (245, "Storage agent", "agent", "updated question text")]
    if starting:
        entries = [(220, "Ari", "person", "recorded conditions v1")]
        if state in ["offered-interface", "offered-storage"]:
            target = "Interface agent" if state == "offered-interface" else "Storage agent"
            entries += [(221, "Ari", "person", f"offered terms v1 to {target}")]
        elif state == "offered":
            entries += [(221, "Ari", "person", "offered terms v1 to the first agent"), (222, "Ari", "person", "offered terms v1 to the other agent")]
    if renewing:
        entries = [(247, "Ari", "person", "recorded the decision on text v2"), (250, "Ari", "person", "revised conditions to v2")]
        if state != "terms-changed":
            entries += [(251, "Ari", "person", "made a new offer naming v2")]
        if state == "reoffered":
            entries += [(252, "Ari", "person", "made the other new offer naming v2")]
    if state in ["resumed", "delivered"]:
        entries = [(250, "Ari", "person", "revised conditions to v2"), (253, "Interface agent", "agent", "accepted the new offer naming v2"), (255, "Storage agent", "agent", "released the old block using decision entry 247")]
    for entry, name, kind, text in entries:
        content += f'<div class="record-row"><span class="receipt">entry {entry}</span>{actor(name, kind)}<p>{E(text)}</p></div>'
    content += '</section>'
    if starting:
        return content + '<div class="actions">' + link("work-active", "Read latest record", theme, True) + '<p class="muted">Each offer names one agent and the current terms. Only the named offeree can accept it.</p></div>'
    if renewing:
        return content + '<div class="actions">' + link("work-resumed", "Read latest record", theme, True) + '<p class="muted">Each new offer is recorded separately. The later snapshot includes the agents’ own acceptances, block release, and cancellation of old commitments.</p></div>'
    return content + '<div class="actions">' + link("work-ready", "Offer work", theme, True) + '<p class="muted">Each offer names one agent and the current terms.</p></div>'


def decision(theme, state):
    if state == "stale":
        return heading("Proposal: delete completed tasks permanently.", "Needs you / Decision") + '<div class="meta"><p class="receipt">Old text v1 · entry 238</p>' + actor("Storage agent") + '</div>' + notice("This proposal text changed", "The approval of text v1 was refused after text v2 arrived. Nothing was approved for the newer text.", "refusal") + comment("Comment on text v1") + '<div class="actions">' + link("decision-requested", "Read text v2", theme, True) + '</div>'
    title = "Proposal: keep completed tasks in history when they are cleared."
    content = heading(title, "Needs you / Decision")
    request_text = "Ari’s approval was requested for this exact text." if state in ["refused", "unrequested"] else "Your approval was requested for this exact text."
    content += '<div class="meta"><p class="receipt">Text v2 · entry 245</p>' + actor("Storage agent") + f'<p>{request_text}</p><p class="receipt">Clear completed · terms v1</p></div>'
    content += '<section class="section"><div class="alternatives"><div><h2>Proposed: Keep history</h2><p>Remove tasks from the active list. Earlier work stays recoverable.</p></div><div><h2>Alternative: Delete permanently</h2><p>Remove tasks and their history. Accidental clearing cannot be undone.</p></div></div><p class="recommendation"><span class="actor-mark agent" aria-hidden="true"></span>Storage agent recommends keeping history.</p></section>'
    status = {"requested": "Waiting for your approval of v2.", "changes": "You requested changes to text v2.", "approved": "You approved this exact text v2.", "decided": "Decision recorded: keep history.", "refused": "The agent’s approval was refused; no approval was recorded.", "unrequested": "Rin is not a requested approver for text v2."}[state]
    content += '<section class="section approver"><div><p class="muted">Requested approver</p>' + actor("Ari", "person") + f'</div><div><span class="label">Status</span><p>{status}</p></div></section>'
    if state in ["refused", "unrequested"]:
        reason = "Interface agent is an agent controlled by Ari. It cannot stand in for Ari’s approval of text v2." if state == "refused" else "Rin is a person, but Ari is the requested approver for this exact text. Person membership alone does not grant this approval."
        content += notice("Only the requested person can approve", reason, "refusal")
        content += comment() + '<div class="actions">' + disabled("Approve text v2") + link("needs-you", "Back to Needs you", theme, True) + '</div>'
        return content
    if state == "changes":
        return content + notice("Changes requested on text v2", "The comment is kept with this version. A later text needs its own requested approval.", "refusal") + comment() + '<div class="actions">' + link("work-active", "Back to Work", theme, True) + '</div>'
    if state == "decided":
        return content + notice("The decision is recorded", "Decision entry 247 names text v2. Current work conditions still name v1 until the owner revises them.", "confirmed") + '<div class="actions">' + link("work-terms-changed", "Revise the work conditions", theme, action="revise-conditions") + '<p class="muted">This is a separate act by the person authorised to revise the work.</p></div>'
    content += comment() + '<div class="actions">'
    if state == "approved":
        content += link("decision-decided", "Record decision", theme, action="decide") + '<p class="muted">All requested approvals for text v2 are complete. Conditions are still unchanged.</p>'
    else:
        content += link("decision-approved", "Approve text v2", theme, action="approve-text") + link("decision-changes", "Request changes", theme, True, "request-changes") + disabled("Record decision") + '<p class="muted">Record the decision after the requested approvals are complete.</p>'
    return content + '</div><p class="muted foot">Approving the text does not change the work’s conditions.</p>'


def change(theme, state):
    secondary = state.startswith("secondary")
    recovery = state in ["unknown", "recovery-unavailable"]
    number, version, title = (9, 1, "Keyboard focus fix") if recovery else (18, 2, "Improve empty-list message") if secondary else (12, 1 if state == "stale" else 2, "Clear completed")
    integration_label = "Change 9 integration" if recovery else "Change 18 integration" if secondary else f"Version {version} integration"
    integration = COMMITS[integration_label]
    content = heading(title, f"Work / {title} / Change {number}") + f'<p class="receipt change-version">Version {version}</p>' + actor("Ari", "person") if recovery else heading(title, f"Work / {title} / Change {number}") + f'<p class="receipt change-version">Version {version}</p>' + actor("Interface agent")
    if secondary:
        content += f'<div class="hashes"><span>Base <code>{COMMITS["Base"][:7]}</code></span><span>Source <code>{COMMITS["Change 18 source"][:7]}</code></span><span>Integration <code>{integration[:7]}</code></span>{full_commits(["Base", "Change 18 source", "Change 18 integration"])}</div>'
        if state == "secondary-published":
            return content + notice("Publication confirmed", "The recorded result confirms Change 18 at refs/heads/main.", "confirmed") + f'<p>Published commit <code>{integration}</code></p>' + link("needs-you", "Back to Needs you", theme, True)
        content += '<section class="section"><h2>Changes</h2><p><code>src/TaskList.tsx</code></p>' + text_link("file-secondary-diff", "Read this change’s diff", theme) + '</section><section class="section"><h2>Agreed condition</h2><p>Use a clear message when the active list is empty.</p></section><section class="section"><h2>Checks</h2>' + actor("Repository checker", "checker") + f'<p class="receipt">Passed for integration {integration[:7]}</p><h2>Requested review</h2>' + actor("Ari", "person") + '</section><p class="receipt">Ari controls the proposing agent. Repository rules allow controller review and require this integration’s check.</p><div class="actions">'
        content += link("change-secondary-published", "Merge version 2", theme, action="merge-version") if state == "secondary-approved" else link("change-secondary-approved", "Approve version 2", theme, action="review-version") + disabled("Merge version 2")
        return content + '</div>'
    if recovery:
        text = "Your merge was sent, but its reply did not arrive. The original request is kept." if state == "unknown" else "The original request cannot be reached from this device. It remains unresolved; no replacement merge is offered."
        content += notice("Publication outcome unknown" if state == "unknown" else "Original request unavailable here", text)
        content += f'<div class="meta"><p>Version {version}</p><p class="receipt">Integration {integration[:7]}</p><p class="receipt">Original request · {"kept" if state == "unknown" else "not reachable"}</p></div>' + full_commits([integration_label])
        content += '<div class="actions">' + (link("change-keyboard-published", "Check original request", theme, action="settle-original") if state == "unknown" else link("change-unknown", "Reconnect and check original request", theme, True)) + '</div><p class="muted foot">This checks the saved request. It does not start another merge.</p>'
        return content + text_link("needs-you", "Back to Needs you", theme) + '<section class="section"><h2>What happens next</h2><p>A confirmed result shows the published commit. If it is still unknown, this view stays open.</p></section>'
    if state == "keyboard-published":
        return heading("Keyboard focus fix", "Change 9 / Version 1") + actor("Ari", "person") + notice("Publication confirmed", "The original request’s result confirms publication to refs/heads/main.", "confirmed") + f'<p>Published commit <code>{COMMITS["Change 9 integration"]}</code></p>' + full_commits(["Change 9 integration"]) + link("needs-you", "Back to Needs you", theme, True)
    content += f'<div class="hashes"><span>Base <code>{COMMITS["Base"][:7]}</code></span><span>Source <code>{COMMITS[f"Version {version} source"][:7]}</code></span><span>Integration <code>{integration[:7]}</code></span>{full_commits(["Base", f"Version {version} source", integration_label])}</div>'
    if state == "stale":
        return content + notice("This view names an older version", "The approval of version 1 was refused after version 2 arrived. Nothing was approved for version 2; the original comment remains with version 1.", "refusal") + comment("Comment on version 1", "Keep the empty-list message clear.") + '<div class="actions">' + link("change-review", "Read version 2", theme, True) + '</div>'
    if state == "published":
        return content + notice("Publication confirmed", "The recorded result confirms the exact integration at refs/heads/main.", "confirmed") + f'<p>Published commit <code>{integration}</code></p><p>The work is delivered by Change 12. This state is based on the publication result, not a submitted intent.</p>' + link("work-delivered", "Read Work", theme, True)
    if state == "changes":
        return content + notice("Changes requested on version 2", "The requested reviewer’s comment and verdict name this version. A later version needs a fresh review.", "refusal") + comment("Comment on version 2", "Please keep the empty-list message clear.") + disabled("Merge version 2") + '<div class="actions">' + link("work-resumed", "Read Work", theme, True) + '</div>'
    content += '<div class="split"><div><section class="section"><h2>Changes</h2><div class="file-row"><code>src/tasks.ts</code>' + text_link("file-diff", "Read diff", theme) + text_link("file-interdiff", "Compare with version 1", theme) + '</div></section><section class="section"><h2>Agreed conditions</h2><p class="receipt">Terms v2 · entry 250</p><p>Keep completed tasks in history.<br>Hide them from the active list.</p>' + text_link("decision-decided", "Decision: keep history · text v2", theme) + '</section><section class="section">' + comment(f"Comment on version {version}", "History is preserved. Please keep the empty-list message clear.") + '</section></div><aside class="side"><h2>Checks</h2>' + actor("Repository checker", "checker")
    check = "No checks ran for this integration." if state == "no-checks" else "Required check failed for this integration." if state == "check-failed" else f"Passed for integration {integration[:7]}"
    content += f'<p class="receipt">{check}</p><section class="section"><h2>Requested review</h2>' + actor("Ari", "person") + f'<p class="receipt">{"Approved for this version" if state in ["approved", "no-checks", "check-failed"] else "Waiting"}</p></section><p class="receipt">Ari controls the proposing agent. Repository rules allow controller review and require a current integration check and a requested person’s review.</p><div class="actions">'
    if state == "approved":
        content += link("change-published", "Merge version 2", theme, action="merge-version") + '<p class="muted">The approval, required check, and displayed integration all name this version.</p>'
    elif state in ["no-checks", "check-failed"]:
        content += disabled("Merge version 2") + '<p class="muted">The required check is missing or failed. Approval is not a substitute for that check.</p>'
    else:
        content += link("change-approved", "Approve version 2", theme, action="review-version") + link("change-changes", "Request changes", theme, True, "request-changes") + disabled("Merge version 2") + '<p class="muted">Approval of this version is still needed.</p>'
    return content + '</div></aside></div>'


DIFF = [
    (12, 12, " ", "export function clearCompleted(tasks) {", ""),
    (13, None, "−", "  return tasks.filter(task => !task.completed);", "remove"),
    (None, 13, "+", "  return tasks.map(task => task.completed", "add"),
    (None, 14, "+", "    ? { ...task, archived: true }", "add"),
    (None, 15, "+", "    : task);", "add"),
    (14, 16, " ", "}", ""),
]


def reader(theme, state):
    if state == "secondary-diff":
        content = heading("src/TaskList.tsx", "Change 18 / Version 2") + f'<div class="hashes"><span>Base {COMMITS["Base"][:7]} → Integration {COMMITS["Change 18 integration"][:7]}</span>{full_commits(["Base", "Change 18 integration"])}</div><p>All changed lines of this file</p><div class="code-pane"><div class="code-heading">src/TaskList.tsx</div>'
        content += '<div class="code-gutters"><span>Old</span><span>New</span><span></span><span>Code</span></div>'
        for old, new, sign, code, kind in [(8, None, "−", '<p>No tasks.</p>', "remove"), (None, 8, "+", '<p>Nothing left to do.</p>', "add")]:
            content += f'<div class="diff-line {kind}"><span class="old">{old or ""}</span><span class="new">{new or ""}</span><span class="sign">{sign}</span><code>{E(code)}</code></div>'
        return content + '</div>' + link("change-secondary", "Back to Change 18", theme, True)
    active = "File" if state == "file" else "Interdiff" if state == "interdiff" else "Diff"
    content = heading("src/tasks.ts", "Change 12 / Version 2") + '<nav class="tabs" aria-label="Reader">'
    for key, title in [("file-file", "File"), ("file-diff", "Diff"), ("file-interdiff", "Interdiff")]:
        content += f'<a href="{url(key, theme)}"' + (' aria-current="page"' if title == active else '') + f'>{title}</a>'
    content += '</nav>'
    labels = ["Version 2 integration"] if active == "File" else ["Base", "Version 1 integration", "Version 2 integration"] if active == "Interdiff" else ["Base", "Version 2 integration"]
    if active == "File":
        caption = f'Commit {COMMITS["Version 2 integration"][:7]}'
    elif active == "Interdiff":
        caption = f'Version 1 · {COMMITS["Version 1 integration"][:7]} → Version 2 · {COMMITS["Version 2 integration"][:7]}'
    else:
        caption = f'Base {COMMITS["Base"][:7]} → Integration {COMMITS["Version 2 integration"][:7]}'
    content += f'<div class="hashes"><span>{caption}</span>' + ('<span>Same base · 8475e1b</span>' if active == "Interdiff" else '<span>Version 2</span>') + full_commits(labels) + '</div>'
    if state == "unavailable":
        return content + notice("This pinned file could not be read", "Its endpoints remain fixed. A failed read does not mean the file is empty or unchanged.") + link("file-diff", "Read the same endpoints again", theme, True)
    content += '<p>' + ("Changes since version 1" if active == "Interdiff" else "1 of 2 files · partial read" if state == "truncated" else "1 of 2 files · lines 12–16" if active == "File" else "1 of 2 files · all changed lines of this file") + '</p>'
    if state == "truncated":
        content += notice("Truncated", "More changes were omitted by the read limit. The missing lines are not unchanged lines.")
    content += '<div class="code-pane"><div class="code-heading">src/tasks.ts</div>' + ('<div class="code-gutters file"><span>Line</span><span>Code</span></div>' if active == 'File' else '<div class="code-gutters"><span>Old</span><span>New</span><span></span><span>Code</span></div>')
    if active == "File":
        for old, new, sign, code, kind in DIFF:
            if kind != "remove":
                content += f'<div class="diff-line file"><span class="new">{new}</span><code>{E(code)}</code></div>'
    else:
        for old, new, sign, code, kind in (DIFF[:3] if state == "truncated" else DIFF):
            content += f'<div class="diff-line {kind}"><span class="old">{old or ""}</span><span class="new">{new or ""}</span><span class="sign">{sign}</span><code>{E(code)}</code></div>'
    content += '</div><div class="endpoints"><span class="receipt">' + ("At commit: 6ef5643" if active == "File" else "Version 1: 62a6ace" if active == "Interdiff" else "Before: 8475e1b") + '</span>' + ('' if active == "File" else '<span class="receipt">' + ("Version 2: 6ef5643" if active == "Interdiff" else "After: 6ef5643") + '</span>') + '</div>'
    helper = "Both versions are pinned. This is not a comparison with the current branch." if active == "Interdiff" else "Review and approval stay bound to version 2."
    return content + '<div class="actions">' + link("change-review", "Back to change", theme, True) + f'<p class="muted">{helper}</p></div>'


SPECS = [
    *[(f"needs-{s}" if s != "current" else "needs-you", "Needs you", s, needs) for s in ["current", "reviewed", "partial", "empty", "loading", "unavailable"]],
    *[(f"work-{s}", "Work", s, work) for s in ["ready", "offered-interface", "offered-storage", "offered", "active", "terms-changed", "reoffered-interface", "reoffered-storage", "reoffered", "resumed", "stalled", "delivered"]],
    *[(f"decision-{s}", "Decision", s, decision) for s in ["requested", "changes", "approved", "decided", "refused", "unrequested", "stale"]],
    *[(f"change-{s}", "Change", s, change) for s in ["review", "changes", "secondary", "secondary-approved", "secondary-published", "approved", "stale", "no-checks", "check-failed", "unknown", "recovery-unavailable", "published", "keyboard-published"]],
    *[(f"file-{s}", "File and diff", s, reader) for s in ["file", "diff", "interdiff", "truncated", "unavailable", "secondary-diff"]],
]


def document(theme, key, family, state, body):
    current = "work" if family == "Work" else "needs"
    logo = "dist/dap-wordmark-white.svg" if theme == "dark" else "dap-wordmark-green.svg"
    # The agent-refusal example deliberately changes the fixture actor. A real
    # view gets its authenticated actor from the service, never from its URL.
    viewer = "Interface agent · agent<span class=\"controller\">Controlled by Ari</span>" if key == "decision-refused" else "Rin · person" if key == "decision-unrequested" else "Ari · person"
    return f'''<!doctype html>
<html lang="en" data-theme="{theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Static design example. Links navigate sample states and send no live acts."><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; connect-src 'none'"><title>dap design · {E(family)} · {E(state)} · {theme}</title><link rel="icon" href="../../brand/dist/favicon.svg"><link rel="stylesheet" href="mockups.css"></head>
<body data-example="{key}" data-family="{E(family)}"><div class="shell"><header class="masthead"><a href="{url('needs-you', theme)}" aria-label="dap Needs you"><img class="wordmark" src="../../brand/{logo}" alt="dap" width="108" height="64"></a><span class="room">Task list</span><div class="viewer">{viewer}</div></header><nav class="nav" aria-label="Room"><a href="{url('needs-you', theme)}"{' aria-current="page"' if current == 'needs' else ''}>Needs you</a><a href="{url('work-active', theme)}"{' aria-current="page"' if current == 'work' else ''}>Work</a></nav><main>{body}</main></div></body></html>
'''


def main():
    pages = []
    for theme in ["light", "dark"]:
        for key, family, state, build in SPECS:
            text = document(theme, key, family, state, build(theme, state))
            path = ROOT / url(key, theme)
            path.write_text(text)
            pages.append({"key": key, "family": family, "state": state, "theme": theme, "path": path.name, "sha256": hashlib.sha256(text.encode()).hexdigest()})
        rows = "".join(f'<tr><td>{E(family)}</td><td>{text_link(key, state.replace("-", " "), theme)}</td><td class="receipt">{E(key)}</td></tr>' for key, family, state, _ in SPECS)
        body = heading("Journey design examples") + '<p>Static examples only. Links show sample states; they send no live acts. All identities, records, and commits are fictional.</p><p>' + text_link("index", "Switch to " + ("dark" if theme == "light" else "light"), "dark" if theme == "light" else "light") + '</p><table class="catalogue"><thead><tr><th>View</th><th>State</th><th>Example</th></tr></thead><tbody>' + rows + '</tbody></table>'
        (ROOT / url("index", theme)).write_text(document(theme, "index", "Catalogue", "all states", body))
    manifest = {"kind": "static-design-fixtures", "noLiveActs": True, "themes": ["light", "dark"], "commits": COMMITS, "pages": pages, "stateCount": len(SPECS), "pageCount": len(pages), "renderStatus": "Generation alone proves no browser result. See renders/render-index.json for separate evidence."}
    (ROOT / "mockups.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {len(pages)} static mockups, two catalogues, and fixture metadata. No service calls.")


if __name__ == "__main__":
    main()
