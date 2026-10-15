// Reproduce the recorded managed deployment, without rebundling or contacting a provider.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function localPath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Expected an app-local recorded path.');
  }
  return path;
}

async function checked(root, row) {
  const bytes = await readFile(join(root, localPath(row.path)));
  if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) {
    throw new Error(`Recorded bytes changed: ${row.path}. A new source and asset review is required.`);
  }
  return bytes;
}

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), path + '/'));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Managed assets must be regular files: ${path}.`);
  }
  return result.sort();
}

export async function buildManagedAssets(outputDirectory, sourceRoot = root) {
  if (!outputDirectory) throw new Error('Provide a fresh output directory outside the checkout.');
  sourceRoot = await realpath(sourceRoot);
  const checkout = await realpath(resolve(sourceRoot, '../..'));
  const output = resolve(outputDirectory);
  // Resolve the existing parent so a symlink cannot redirect writes into the checkout.
  const physicalOutput = join(await realpath(dirname(output)), relative(dirname(output), output));
  const underCheckout = relative(checkout, physicalOutput);
  if (!underCheckout || (!underCheckout.startsWith('..' + '/') && underCheckout !== '..' && !isAbsolute(underCheckout))) {
    throw new Error('Output must be outside the checkout.');
  }
  const record = JSON.parse(await readFile(join(sourceRoot, 'deployed-source.json'), 'utf8'));
  if (record.v !== 1) throw new Error('Unsupported deployed-source record.');
  const source = new Map();
  for (const row of record.source) source.set(row.path, await checked(sourceRoot, row));
  const config = JSON.parse(await readFile(join(sourceRoot, 'wrangler.jsonc'), 'utf8'));
  if (JSON.stringify(config) !== JSON.stringify(record.config)) throw new Error('Recorded managed configuration changed.');
  const assetRoot = join(sourceRoot, 'deploy/assets');
  const expectedFiles = [...record.assets.map(row => localPath(row.path)), localPath(record.headers.path)].sort();
  if (JSON.stringify(await files(assetRoot)) !== JSON.stringify(expectedFiles)) throw new Error('Managed asset file set changed.');
  const prepared = [];
  for (const row of record.assets) {
    // app.js is the actual retained bundle. The managed deployment did not rebundle it.
    let bytes = await checked(assetRoot, row);
    if (row.path === 'index.html') {
      const html = source.get('page/index.html').toString('utf8');
      if (html.split('src="app.ts"').length !== 2) throw new Error('Expected exactly one procedural entry.');
      bytes = Buffer.from(html.replace('src="app.ts"', 'src="app.js"'));
    } else if (row.path.startsWith('brand/')) {
      bytes = source.get('page/' + row.path);
    }
    if (!bytes || bytes.length !== row.bytes || digest(bytes) !== row.sha256) throw new Error(`Source does not reproduce recorded asset: ${row.path}.`);
    prepared.push([row.path, bytes]);
  }
  prepared.push([record.headers.path, await checked(assetRoot, record.headers)]);
  // mkdir is deliberately exclusive: an earlier output is never overwritten or removed.
  await mkdir(physicalOutput);
  for (const [path, bytes] of prepared) {
    const target = join(physicalOutput, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  return { output: physicalOutput, sourceHead: record.origin.head, assets: record.assets.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildManagedAssets(process.argv[2])));
}
