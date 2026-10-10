import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { compatibility, inspectPool, preparePool, sha256 } from "./cloudflare-pool-compat.mjs";

// The REAL pinned factory extracted from the guarded installed bundle. Base is
// a Node stand-in, not a native Worker/DO or authority claim. The separate
// native diagnostic runs the actual pool wrappers with real HTTP and storage.
test("the actual pinned pool factory keeps one lazy prototype across early and late constructions, preserving receiver and later prototype methods", () => {
  const root = new URL("../node_modules/@cloudflare/vitest-pool-workers/", import.meta.url);
  const bundle = inspectPool(fileURLToPath(root)).bytes.toString("utf8");
  const start = bundle.indexOf("function createProxyPrototypeClass(");
  const end = bundle.indexOf("\n/**", start);
  assert.ok(start >= 0 && end > start);
  // Known dependency of this exact source span, not a cloned factory/model.
  const factory = runInNewContext(`const IGNORED_KEYS = ["self"];\n${bundle.slice(start, end)}\ncreateProxyPrototypeClass`);
  class Base {
    constructor(name) { this.name = name; }
    greeting() { return `hello ${this.name}`; }
  }
  const unknown = [];
  const Wrapped = factory(Base, function (key) { unknown.push([this.name, key]); return `${this.name}:${key}`; });
  const untouched = Wrapped.prototype;
  Wrapped.prototype.later = function () { return this.name; };
  const first = new Wrapped("first"), installed = Wrapped.prototype;
  assert.notEqual(installed, untouched); // Still lazy: no proxy before construction.
  Object.defineProperty(Wrapped.prototype, "registeredLater", { get() { return this.name; } });
  for (let i = 0; i < 32; i++) {
    const instance = new Wrapped(`member-${i}`);
    assert.equal(Object.getPrototypeOf(instance), installed);
    assert.equal(Wrapped.prototype, installed);
    assert.equal(instance.greeting(), `hello member-${i}`);
    assert.equal(instance.later(), `member-${i}`);
    assert.equal(instance.registeredLater, `member-${i}`);
  }
  assert.equal(first.greeting(), "hello first");
  assert.equal(first.registeredLater, "first");
  assert.equal(Reflect.get(first, "unknown"), "first:unknown");
  assert.equal(Reflect.get(first, "self"), undefined);
  assert.equal(Reflect.get(first, Symbol("unexposed")), undefined);
  assert.deepEqual(unknown, [["first", "unknown"]]);
  assert.equal(Object.getPrototypeOf(installed), Base.prototype);
  assert.equal(Object.getPrototypeOf(Wrapped), Base);
});

test("compatibility privately copies cache-linked bytes, is idempotent, and refuses unknown versions or bundles before changing that view", () => {
  const temp = mkdtempSync(join(tmpdir(), "artroom-pool-compat-"));
  try {
    // Real guarded bundle, fixture directories standing for an install/view.
    const actual = inspectPool(fileURLToPath(new URL("../node_modules/@cloudflare/vitest-pool-workers/", import.meta.url))).bytes.toString("utf8");
    const original = actual.replace(compatibility.after_factory, compatibility.before_factory);
    assert.equal(sha256(original), compatibility.before_sha256);
    const cache = join(temp, "cache", "@cloudflare"), source = join(cache, "vitest-pool-workers");
    const bundle = join(source, compatibility.relative_bundle);
    mkdirSync(dirname(bundle), { recursive: true });
    const metadata = { name: compatibility.package, version: compatibility.version, license: "MIT" };
    writeFileSync(join(source, "package.json"), JSON.stringify(metadata));
    writeFileSync(bundle, original);
    writeFileSync(join(source, "unchanged.d.ts"), "export declare const unchanged: true;\n");
    mkdirSync(join(cache, "workers-types"));
    writeFileSync(join(cache, "workers-types", "retained.d.ts"), "retained\n");
    const view = name => {
      const root = join(temp, name); mkdirSync(join(root, "node_modules"), { recursive: true });
      symlinkSync(cache, join(root, "node_modules", "@cloudflare")); return root;
    };
    const owned = view("owned"), prepared = preparePool(owned);
    assert.equal(prepared.after, compatibility.after_sha256);
    assert.equal(prepared.copied, true);
    assert.equal(lstatSync(join(owned, "node_modules", "@cloudflare")).isSymbolicLink(), false);
    assert.equal(lstatSync(prepared.packageRoot).isSymbolicLink(), false);
    assert.equal(readFileSync(join(prepared.packageRoot, "unchanged.d.ts"), "utf8"), "export declare const unchanged: true;\n");
    assert.equal(readFileSync(join(owned, "node_modules", "@cloudflare", "workers-types", "retained.d.ts"), "utf8"), "retained\n");
    assert.equal(sha256(readFileSync(bundle)), compatibility.before_sha256);
    assert.deepEqual([preparePool(owned).copied, inspectPool(prepared.packageRoot).hash], [false, compatibility.after_sha256]);
    // An existing staging name belongs to someone else. EEXIST must leave
    // both their sentinel and the old target intact, not fail later at ENOENT.
    const ownedBundle = join(prepared.packageRoot, compatibility.relative_bundle);
    writeFileSync(ownedBundle, original);
    const sentinel = `${ownedBundle}.artroom-${process.pid}`;
    const sentinelBytes = "owned by the caller, not compatibility preparation\n";
    writeFileSync(sentinel, sentinelBytes, { flag: "wx" });
    assert.throws(() => preparePool(owned), { code: "EEXIST" });
    assert.equal(existsSync(sentinel), true);
    assert.equal(readFileSync(sentinel, "utf8"), sentinelBytes);
    assert.equal(sha256(readFileSync(ownedBundle)), compatibility.before_sha256);
    unlinkSync(sentinel); // The witness created and owns this sentinel.
    assert.equal(preparePool(owned).after, compatibility.after_sha256);
    assert.deepEqual([preparePool(owned).copied, inspectPool(prepared.packageRoot).hash], [false, compatibility.after_sha256]);
    assert.equal(sha256(readFileSync(bundle)), compatibility.before_sha256);
    const refused = view("refused");
    writeFileSync(join(source, "package.json"), JSON.stringify({ ...metadata, version: "0.23.0" }));
    assert.throws(() => preparePool(refused), /exact pinned package\/version/);
    assert.equal(lstatSync(join(refused, "node_modules", "@cloudflare")).isSymbolicLink(), true);
    writeFileSync(join(source, "package.json"), JSON.stringify(metadata));
    writeFileSync(bundle, `${original}\nunknown bytes`);
    assert.throws(() => preparePool(refused), /unknown complete bundle/);
    assert.equal(lstatSync(join(refused, "node_modules", "@cloudflare")).isSymbolicLink(), true);
    assert.equal(readFileSync(bundle, "utf8"), `${original}\nunknown bytes`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
