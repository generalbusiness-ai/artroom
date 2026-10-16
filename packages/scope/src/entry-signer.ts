/** Pure shared signed-entry classification; no authority check or history scan. */
import type { Entry, KeyId } from "@generalbusiness/dap-contract";

export function signerOf(entry: Entry): KeyId | null {
  const input = entry.input;
  if (input.type === "act" || input.type === "preparation") return input.signed.intent.actor;
  return input.type === "genesis" && input.decision === "applied" && input.founding ? input.founding.intent.actor : null;
}
