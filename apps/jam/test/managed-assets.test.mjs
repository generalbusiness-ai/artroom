// Invariant: moving Jam preserves the recorded public deployment, and stale source cannot silently reuse its bundle.
// This is an offline file-boundary witness. It does not prove browser audio or a provider deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { buildManagedAssets } from '../scripts/build-managed-assets.mjs';

const app = resolve(import.meta.dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const record = JSON.parse(await readFile(join(app, 'deployed-source.json'), 'utf8'));
async function paths(root, prefix = '') {
  const names = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) names.push(...await paths(join(root, entry.name), name + '/'));
    else { assert.ok(entry.isFile(), name); names.push(name); }
  }
  return names.sort();
}

test('managed recipe preserves all nineteen recorded public bodies and the security configuration', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'dap-jam-assets-'));
  try {
    assert.equal(record.origin.head, 'b4b7c764199e5b9758771e43f8132c618858bf32');
    assert.equal(record.origin.activeVersionId, '8f53e237-b1c8-4d5b-b309-7ac2b5a3c99c');
    assert.equal(record.assets.length, 19);
    const output = join(scratch, 'assets');
    await assert.rejects(buildManagedAssets(join(app, 'unexpected-output')), /Output must be outside the checkout/);
    await buildManagedAssets(output);
    assert.deepEqual(await paths(output), [...record.assets.map(row => row.path), '_headers'].sort());
    for (const row of [...record.assets, record.headers]) {
      const bytes = await readFile(join(output, row.path));
      assert.equal(bytes.length, row.bytes, row.path);
      assert.equal(sha(bytes), row.sha256, row.path);
    }
    const headers = await readFile(join(output, '_headers'), 'utf8');
    assert.equal(headers, "/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-cache\n");
    assert.deepEqual(JSON.parse(await readFile(join(app, 'wrangler.jsonc'), 'utf8')), {
      name: 'artroom-jam', compatibility_date: '2026-10-11',
      assets: { directory: './deploy/assets', "not_found_handling": 'none', run_worker_first: false },
    });
    // Source closure is static and local: no package, model or Worker import is introduced by this move.
    const modules = record.source.filter(row => row.path.endsWith('.ts'));
    assert.equal(modules.length, 17);
    for (const row of modules) {
      const text = await readFile(join(app, row.path), 'utf8');
      for (const match of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
        assert.ok(match[1].startsWith('.'), `${row.path}: ${match[1]}`);
        const target = resolve(app, row.path, '..', match[1]);
        assert.ok(modules.some(module => resolve(app, module.path) === target), `${row.path}: ${match[1]}`);
      }
    }
    await assert.rejects(buildManagedAssets(output), { code: 'EEXIST' });
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test('stale source or an unlisted asset refuses before creating an output', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'dap-jam-stale-'));
  try {
    const source = join(scratch, 'checkout/apps/jam');
    await cp(app, source, { recursive: true });
    const original = await readFile(join(source, 'src/music.ts'));
    await writeFile(join(source, 'src/music.ts'), Buffer.concat([original, Buffer.from('\n// stale source\n')]));
    const output = join(scratch, 'assets');
    await assert.rejects(buildManagedAssets(output, source), /Recorded bytes changed: src\/music.ts/);
    await assert.rejects(stat(output), { code: 'ENOENT' });
    await writeFile(join(source, 'src/music.ts'), original);
    await writeFile(join(source, 'deploy/assets/private-input.txt'), 'must never be published');
    await assert.rejects(buildManagedAssets(output, source), /Managed asset file set changed/);
    await assert.rejects(stat(output), { code: 'ENOENT' });
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
