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
    ["a password: value pair", 'password: "hunter22"', "hunter22", "password: <redacted>"],
    ["a GitHub token by the secret scan's detector", `using ${join("gh", "p_", fill(36))}`, join("gh", "p_"), "using <secret>"],
    ["a long random token", `id ${fill(48, RANDOM)} rejected`, fill(48, RANDOM), "id <secret> rejected"],
  ];
  it("removes each kind of credential, and leaves the rest of the message", () => {
    for (const [what, input, secret, out] of cases) {
      const r = redact(input);
      expect(r, what).not.toContain(secret);
      expect(r, what).toBe(out);
    }
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

describe("redact: credentials known by their syntax, whatever their length or entropy (checker, review of 0e058f13)", () => {
  // [what, input, the parts that must go, the exact result]
  const cases: [string, string, string[], string][] = [
    ["a double-quoted password with spaces", 'login password="hunter two three" then failed', ["hunter", "two", "three"], "login password=<redacted> then failed"],
    ["a single-quoted password with spaces", "login password='hunter two' then failed", ["hunter", "two"], "login password=<redacted> then failed"],
    ["a double-quoted password with an escaped quote", String.raw`password="ab\"cd ef" then`, ["ab", "cd", "ef"], "password=<redacted> then"],
    ["a single-quoted password with an escaped quote", String.raw`password='it\'s mine' then`, ["it", "mine"], "password=<redacted> then"],
    ["a JSON password with spaces", '{"password": "x y z", "user": "u"}', ["x y", "z\""], '{"password": <redacted>, "user": "u"}'],
    ["a JSON client secret with an escaped quote", String.raw`{"client_secret":"s\"t u","n":1}`, ["s\\", "t u"], '{"client_secret":<redacted>,"n":1}'],
    ["a password: bare value", "password: hunter2 rejected", ["hunter2"], "password: <redacted> rejected"],
    ["a password= bare value", "password=hunter2 rejected", ["hunter2"], "password=<redacted> rejected"],
    ["a one-character value", "token=x ok", ["=x"], "token=<redacted> ok"],
    ["a bare value holding separators, to the next space", "password=p&ss;w,rd x", ["p&ss", "w,rd"], "password=<redacted> x"],
    ["an auth pair", "x-auth: q1 sent", ["q1"], "x-auth: <redacted> sent"],
    ["a passphrase pair", "passphrase=q1 sent", ["q1"], "passphrase=<redacted> sent"],
    ["spaces around the separator", 'PASSWORD = "x y"', ["x y"], "PASSWORD = <redacted>"],
    ["an unclosed quote, to the end", 'password="abc def', ["abc", "def"], "password=<redacted>"],
    ["an unclosed quote ending in a backslash, to the end", 'password="abc def\\', ["abc", "def"], "password=<redacted>"],
    ["an unclosed quote across lines, to the end", 'password="abc\ndef ghi', ["abc", "def", "ghi"], "password=<redacted>"],
    ["JSON inside a string, to the end of the line", String.raw`body {\"password\":\"a b\",\"user\":\"u\"}` + "\nnext", ["a b", "user"], String.raw`body {\"password\":<redacted>` + "\nnext"],
    ["a short Bearer credential", "sent Bearer x, rejected", ["x,"], "sent Bearer <redacted>, rejected"],
    ["a two-character bearer credential", "bearer ab", ["ab"], "bearer <redacted>"],
    ["a Basic credential with padding", "Basic YQ== failed", ["YQ=="], "Basic <redacted> failed"],
    ["a Digest parameter list, to the end of the line", 'Digest username="u", response="r"\nthen', ['"u"', '"r"'], "Digest <redacted>\nthen"],
    ["a short DPoP credential", "DPoP abc", ["abc"], "DPoP <redacted>"],
    ["a short Authorization header", "Authorization: Bearer x\nthen", ["Bearer x"], "Authorization: <redacted>\nthen"],
    ["a JSON authorization header", '{"authorization": "Basic a"}', ["Basic a"], '{"authorization": <redacted>'],
    ["a Proxy-Authorization header", "Proxy-Authorization: Negotiate y", ["Negotiate y"], "Proxy-Authorization: <redacted>"],
    ["a short GitHub token", `cut ${join("gh", "p_", "ab")} here`, [join("gh", "p_")], "cut <secret> here"],
    ["a short fine-grained GitHub token", `cut ${join("github", "_pat_", "ab")} here`, ["_pat_"], "cut <secret> here"],
    ["a short Slack token", `cut ${join("xo", "xb-", "1")} here`, [join("xo", "xb-")], "cut <secret> here"],
    ["a short Stripe key", `cut ${join("sk", "_live_", "x")} here`, ["_live_"], "cut <secret> here"],
    ["a short AWS access key ID", `cut ${join("AK", "IA", "Q1")} here`, [join("AK", "IA")], "cut <secret> here"],
    ["a short Google API key", `cut ${join("AI", "za", "q")} here`, [join("AI", "za")], "cut <secret> here"],
    ["a short JSON Web Token", `cut ${join("ey", "Ja.", "ey", "Jb.c")} here`, [join("ey", "Ja")], "cut <secret> here"],
    ["a Slack webhook's path", `post ${join("https://hooks.", "slack.com/services/", "T0/B0/x")} failed`, ["T0/B0"], "post <secret> failed"],
    ["a private key block's body", join("-----BEGIN ", "PRIVATE KEY-----\nq1w2\ne3r4\n-----END ", "PRIVATE KEY-----\nnext"), ["q1w2", "e3r4"], "<secret>\nnext"],
    ["a private key block cut before its END line, to the end", join("key -----BEGIN ", "RSA PRIVATE KEY-----\nq1w2 e3r4"), ["q1w2", "e3r4"], "key <secret>"],
  ];
  it("removes each of them, short or quoted, and leaves the rest of the message", () => {
    for (const [what, input, gone, out] of cases) {
      const r = redact(input);
      for (const g of gone) expect(r, what).not.toContain(g);
      expect(r, what).toBe(out);
    }
  });
});

describe("redact: the checker's controls (report e6a9016b)", () => {
  // The checker's three cases, verbatim, through `diagnosis` as the Room calls it.
  it("quoted spaces, a quoted escaped quote and a short bearer are redacted", () => {
    for (const [what, text, fragments] of [
      ["quoted spaces", 'password: "horse battery staple"', ["horse", "battery", "staple"]],
      ["quoted escaped quote", JSON.stringify({ password: 'horse"battery' }), ["horse", "battery"]],
      ["short bearer", "request with Bearer abcd failed", ["abcd"]],
    ] as const) {
      const d = diagnosis("pre-admission-failed", "propose.pinObjects", new Error(text));
      for (const f of fragments) expect(d.message, what).not.toContain(f);
      expect(d.message, what).toContain("<redacted>");
    }
  });

  it("the error's name is redacted too", () => {
    const e = Object.assign(new Error("x"), { name: 'ArtifactsError password="horse battery" Bearer abcd' });
    const d = diagnosis("e", "s", e);
    for (const f of ["horse", "battery", "abcd"]) expect(d.name).not.toContain(f);
  });

  it("fails closed when the input bound cuts a quoted value: the rest is not published", () => {
    // Twenty long tokens shrink to 160 characters, so what stood at the 4,096-character cut comes into view.
    const long = join("art_", "v1_", fill(193));
    const prefix = `${Array.from({ length: 20 }, () => long).join(" ")} ${"y ".repeat(27)}`;
    const text = `${prefix}password: "horse battery staple correct" end`;
    // The cut falls inside the quoted value, after its first word.
    expect(text.indexOf("battery")).toBeLessThan(4096);
    expect(text.indexOf("battery") + "battery".length).toBeGreaterThan(4096);
    expect(text.indexOf("correct")).toBeGreaterThan(4096);
    const r = redact(text);
    expect(r).toContain("password: <redacted>");
    for (const f of ["horse", "battery", "staple", "correct", "end"]) expect(r).not.toContain(f);
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
