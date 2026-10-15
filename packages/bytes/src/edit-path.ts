import { utf8 } from "./canonical.ts";

/** The pinned change lane's maximum published edit path bytes. */
export const EDIT_PATH_BYTES = 1024;

/**
 * Existing published-tree edit grammar: relative, no empty/dot/.git
 * component or control character. Callers needing lossless Unicode also
 * check wellFormed; this move preserves the existing platform semantics.
 */
export function editPath(path: unknown): readonly string[] | null {
  if (typeof path !== "string" || path.length === 0 || utf8(path).length > EDIT_PATH_BYTES || /[\u0000-\u001f\u007f]/.test(path)) return null;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== ".." && segment.toLowerCase() !== ".git") ? segments : null;
}
