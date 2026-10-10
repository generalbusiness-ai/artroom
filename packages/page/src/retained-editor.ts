/** Task-specific retained-text editor. All names/source are inert DOM text. Loaded-Page memory only. */
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { editPath } from "@generalbusiness/artroom-platform";
import { actAssociation, type ChangeView, type Room } from "./data.ts";
import { h } from "./view.ts";
import { checkEditRequest, continueEdit, editFields, prepareEdit, type EditDraft, type EditTask } from "./retained-editor-data.ts";

interface DraftRecord { draft: EditDraft; task?: EditTask; preparing: boolean; opened: boolean; message: string }
const drafts = new Map<string, DraftRecord>();
export interface RetainedEditorOptions { current(): boolean; recorded?(lane: ScopeId): void }

export function retainedEditor(room: Room, change: ChangeView, options: RetainedEditorOptions): HTMLElement {
  const selected = change.manifests.find(m => m.state === "current") ?? change.manifests.at(-1);
  if (!selected?.file || typeof selected.file.content !== "string") return h("p", { class: "muted" }, "Editing needs verified retained text; this source is unavailable.");
  const key = `${actAssociation(room, change.scope)}:${selected.id}:${selected.file.digest}`;
  let kept = drafts.get(key);
  if (!kept) { kept = { draft: { title: `Edit ${selected.file.path}`.slice(0, 128), path: editPath(selected.file.path) ? selected.file.path : "", content: selected.file.content }, preparing: false, opened: false, message: "" }; drafts.set(key, kept); }
  const record = kept;
  // Release only a definitely-unsent task in its original mounted context.
  // A stopped task may already contain accepted work or an uncertain receipt.
  const canReturnToDraft = (task: EditTask): boolean => record.task === task && !record.preparing && !task.busy
    && (task.state === "prepared" || task.state === "stopped") && options.current()
    && task.association === actAssociation(room, change.scope)
    && task.context.service === room.session.service.replace(/\/+$/, "") && task.context.key === room.key
    && canonicalize(task.context.membership) === canonicalize(room.membership)
    && task.context.directory.scope === room.directory && canonicalize(task.context.directory) === canonicalize(task.directory)
    && task.context.rules === room.rules && task.context.destination === room.destination
    && task.source.scope.scope === change.scope && task.source.manifest === selected.id && task.source.digest === selected.file!.digest
    && task.lane === undefined && task.proposal === undefined && task.version === undefined && task.collectedSource === undefined
    && task.steps.every(step => step.attempted === false && step.answer === undefined && (step.receiptVerified === undefined || step.receiptVerified === false));
  const host = h("section", { class: "panel retained-editor", "aria-label": "Propose a text edit" });
  const draw = () => {
    if (!record.opened) {
      const start = h("button", { type: "button", class: "button" }, editPath(selected.file!.path) === null ? "Create corrected proposal" : "Propose an edit");
      start.addEventListener("click", () => { record.opened = true; draw(); (host.querySelector("input") as HTMLInputElement | null)?.focus(); });
      host.replaceChildren(start); return;
    }
    const task = record.task; const disabled = record.preparing || !!task;
    const title = h("input", { type: "text", value: record.draft.title, "aria-label": "Proposal title", maxlength: "256" }) as HTMLInputElement;
    const path = h("input", { type: "text", value: record.draft.path, "aria-label": "Target file path" }) as HTMLInputElement;
    const content = h("textarea", { rows: "12", "aria-label": "Edited text" }, record.draft.content) as HTMLTextAreaElement;
    for (const [name, field] of [["title", title], ["path", path], ["content", content]] as const) {
      if (disabled) field.disabled = true;
      // textarea.value normalizes CRLF/CR to LF. Read it only when the
      // person actually edits text, never as a side effect of title/path.
      field.addEventListener("input", () => { record.draft = { ...record.draft, [name]: field.value }; });
    }
    const message = h("p", { role: "status", "aria-live": "polite" }, task?.message || record.message);
    const controls = h("div", { class: "form-footer" });
    if (!task) {
      const prepare = h("button", { type: "submit", class: "primary" }, record.preparing ? "Preparing…" : "Prepare proposal") as HTMLButtonElement;
      prepare.disabled = record.preparing;
      controls.append(prepare);
    } else {
      controls.append(h("p", { class: "record-meta" }, `Published base: ${task.base}. Target: ${task.draft.path}. ${editFields(task.draft, task.base)["size"]} UTF-8 bytes.`));
      const label = task.state === "prepared" ? "Confirm new proposal" : task.state === "unknown" ? "Check original request" : "Continue checking progress";
      const go = h("button", { type: "button", class: "primary" }, task.busy ? "Waiting…" : label) as HTMLButtonElement;
      go.disabled = task.busy || ["recorded","refused","stopped"].includes(task.state);
      go.addEventListener("click", () => {
        if (record.task !== task || record.preparing || task.busy || !options.current()) return;
        void (async () => {
          const opts = { current: options.current, changed: draw };
          if (task.state === "unknown") await checkEditRequest(room, task, opts); else await continueEdit(room, task, opts);
          draw();
        })();
      });
      controls.append(go);
      if (canReturnToDraft(task)) {
        const cancel = h("button", { type: "button" }, "Back to edit");
        cancel.addEventListener("click", () => {
          if (!canReturnToDraft(task)) return;
          delete record.task;
          record.message = "Draft preserved. Prepare again to reread the source, authority and current published base, then confirm explicitly. Nothing was sent.";
          draw();
        });
        controls.append(cancel);
      }
      if (task.state === "recorded" && task.lane) {
        const link = h("a", { href: `#/change/${task.lane}`, class: "button" }, "Open new proposal"); link.addEventListener("click", () => options.recorded?.(task.lane!)); controls.append(link);
      }
      if (task.steps.length) controls.append(h("details", {}, h("summary", {}, "Inspect task results"), ...task.steps.map(step => h("p", {}, `${step.kind}: ${step.answer?.answer ?? (step.attempted ? "unknown" : "not sent")}${step.answer?.answer === "accepted" ? ` · recorded entry ${step.answer.receipt.fact.seq}` : ""}`))));
    }
    const form = h("form", {}, h("label", {}, "Proposal title", title), h("label", {}, "Target file path", path), h("label", {}, "Text", content),
      task?.state === "prepared" ? null : h("p", { class: "muted" }, "Current file comparison is unavailable. This writes the target on the named published base and may overwrite existing content. Changing the path leaves the old file; it is not a rename."), message, controls);
    form.addEventListener("submit", event => { event.preventDefault(); if (record.preparing || record.task) return; record.preparing = true; record.message = "Reading the original source, authority and published base…"; draw(); void (async () => {
      try { record.task = await prepareEdit(room, change, selected.id, record.draft, { current: options.current }); }
      catch (error) { record.message = error instanceof Error ? error.message : "Preparation failed. Nothing was sent."; }
      finally { record.preparing = false; draw(); }
    })(); });
    host.replaceChildren(h("h2", { class: "panel-head" }, editPath(selected.file!.path) === null ? "Create corrected proposal" : "Propose an edit"),
      h("p", { class: "muted" }, `Based on retained source version ${selected.id}, ${selected.file!.path}. This creates a new change; the source and its history remain unchanged.`), form,
      h("p", { class: "muted" }, "Drafts, original requests and answers are retained only while this Page stays loaded. Reloading or closing it loses this editor's recovery state. This task never publishes automatically."));
  };
  draw(); return host;
}
