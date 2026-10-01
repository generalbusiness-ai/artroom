/** Secret scanning (R-SEC-1 to R-SEC-4). */
import { describe, expect, it } from "vitest";
import { highEntropy, scanString, scanValue } from "../../src/secrets.ts";
import { digestJson, newKeyPair } from "../../src/crypto.ts";

const positives: [string, string][] = [
  ["aws-access-key", "AKIAIOSFODNN7EXAMPLE"],
  ["aws-secret-key", "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"],
  ["github-token", "ghp_" + "a1b2c3d4e5f6g7h8i9j0a1b2c3d4e5f6g7h8"],
  ["github-token", "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz"],
  ["slack-token", "xoxb-123456789012-abcdefghijkl"],
  ["slack-webhook", "https://hooks.slack" + ".com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"],
  ["cloudflare-token", "CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz0123456789ABCD"],
  ["google-api-key", "AIzaSyA-1234567890abcdefghijklmnopqrstu"],
  ["stripe-key", "sk_live_" + "4eC39HqLyjWDarjtT1zdp7dc"],
  ["private-key-block", "-----BEGIN OPENSSH PRIVATE KEY-----"],
  ["private-key-block", "-----BEGIN PRIVATE KEY-----"],
  ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
  ["password-assignment", "password=hunter2hunter2"],
  ["high-entropy-string", "token Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXz here"],
];

describe("R-SEC-1 detectors", () => {
  for (const [detector, text] of positives)
    it(`detects ${detector}`, () => expect(scanString(text, "body.text", false)).toEqual({ path: "body.text", detector }));

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
    expect(scanValue({ head: "AKIAIOSFODNN7EXAMPLE" }, "body", fixed)).toEqual({ path: "body.head", detector: "aws-access-key" });
  });

  it("a join's secret is exempt", () => {
    const secret = "Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXzAbCdEf";
    expect(scanValue({ op: "join", secret }, "body")).not.toBeNull();
    expect(scanValue({ op: "join", secret }, "body", new Set(), new Set(["body.secret"]))).toBeNull();
  });
});
