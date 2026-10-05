/**
 * Text encodings of bytes: hex, base64url and base32. Each decoder returns
 * null for text that its encoder would not have written, so one byte string
 * has exactly one text form.
 */

const HEX = "0123456789abcdef";

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

/** Most-significant bit first, `width` bits to a character, no padding. */
function encodeBits(bytes: Uint8Array, alphabet: string, width: number): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= width) {
      bits -= width;
      out += alphabet[(acc >> bits) & ((1 << width) - 1)]!;
    }
  }
  if (bits > 0) out += alphabet[(acc << (width - bits)) & ((1 << width) - 1)]!;
  return out;
}

/** The inverse. Null for a character outside the alphabet, an impossible length, or non-zero trailing bits. */
function decodeBits(s: string, index: ReadonlyMap<string, number>, width: number): Uint8Array | null {
  const out = new Uint8Array(Math.floor((s.length * width) / 8));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const c of s) {
    const v = index.get(c);
    if (v === undefined) return null;
    acc = ((acc << width) | v) & 0xffff;
    bits += width;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  // A whole unused character, or set bits past the last byte, is not what the encoder writes.
  if (bits >= width || (acc & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

/** Unpadded base64url (RFC 4648 section 5). */
export function b64url(bytes: Uint8Array): string {
  return encodeBits(bytes, B64, 6);
}

export function unb64url(s: string): Uint8Array | null {
  return decodeBits(s, B64_INDEX, 6);
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const B32_INDEX = new Map([...B32].map((c, i) => [c, i]));

/** Unpadded base32 in the RFC 4648 section 6 alphabet, lowercase. */
export function base32(bytes: Uint8Array): string {
  return encodeBits(bytes, B32, 5);
}

export function unbase32(s: string): Uint8Array | null {
  return decodeBits(s, B32_INDEX, 5);
}
