// Build only the local procedural page and its explicitly listed public assets.
// Pass an existing pinned esbuild module path and a scratch output directory.
// No provider operation or dependency installation is performed here.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [modulePath, outputDirectory] = process.argv.slice(2);
if (!modulePath || !outputDirectory) throw new Error('Provide a pinned esbuild module and scratch output directory.');
const root = resolve(import.meta.dirname, '..');
const output = resolve(outputDirectory);
if (output === root || output.startsWith(root + '/')) throw new Error('Output must be outside the checkout.');
const esbuild = await import(pathToFileURL(resolve(modulePath)).href);
if (esbuild.version !== '0.28.1') throw new Error('Expected pinned esbuild 0.28.1.');
const result = await esbuild.build({
  absWorkingDir: root, entryPoints: ['page/app.ts'], bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', write: false,
  logLevel: 'silent',
});
const files = [
  ['tokens.css', 'text/css; charset=utf-8'], ['fonts.css', 'text/css; charset=utf-8'],
  ...['LICENSE-OpenRunde.txt', 'LICENSE-Teletype33.txt', 'LICENSE-SometypeMono.txt'].map(name => ['fonts/' + name, 'text/plain; charset=utf-8']),
  ['dap-wordmark-green.svg', 'image/svg+xml'], ['dap-wordmark-white.svg', 'image/svg+xml'],
  ['favicon.svg', 'image/svg+xml'], ['favicon.ico', 'image/vnd.microsoft.icon'],
  ...['OpenRunde-Regular.woff2', 'OpenRunde-Medium.woff2', 'OpenRunde-Semibold.woff2',
    'OpenRunde-Bold.woff2', 'SometypeMono-Regular.woff2', 'SometypeMono-Medium.woff2']
    .map(name => ['fonts/' + name, 'font/woff2']),
  ...['Teletype33-Narrow.ttf', 'Teletype33.ttf'].map(name => ['fonts/' + name, 'font/ttf']),
];
const assets = {};
const put = (path, type, bytes) => { assets[path] = { type, body: Buffer.from(bytes).toString('base64') }; };
const sourceHTML = await readFile(join(root, 'page/index.html'), 'utf8');
if (!sourceHTML.includes('src="app.ts"')) throw new Error('Expected the procedural page entry.');
put('/', 'text/html; charset=utf-8', sourceHTML.replace('src="app.ts"', 'src="app.js"'));
put('/app.js', 'text/javascript; charset=utf-8', result.outputFiles[0].contents);
for (const [name, type] of files) put('/brand/' + name, type, await readFile(join(root, 'page/brand', name)));
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const worker = `const assets = ${JSON.stringify(assets)};\nconst csp = ${JSON.stringify(csp)};\nexport default { fetch(request) {\n  const method = request.method;\n  if (method !== 'GET' && method !== 'HEAD') return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });\n  const path = new URL(request.url).pathname;\n  const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;\n  if (!asset) return new Response('not found', { status: 404 });\n  const bytes = Uint8Array.from(atob(asset.body), c => c.charCodeAt(0));\n  return new Response(method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': asset.type, 'Content-Length': String(bytes.length), 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } });\n} };\n`;
await mkdir(output, { recursive: true });
await writeFile(join(output, 'worker.mjs'), worker);
await writeFile(join(output, 'index.html'), sourceHTML.replace('src="app.ts"', 'src="app.js"'));
await writeFile(join(output, 'app.js'), result.outputFiles[0].contents);
