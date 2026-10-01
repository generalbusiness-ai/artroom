/**
 * Secret scanning before anything is recorded (R-SEC-1 to R-SEC-4).
 *
 * Every string in an act's body is scanned with format detectors, and, unless
 * the field has a fixed validated format, with an entropy check on long
 * tokens. A finding names the field path and the detector, never the value
 * (R-SEC-3). Detection is incomplete (R-SEC-6).
 */

export interface SecretFinding {
  /** JSON path of the field, for example `body.text` or `body.because[1].url`. */
  readonly path: string;
  readonly detector: string;
}

interface Detector {
  readonly id: string;
  readonly re: RegExp;
}

/** Format detectors. Initial thresholds; the conformance corpus fixes them (R-SEC-1). */
export const DETECTORS: readonly Detector[] = [
  { id: "aws-access-key", re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/ },
  { id: "aws-secret-key", re: /aws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+]{40}/i },
  { id: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/ },
  { id: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: "slack-webhook", re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/ },
  {
    id: "cloudflare-token",
    re: /\b(?:CLOUDFLARE|CF)_?(?:API_?)?(?:TOKEN|KEY)["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{37,64}/i,
  },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "stripe-key", re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{20,}\b/ },
  { id: "private-key-block", re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  {
    id: "password-assignment",
    re: /\b(?:password|passwd|pwd|passphrase|secret_?key|api_?key|access_?token|auth_?token|client_?secret)["']?\s*[:=]\s*["']?[^\s"',;]{8,}/i,
  },
];

/** Long tokens: runs of base64, base64url or hex characters. */
const TOKEN = /[A-Za-z0-9+/=_-]{32,}/g;
/** Public identifiers that appear in text and are not secrets. */
const PUBLIC_ID = /^(?:key_[A-Za-z0-9_-]{43}|act_\d+_[0-9a-f]{8}|room_[0-9a-f]{32}|sha256:[0-9a-f]{64}|[0-9a-f]{40}|[0-9a-f]{64})$/;

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** True for a long token that looks random: mixed classes and more than 4.2 bits per character. */
export function highEntropy(token: string): boolean {
  if (token.length < 32 || PUBLIC_ID.test(token)) return false;
  // A path or URL piece is not a token.
  if (token.includes("/") && token.split("/").every((p) => p.length < 32)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((re) => re.test(token)).length;
  return classes >= 3 && entropy(token) > 4.2;
}

/** Scan one string. `fixed`: the field has a validated format, so only format detectors apply (R-SEC-4). */
export function scanString(value: string, path: string, fixed: boolean): SecretFinding | null {
  for (const d of DETECTORS) if (d.re.test(value)) return { path, detector: d.id };
  if (fixed) return null;
  for (const m of value.matchAll(TOKEN)) {
    const token = m[0].replace(/^[+/=_-]+|[+/=_-]+$/g, "");
    if (highEntropy(token)) return { path, detector: "high-entropy-string" };
  }
  return null;
}

/**
 * Scan every string in `value` (R-SEC-1). `fixedPaths` lists the paths whose
 * format was validated (R-SEC-4); `exempt` lists paths not scanned at all
 * (only a `join` act's `secret`).
 */
export function scanValue(
  value: unknown,
  root: string,
  fixedPaths: ReadonlySet<string> = new Set(),
  exempt: ReadonlySet<string> = new Set(),
): SecretFinding | null {
  const walk = (v: unknown, path: string): SecretFinding | null => {
    if (exempt.has(path)) return null;
    if (typeof v === "string") return scanString(v, path, fixedPaths.has(path));
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const f = walk(v[i], `${path}[${i}]`);
        if (f) return f;
      }
      return null;
    }
    if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        const f = walk(x, `${path}.${k}`);
        if (f) return f;
      }
    }
    return null;
  };
  return walk(value, root);
}
