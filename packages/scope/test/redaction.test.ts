import { describe, expect, test, vi } from "vitest";
import { MAX_FIELD, MAX_TEXT, diagnosis, redact, report, toConsole } from "../src/index.ts";
// I3 merge: from the git package's `./testing` export, as in `hosted.ts`.
import { secret } from "../../git/test/support/tokens.ts";
import { hosted } from "./hosted.ts";
import { reader } from "./support.ts";

// Samples are put together at run time, so this file holds no text with the form of a credential.
const join = (...parts: string[]) => parts.join("");
const fill = (n: number, alphabet = "a1B2c3D4e5") => Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join("");
const RANDOM = "Zq8xV2mK9pL4rT7wYb3nC6hJ5gF1dS0aEuIoP";

describe("safe sinks (authority note, section 5.3; proof plan, key O3)", () => {
  test("the redactor, as a table: each syntax of a credential is replaced whatever its length, public identifiers stay, the result is at most its stated length in UTF-16 code units, and a diagnosis reads nothing of a thrown value but a name of the fixed list", () => {
    // [what, the text, the parts that must be gone, the exact result]
    const cases: [string, string, string[], string][] = [
      ["URL userinfo", "https://x:pa55word@git.example/ns/r.git: 403", ["pa55word"], "https://<credentials>@git.example/ns/r.git: 403"],
      ["userinfo whose password holds an @", "fetch https://user:p@ss-w0rd@git.example/r.git failed", ["p@ss", "ss-w0rd"], "fetch https://<credentials>@git.example/r.git failed"],
      ["a URL query", "GET https://api.example/v4/repos?token=abcdef&x=1 failed", ["abcdef"], "GET https://api.example/v4/repos?<query> failed"],
      ["an Authorization header", "sent Authorization: Bearer abc.def.ghi\nthen failed", ["abc.def.ghi"], "sent Authorization: <redacted>\nthen failed"],
      ["a cookie", "cookie=session=abc123xyz; path=/", ["abc123xyz"], "cookie=<redacted>"],
      ["a short bearer credential", "sent Bearer x, rejected", ["x,"], "sent Bearer <redacted>, rejected"],
      ["a Basic credential with padding", "Basic YQ== failed", ["YQ=="], "Basic <redacted> failed"],
      ["a pair whose name says token", "api_token=qwertyuiop failed", ["qwertyuiop"], "api_token=<redacted> failed"],
      ["a name that goes on after the word", "token2=hunter2zz failed", ["hunter2zz"], "token2=<redacted> failed"],
      ["a numbered key", "api_key_1: qwertyuiop", ["qwertyuiop"], "api_key_1: <redacted>"],
      ["a signature header with a suffix", "X-Hub-Signature-256: sha256=abcdef0123 bad", ["abcdef0123"], "X-Hub-Signature-256: <redacted> bad"],
      ["a quoted password with spaces", 'login password="hunter two three" then failed', ["hunter", "two", "three"], "login password=<redacted> then failed"],
      ["a JSON secret with an escaped quote", String.raw`{"client_secret":"s\"t u","n":1}`, ["s\\", "t u"], '{"client_secret":<redacted>,"n":1}'],
      ["an unclosed quote, to the end", 'password="abc def', ["abc", "def"], "password=<redacted>"],
      ["a short token known by its prefix", `cut ${join("gh", "p_", "ab")} here`, [join("gh", "p_")], "cut <secret> here"],
      ["a short JSON Web Token", `cut ${join("ey", "Ja.", "ey", "Jb.c")} here`, [join("ey", "Ja")], "cut <secret> here"],
      ["a private key block cut before its END line", join("key -----BEGIN ", "RSA PRIVATE KEY-----\nq1w2 e3r4"), ["q1w2", "e3r4"], "key <secret>"],
      ["a long random run", `id ${fill(48, RANDOM)} rejected`, [fill(48, RANDOM)], "id <secret> rejected"],
    ];
    for (const [what, text, gone, out] of cases) {
      const r = redact(text);
      for (const part of gone) expect(r, what).not.toContain(part);
      expect(r, what).toBe(out);
    }
    // What a diagnosis may name is kept: an object ID, a digest, a key ID, a scope ID and plain words.
    const kept = `commit ${"0123456789abcdef".repeat(2)}01234567 under sha256:${"ab".repeat(32)} by key_${fill(43)} at sc_${"a".repeat(52)}; is the branch readable?`;
    expect(redact(kept)).toBe(kept);

    // The bound, in UTF-16 code units. A cut never leaves half of a surrogate pair.
    const cut = redact(`${"x".repeat(MAX_TEXT - 2)}\u{1F600}tail`);
    expect([MAX_TEXT, redact("x ".repeat(1000)).length, redact("short"), cut.length, cut.endsWith("x…")]).toEqual([300, 300, "short", MAX_TEXT - 1, true]);
    // A text longer than the input bound is cut at a space before it is redacted, so no part of a token is left at the cut.
    const random = fill(100, RANDOM);
    const long = `${"y ".repeat(2038)}${random}`;
    expect([long.indexOf(random) < 4096, long.indexOf(random) + 100 > 4096, redact(long).includes(random.slice(0, 8))]).toEqual([true, true, false]);

    // A diagnosis reads the name of an error, and keeps it only when it is one of the fixed list. It reads no message.
    const leaked = secret();
    const thrown = Object.assign(new Error(`refused: Bearer ${leaked}`), { name: `HostError ${leaked}` });
    const trap = { get name(): string { throw new Error(leaked); }, get message(): string { throw new Error(leaked); }, toString(): string { throw new Error(leaked); } };
    const lines: unknown[] = [];
    const log = vi.spyOn(console, "error").mockImplementation((...line: unknown[]) => { lines.push(line); });
    try {
      report(toConsole, "outside-call-failed", "hold@1:mint", thrown);
    } finally {
      log.mockRestore();
    }
    const said = [diagnosis("outside-call-failed", "hold@1:mint", thrown), diagnosis("e", "s", new TypeError(leaked)), diagnosis("e", "s", trap), diagnosis("e", "s", leaked), diagnosis("e", "s", null), diagnosis(`x token=${leaked}`, "y ".repeat(200), thrown)];
    expect(said.slice(0, 5)).toEqual([
      { event: "outside-call-failed", step: "hold@1:mint", name: "Error" }, { event: "e", step: "s", name: "TypeError" }, { event: "e", step: "s", name: "object" }, { event: "e", step: "s", name: "string" }, { event: "e", step: "s", name: "null" },
    ]);
    // An event or a step that a caller built from a value is redacted and cut to its length: the second guard.
    expect([said[5]!.event, said[5]!.step.length]).toEqual(["x token=<redacted>", MAX_FIELD]);
    expect(lines).toEqual([['{"event":"outside-call-failed","step":"hold@1:mint","name":"Error"}']]);
    expect(JSON.stringify([said, lines])).not.toContain(leaked);
    // A sink that fails changes nothing for the caller.
    expect(() => report(() => { throw new Error("the log is down"); }, "e", "s", thrown)).not.toThrow();
  });

  test("T14: a provider's error that holds a token, a URL query, userinfo and a bearer value is thrown at two outside calls; no entry, no read, no answer, no diagnosis and no log line holds a credential or the provider's text, each diagnosis is within its length, and the gateway's side still holds the tokens. The Git host, the gateway's side and the sender of a staging are stand-ins", async () => {
    const leaked = secret();
    const thrown = () => Object.assign(new Error(`POST https://ci:${leaked}@host.example/tokens?access=${leaked} failed with Authorization: Bearer ${leaked}`), { name: `HostError ${leaked}` });
    const lines: unknown[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation((...line: unknown[]) => { lines.push(line); }));
    try {
      // The first failure is at the Git host: the mint of the second token takes effect, and its call throws that error.
      const { h, stage } = await hosted((made) => made.host.fault("mint", 2, { fault: "lose-reply", throws: thrown() }));
      const { host, vault, s } = h;
      // The second is at the scope's own port: the request of the staging throws the same error. It is sent once both tokens are live.
      h.stager.answers.set(`${stage}#1`, { throws: thrown() });
      const answers: unknown[] = [await h.redeliver("mint", 2)];
      await h.drain();
      answers.push(await h.surface.effect());
      const plaintexts = [...host.tokens.values()].map((t) => t.plaintext);
      // That attempt of the staging is `unknown`, and its entry opened the next attempt, with two more tokens.
      expect([plaintexts.length, h.stager.sent[0], (await h.seen(stage)).operation.attempts[0]!.outcomes.map((o) => o.result)]).toEqual([4, `${stage}#1`, ["unknown"]]);

      // Every durable record that the failures wrote, and every read of them: the entries, the operations with the driver's rows,
      // the outbox, the summary and the items. With them: what a caller was answered, each diagnosis, the driver's log, and
      // every line that anything wrote to the console.
      const stub = s.stub;
      const reads = [await s.entries(), await h.surface.operations(reader), await stub.outbox(reader), await stub.summary(reader), await stub.items(reader, "hold"), await stub.items(reader, "commitment")];
      const written = JSON.stringify([reads, answers, h.diagnoses, h.log, lines]);
      for (const text of [leaked, ...plaintexts, "host.example", "HostError", "Bearer", "access="]) expect(written).not.toContain(text);

      // The diagnoses say what failed in fixed words, each within its length. The custody still holds each credential.
      expect([h.diagnoses, h.log, h.diagnoses.every((d) => [d.event, d.step, d.name].every((text) => text.length <= MAX_FIELD))]).toEqual([
        [{ event: "outside-call-failed", step: "hold@1:stage", name: "Error" }], ["mint host-failed"], true,
      ]);
      expect(vault.held.slice(0, 2).map((t) => [t.token, t.plaintext === host.tokens.get(t.id)!.plaintext])).toEqual([[1, true], [2, true]]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
