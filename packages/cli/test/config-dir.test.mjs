// Invariant: changing the public config name selects existing custody rather than creating a second identity.
// Node builtins only; every resolver call supplies a synthetic home and working directory.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configDir, ConfigDirectoryError } from "../src/config-dir.ts";

const synthetic = { home: join(tmpdir(), "dap-synthetic-user"), cwd: join(tmpdir(), "dap-synthetic-work"), occupied: () => false };
const xdg = join(tmpdir(), "dap-synthetic-xdg");

test("explicit DAP_HOME and legacy ARTROOM_HOME select one normalized path or refuse before probing", () => {
  const options = { ...synthetic, occupied: () => assert.fail("An explicit choice or conflict must not inspect any default directory") };
  const room = join(synthetic.cwd, "room");
  assert.equal(configDir({ DAP_HOME: "keys/../room" }, options), room);
  assert.equal(configDir({ ARTROOM_HOME: "./room" }, options), room);
  assert.equal(configDir({ DAP_HOME: "./room/", ARTROOM_HOME: room }, options), room);
  assert.equal(configDir({ DAP_HOME: "", ARTROOM_HOME: "./room" }, options), room);
  assert.throws(() => configDir({ DAP_HOME: "./room", ARTROOM_HOME: "./other-room" }, options), ConfigDirectoryError);
  // A literal ~ is not expanded, and whitespace remains part of a supplied path.
  assert.equal(configDir({ DAP_HOME: "~/room " }, options), join(synthetic.cwd, "~", "room "));
});

test("new defaults use dap but occupied legacy XDG custody retains precedence over the home fallback", () => {
  assert.equal(configDir({}, synthetic), join(synthetic.home, ".config", "dap"));
  assert.equal(configDir({ DAP_HOME: "", ARTROOM_HOME: "", XDG_CONFIG_HOME: xdg }, synthetic), join(xdg, "dap"));
  const calls = [];
  const both = { ...synthetic, occupied: path => { calls.push(path); return true; } };
  assert.equal(configDir({ XDG_CONFIG_HOME: xdg }, both), join(xdg, "artroom"));
  assert.deepEqual(calls, [join(xdg, "artroom")]);
  const legacy = join(synthetic.home, ".config", "artroom");
  assert.equal(configDir({ XDG_CONFIG_HOME: xdg }, { ...synthetic, occupied: path => path === legacy }), legacy);
});

test("an empty new directory cannot hide legacy config, keys or pending records, and selection changes no bytes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "dap-config-choice-"));
  try {
    const home = join(scratch, "synthetic-user"), xdg = join(scratch, "synthetic-xdg"), legacy = join(xdg, "artroom");
    const options = { home, cwd: scratch };
    mkdirSync(join(xdg, "dap"), { recursive: true });
    mkdirSync(join(legacy, "keys"), { recursive: true });
    mkdirSync(join(legacy, "private"));
    const sentinels = {
      "config.json": "SYNTHETIC config retained verbatim",
      "keys/operator.key": "SYNTHETIC key sentinel, not a signing key",
      "private/join-pending.data": "SYNTHETIC pending request sentinel, not an envelope",
    };
    for (const [path, bytes] of Object.entries(sentinels)) writeFileSync(join(legacy, path), bytes);
    assert.equal(configDir({ XDG_CONFIG_HOME: xdg }, options), legacy);
    for (const [path, bytes] of Object.entries(sentinels)) assert.equal(readFileSync(join(legacy, path), "utf8"), bytes);
    assert.deepEqual(readdirSync(join(xdg, "dap")), []);
    // Existing key-only custody also survives an XDG change; no config.json is required for discovery.
    rmSync(join(legacy, "config.json"));
    assert.equal(configDir({ XDG_CONFIG_HOME: xdg }, options), legacy);
    assert.equal(configDir({ XDG_CONFIG_HOME: join(scratch, "new-xdg") }, { ...options, home: scratch }), join(scratch, "new-xdg", "dap"));
    const homeLegacy = join(home, ".config", "artroom");
    mkdirSync(join(homeLegacy, "keys"), { recursive: true });
    writeFileSync(join(homeLegacy, "keys", "device.key"), "SYNTHETIC previous-home key sentinel");
    assert.equal(configDir({ XDG_CONFIG_HOME: join(scratch, "new-xdg") }, options), homeLegacy);
    // A genuinely empty legacy directory holds no custody and permits the new default.
    rmSync(legacy, { recursive: true }); mkdirSync(legacy);
    assert.equal(configDir({ XDG_CONFIG_HOME: xdg }, { ...options, home: scratch }), join(xdg, "dap"));
    writeFileSync(join(scratch, "file-is-not-a-home"), "SYNTHETIC path collision");
    assert.throws(() => configDir({ XDG_CONFIG_HOME: join(scratch, "file-is-not-a-home") }, options), ConfigDirectoryError);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
