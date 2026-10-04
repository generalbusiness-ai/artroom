/** Secret scanning (R-SEC-1 to R-SEC-4). */
import { describe, expect, it } from "vitest";
import { highEntropy, scanString, scanValue } from "../../src/secrets.ts";
import { digestJson, newKeyPair } from "../../src/crypto.ts";

/**
 * Detector samples. Each is assembled at runtime from parts, so the source
 * holds no secret-shaped literal (repository push protection scans it).
 */
const join = (...parts: string[]) => parts.join("");
const fill = (n: number, alphabet = "a1B2c3D4e5") => Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join("");
const awsKey = join("AK", "IA", "IOSFODNN7", "EXAMPLE");

const positives: [string, string][] = [
  ["aws-access-key", awsKey],
  ["aws-secret-key", join("aws_secret", "_access_key = ", fill(40))],
  ["github-token", join("gh", "p_", fill(36))],
  ["github-token", join("github", "_pat_", fill(40))],
  ["slack-token", join("xo", "xb-", "123456789012-", fill(12))],
  ["slack-webhook", join("https://hooks.", "slack.com/services/", fill(9), "/", fill(9), "/", fill(24))],
  ["cloudflare-token", join("CLOUDFLARE_API", "_TOKEN=", fill(40))],
  ["google-api-key", join("AI", "za", "Sy", fill(33))],
  ["stripe-key", join("sk", "_live_", fill(24))],
  ["private-key-block", join("-----BEGIN OPENSSH ", "PRIVATE KEY-----")],
  ["private-key-block", join("-----BEGIN ", "PRIVATE KEY-----")],
  ["jwt", join("ey", "J", fill(12), ".", "ey", "J", fill(12), ".", fill(20))],
  ["password-assignment", join("pass", "word=", "hunter2hunter2")],
  ["high-entropy-string", join("token ", "Zx9Qw3Er7Ty1Ui5Op2", "As8Df4Gh6Jk0LmNbVcXz", " here")],
];

describe("R-SEC-1 detectors", () => {
  it("each detector finds its sample, and names itself and the field", () => {
    for (const [detector, text] of positives) expect(scanString(text, "body.text", false), detector).toEqual({ path: "body.text", detector });
  });

  it("does not flag commit SHAs, digests, key IDs, entry IDs, paths or prose", () => {
    for (const ok of [
      "fixed in 3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
      digestJson({ any: "thing" }),
      `granted to ${newKeyPair().key}`,
      "see act_42_9f3a01bc",
      "packages/room/src/admission/very/long/path/name/that/is/long.ts",
      "The password policy requires twelve characters.",
    ])
      expect(scanString(ok, "body.text", false)).toBeNull();
    expect(highEntropy("a".repeat(40))).toBe(false);
  });
});

describe("R-SEC-3, R-SEC-4 paths and exemptions", () => {
  it("names the field path; fixed-format fields skip only the entropy check", () => {
    const body = { text: "fine", because: [{ url: "https://x.example/" }, { url: "https://x.example/?k=Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXz" }] };
    expect(scanValue(body, "body")).toEqual({ path: "body.because[1].url", detector: "high-entropy-string" });
    const fixed = new Set(["body.head"]);
    expect(scanValue({ head: "Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXz" }, "body", fixed)).toBeNull();
    expect(scanValue({ head: awsKey }, "body", fixed)).toEqual({ path: "body.head", detector: "aws-access-key" });
  });

  it("a join's secret is exempt", () => {
    const secret = "Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXzAbCdEf";
    expect(scanValue({ op: "join", secret }, "body")).not.toBeNull();
    expect(scanValue({ op: "join", secret }, "body", new Set(), new Set(["body.secret"]))).toBeNull();
  });
});
