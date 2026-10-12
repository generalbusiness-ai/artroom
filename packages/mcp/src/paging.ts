/** Pages by bytes, and the cursors that continue them. A cursor is opaque to a caller and holds no secret. */

import { b64url, unb64url, utf8 } from "@generalbusiness/artroom-bytes";

export const KIB = 1024;

export const bytesOf = (value: unknown): number => utf8(JSON.stringify(value)).length;

/**
 * The items from `offset` that fit in `limit` bytes, at least one: an item
 * larger than a page is served alone on its own page, whole. `next`: the
 * offset to continue from, when items remain.
 */
export function pageBy<T>(items: readonly T[], offset: number, limit: number): { page: T[]; next: number | null } {
  const page: T[] = [];
  let used = 2;
  for (let i = offset; i < items.length; i++) {
    const size = bytesOf(items[i]) + 1;
    if (page.length > 0 && used + size > limit) return { page, next: i };
    page.push(items[i]!);
    used += size;
    if (used > limit) return { page, next: i + 1 < items.length ? i + 1 : null };
  }
  return { page, next: null };
}

/**
 * A slice of a text by UTF-8 bytes, from `offset`, never splitting a character, whose JSON string as sent is at most `limit`
 * bytes: escaping can make the sent form longer than the text, so the slice is measured as it is sent.
 */
export function sliceText(text: string, offset: number, limit: number): { text: string; next: number | null; total: number } {
  const bytes = utf8(text);
  let start = Math.max(0, Math.min(offset, bytes.length));
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  const cut = (n: number) => { let end = Math.min(bytes.length, start + n); while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--; return end; };
  let take = limit;
  let end = cut(take);
  let part = new TextDecoder().decode(bytes.subarray(start, end));
  for (let sent = bytesOf(part); sent > limit && end > start; sent = bytesOf(part)) {
    take = Math.max(1, Math.floor(take * limit / sent) - 8);
    end = cut(take);
    if (end <= start) end = cut(take + 4);
    part = new TextDecoder().decode(bytes.subarray(start, end));
  }
  return { text: part, next: end < bytes.length ? end : null, total: bytes.length };
}

export const cursorOf = (value: unknown): string => b64url(utf8(JSON.stringify(value)));
export function fromCursor<T>(cursor: unknown): T | null {
  if (typeof cursor !== "string") return null;
  const bytes = unb64url(cursor);
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; } catch { return null; }
}
