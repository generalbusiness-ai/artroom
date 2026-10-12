/** One room popup at a time. Closing a popup does not retire its owner's request. */
let modal: { dialog: HTMLDialogElement; close(restore: boolean): void } | null = null;
let disclosures: HTMLElement[] = [];
export function releaseDialog(dialog: HTMLDialogElement): void {
  if (modal?.dialog === dialog) modal = null;
}
export function openDialog(dialog: HTMLDialogElement, close: (restore: boolean) => void): void {
  const previous = modal;
  modal = null;
  previous?.close(false);
  for (const shown of disclosures) shown.removeAttribute("open");
  modal = { dialog, close };
  dialog.addEventListener("click", event => {
    if (event.target !== dialog || modal?.dialog !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(true);
  });
  dialog.showModal();
}
/** The shell supplies its actual desktop/mobile details and outside click surfaces. */
export function bindDisclosures(nodes: HTMLElement[], surfaces: HTMLElement[]): void {
  disclosures = nodes;
  for (const node of nodes) node.querySelector("summary")?.addEventListener("click", () => {
    const previous = modal; modal = null; previous?.close(false);
    for (const other of nodes) if (other !== node) other.removeAttribute("open");
  });
  for (const surface of surfaces) surface.addEventListener("click", event => {
    for (const node of nodes) if (!node.contains(event.target as Node)) node.removeAttribute("open");
  });
}
