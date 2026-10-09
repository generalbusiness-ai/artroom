/** Ordinary invitation UI delegates enrollment to its existing custody owner; it never signs Join or keeps a second key. */
import { h } from "./view.ts";
export interface InvitationTaskState {
  invitation: string;
  status: string;
  phase: "idle" | "pending" | "unknown" | "accepted" | "refused";
  /** Exact accepted enrollment readback, never a parsed invitation alone. */
  roomLabel?: string;
  readback?: "verified" | "unavailable";
  canSelect?: boolean;
  canCheck?: boolean;
  /** Existing loaded-Page enrollment custody has no reload-safe exact envelope unless its owner supplies it. */
  reloadRecovery?: boolean;
}
export interface InvitationTaskOptions {
  state(): InvitationTaskState;
  /** The existing enrollment owner privately generates/retains the device key and exact request before send. */
  join(invitation: string): Promise<void>;
  draft(invitation: string): void;
  check?(): Promise<void>;
  select?(): Promise<void>;
  changed?(): void;
}
export function invitationTask(options: InvitationTaskOptions): HTMLElement {
  const host = h("section", { class: "panel", "aria-label": "Join a room" });
  let active = false;
  const draw = () => {
    const state = options.state();
    const invitation = h("textarea", { name: "invitation", rows: "3", autocomplete: "off", spellcheck: "false", "aria-label": "Invitation link", placeholder: "Paste the invitation from a room admin" }, state.invitation) as HTMLTextAreaElement;
    invitation.disabled = active || state.phase === "pending" || state.phase === "unknown" || state.phase === "accepted";
    invitation.addEventListener("input", () => options.draft(invitation.value));
    const send = h("button", { type: "submit", class: "primary" }, active || state.phase === "pending" ? "Joining…" : "Join room") as HTMLButtonElement;
    send.disabled = active || ["pending", "unknown", "accepted"].includes(state.phase);
    const controls = h("div", { class: "form-footer" }, send);
    if (state.phase === "unknown" && state.canCheck && options.check) {
      const check = h("button", { type: "button" }, "Check original request") as HTMLButtonElement; check.disabled = active;
      check.addEventListener("click", () => { void run(options.check!); }); controls.append(check);
    }
    if (state.phase === "accepted" && state.canSelect && options.select) {
      const select = h("button", { type: "button", class: "primary" }, "Use joined room") as HTMLButtonElement; select.disabled = active;
      select.addEventListener("click", () => { void run(options.select!); }); controls.append(select);
    }
    const form = h("form", {}, h("label", {}, "Invitation link", invitation), controls);
    form.addEventListener("submit", event => { event.preventDefault(); if (active || ["pending","unknown","accepted"].includes(options.state().phase)) return; options.draft(invitation.value); void run(() => options.join(invitation.value)); });
    const answer = state.phase === "accepted" ? state.readback === "verified" ? `Enrollment recorded${state.roomLabel ? ` in ${state.roomLabel}` : ""}. Room access verified; application readiness is checked separately.` : "Enrollment recorded; room readback is unavailable. The original accepted result is retained." : state.status;
    host.replaceChildren(h("h1", {}, "Join a room"), h("p", { class: "muted" }, "An admin's invitation enrolls this browser with its own private device key. You do not need another person's key or a config file."), form, ...state.reloadRecovery ? [] : [h("p", { class: "muted" }, "This enrollment recovery is retained only while the Page remains loaded. If a Join outcome is unknown, do not reload or send a replacement; exact reload recovery is not available yet.")], h("p", { role: "status", "aria-live": "polite" }, answer), h("p", { class: "muted" }, "A room without the Pages definitions and reviewed rules needs an authorized admin to prepare it. Joining does not install or activate an application."));
  };
  const run = async (action: () => Promise<void>) => { if (active) return; active = true; draw(); try { await action(); } finally { active = false; draw(); options.changed?.(); } };
  draw(); return host;
}
