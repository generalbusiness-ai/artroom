/** Focus belongs to an exact room/control, never to a newly selected subject. */
export interface KeptFocus {
  key: string;
  value?: string;
  start?: number | null;
  end?: number | null;
  direction?: "forward" | "backward" | "none" | null;
}

export function keepFocus(container: HTMLElement): KeptFocus | null {
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!active || !container.contains(active)) return null;
  const key = active.getAttribute("data-focus-key");
  if (!key) return null;
  const kept: KeptFocus = { key };
  if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT") {
    kept.value = active.value;
    try { kept.start = active.selectionStart; kept.end = active.selectionEnd; kept.direction = active.selectionDirection; }
    catch { /* A select or non-text input has no text selection. */ }
  }
  return kept;
}

export function restoreFocus(container: HTMLElement, kept: KeptFocus | null): boolean {
  if (!kept) return false;
  // Keys are compared as text; scope IDs and custom field names never enter a selector.
  const control = [...container.querySelectorAll<HTMLElement>("[data-focus-key]")].find(node => node.getAttribute("data-focus-key") === kept.key && (typeof node.getClientRects !== "function" || node.getClientRects().length > 0));
  if (!control || control.hasAttribute("disabled")) return false;
  if (kept.value !== undefined && (control.tagName === "INPUT" || control.tagName === "TEXTAREA" || control.tagName === "SELECT")) {
    const input = control as HTMLInputElement | HTMLTextAreaElement;
    // The freshly rendered draft and eligible options are authoritative.
    // Focus must never repaint retired text or restore a removed select choice.
    if (input.value === kept.value && kept.start !== undefined && kept.start !== null && kept.end !== undefined && kept.end !== null) {
      try { input.setSelectionRange(kept.start, kept.end, kept.direction ?? undefined); }
      catch { /* A non-text control retains its value, without a text selection. */ }
    }
  }
  control.focus({ preventScroll: true });
  return true;
}

export const controlKey = (context: string, control: string): string => JSON.stringify([context, control]);
