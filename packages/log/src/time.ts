/**
 * The one checked time representation: RFC 3339 in UTC with `Z`, such as
 * `2026-10-01T12:00:00.000Z` (protocol section 2). Every timestamp that
 * bounds authority (an entry's `at`, an invitation's or delegation's
 * `expiresAt`, an onboarding grant's `notAfter`) and every other log time
 * is read through `parseTime`, so no invalid time can become NaN and slip
 * past a comparison.
 */

const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

/** Milliseconds since the epoch, or null when `text` is not a valid RFC 3339 UTC time. */
export function parseTime(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = RFC3339_UTC.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const ms = Number((m[7] ?? "0").padEnd(3, "0").slice(0, 3));
  const t = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const back = new Date(t);
  // Date.UTC rolls over (February 30 becomes March 2); a valid time reads back the same.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi || back.getUTCSeconds() !== s)
    return null;
  return t;
}

/** `parseTime` for a value already checked at the decoding boundary: throws instead of returning null. */
export function checkedTime(text: string, what: string): number {
  const t = parseTime(text);
  if (t === null) throw new RangeError(`${what} ${JSON.stringify(text)} is not an RFC 3339 UTC time`);
  return t;
}
