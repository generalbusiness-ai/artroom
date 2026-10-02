/**
 * Diagnoses (request d268d249): the redaction and the bound. Samples are
 * assembled at runtime, so the source holds no credential-shaped literal
 * (push protection scans it).
 */
import { describe, expect, it } from "vitest";
import { diagnosis, MAX_MESSAGE, redact, report } from "../../src/diag.ts";

const join = (...parts: string[]) => parts.join("");
const fill = (n: number, alphabet = "a1B2c3D4e5") => Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join("");
const RANDOM = "Zq8xV2mK9pL4rT7wYb3nC6hJ5gF1dS0aEuIoP";
const artifactsToken = join("art_", "v1_", fill(40));

describe("redact", () => {
  const cases: [string, string, string, string][] = [
    // [what, input, the secret that must go, what stays]
    ["an Artifacts token", `push failed: ${artifactsToken}`, artifactsToken, "push failed: <token>"],
    ["an Artifacts token with its expiry", `read ${artifactsToken}?expires=1790000000 refused`, "1790000000", "read <token> refused"],
    ["URL userinfo", "https://x:pa55word@artifacts.example/ns/r.git: 403", "pa55word", "https://<credentials>@artifacts.example/ns/r.git: 403"],
    ["a URL query", "GET https://api.example/v4/repos?token=abcdef&x=1 failed", "abcdef", "GET https://api.example/v4/repos?<query> failed"],
    ["a query without a scheme", "fetch /v4/repos?sig=abcdef failed", "abcdef", "fetch /v4/repos?<query> failed"],
    ["an Authorization header", "sent Authorization: Bearer abc.def.ghi\nthen failed", "abc.def.ghi", "sent Authorization: <redacted>\nthen failed"],
    ["a cookie", "cookie=session=abc123xyz; path=/", "abc123xyz", "cookie=<redacted>"],
    ["a bearer credential", "with bearer zzzzzzzzzzzz", "zzzzzzzzzzzz", "with bearer <redacted>"],
    ["a basic credential", "Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA==", "Basic <redacted>"],
    ["a token=value pair", "api_token=qwertyuiop failed", "qwertyuiop", "api_token=<redacted> failed"],
    ["a password: value pair, by the secret scan's detector", 'password: "hunter22"', "hunter22", '<secret>"'],
    ["a GitHub token by the secret scan's detector", `using ${join("gh", "p_", fill(36))}`, join("gh", "p_"), "using <secret>"],
    ["a long random token", `id ${fill(48, RANDOM)} rejected`, fill(48, RANDOM), "id <secret> rejected"],
  ];
  for (const [what, input, secret, out] of cases)
    it(`removes ${what}`, () => {
      const r = redact(input);
      expect(r).not.toContain(secret);
      expect(r).toBe(out);
    });

  it("keeps what diagnoses need: commit IDs, key IDs, room IDs and plain words", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const text = `head ${sha} is not in the fork of room_${"a".repeat(32)}; is main readable?`;
    expect(redact(text)).toBe(text);
  });

  it("bounds the result to 300 characters", () => {
    expect(MAX_MESSAGE).toBe(300);
    const r = redact("x ".repeat(1000));
    expect(r).toHaveLength(300);
    expect(r.endsWith("…")).toBe(true);
    expect(redact("short")).toBe("short");
  });

  it("cuts a very long message at a space before redacting, so no part of a token is left at the cut", () => {
    // Twenty long tokens shrink to 160 characters, so what stood at the 4,096-character cut comes into view. A random
    // token straddles the cut: its first 20 characters alone are too short to look random, and must not be shown.
    const long = join("art_", "v1_", fill(193));
    const random = fill(100, RANDOM);
    const text = `${Array.from({ length: 20 }, () => long).join(" ")} ${"y ".repeat(27)}y ${random}`;
    expect(text.indexOf(random)).toBe(4076);
    const r = redact(text);
    expect(r.length).toBeLessThan(300);
    expect(r).not.toContain(random.slice(0, 8));
    expect(r).not.toMatch(/art_v1/);
  });
});

describe("diagnosis and report", () => {
  it("names the step and the error's name, with the message redacted", () => {
    const e = Object.assign(new Error(`failed: ${artifactsToken}`), { name: "ArtifactsError" });
    expect(diagnosis("pre-admission-failed", "propose.pinObjects", e)).toEqual({ event: "pre-admission-failed", step: "propose.pinObjects", name: "ArtifactsError", message: "failed: <token>" });
  });

  it("a thrown value that is not an error is named by its type", () => {
    expect(diagnosis("e", "s", `x ${artifactsToken}`)).toEqual({ event: "e", step: "s", name: "string", message: "x <token>" });
    expect(diagnosis("e", "s", null)).toEqual({ event: "e", step: "s", name: "null", message: "null" });
    expect(diagnosis("e", "s", { code: "X" })).toMatchObject({ name: "object", message: "[object Object]" });
  });

  it("a sink that throws never reaches the caller", () => {
    expect(() =>
      report(
        () => {
          throw new Error("log down");
        },
        "e",
        "s",
        new Error("x"),
      ),
    ).not.toThrow();
  });
});
