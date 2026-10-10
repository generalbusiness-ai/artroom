/** One native Signed summary's passive records. Raw Authorization stays in this closure only. */
import type { SignedReadCheck, SignedReadObserver } from "../src/signed-reads.ts";
import type { SessionOwner } from "./session-settings.ts";
interface Capture { owner: SessionOwner; name: string; reader: string; records: SignedReadCheck[]; complete: boolean; released: boolean }
let current: Capture | null = null;
let installed: { owner: SessionOwner; name: string } | null = null;
export function installSignedDiagnostic(owner: SessionOwner, name: string): () => void {
  owner.active();
  if (installed) throw new Error("A Signed diagnostic wiring is already owned.");
  const token = { owner, name }; installed = token;
  return () => { if (installed === token) installed = null; };
}
export function signedDiagnosticFor(name: string | undefined): SignedReadObserver | undefined {
  const token = installed;
  if (!token || token.name !== name || !token.owner.isCurrent()) return undefined;
  return (reader, check) => { if (installed === token) recordSignedCheck(name, reader, check); };
}
export function captureSignedSummary(owner: SessionOwner, name: string, reader: string) {
  owner.active();
  if (!installed || installed.owner !== owner || installed.name !== name) throw new Error("The Signed summary diagnostic does not own its native wiring.");
  if (current) throw new Error("A Signed summary diagnostic is already owned.");
  const capture: Capture = { owner, name, reader, records: [], complete: true, released: false };
  current = capture;
  return {
    close() { capture.reader = ""; capture.released = true; if (current === capture) current = null; },
    report() { return { complete: capture.complete, released: capture.released, ownerCurrent: owner.isCurrent(), records: capture.records.map(record => ({ ...record })) }; },
  };
}
/** Correlation only. The observer must never disclose reader, name or an arbitrary error. */
export function recordSignedCheck(name: string | undefined, reader: string, check: Readonly<SignedReadCheck>): void {
  const capture = current;
  if (!capture || !installed || installed.owner !== capture.owner || installed.name !== capture.name || name !== capture.name || reader !== capture.reader) return;
  try {
    if (!capture.owner.isCurrent() || capture.records.length >= 32) { capture.complete = false; return; }
    capture.records.push({ phase: check.phase, stage: check.stage,
      ...(check.clockValuesValid === undefined ? {} : { clockValuesValid: check.clockValuesValid }),
      ...(check.readingBeforePrevious === undefined ? {} : { readingBeforePrevious: check.readingBeforePrevious }),
      ...(check.readingAtOrPastEnd === undefined ? {} : { readingAtOrPastEnd: check.readingAtOrPastEnd }),
      ...(check.remainingExceedsWindow === undefined ? {} : { remainingExceedsWindow: check.remainingExceedsWindow }),
    });
  } catch { capture.complete = false; }
}
