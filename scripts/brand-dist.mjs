/** Regenerate the public distribution from adopted masters; rasterizer lives outside the checkout. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharpPath = resolve(process.argv[2] ?? "/missing-sharp");
if (sharpPath.startsWith(root + "/")) throw new Error("Run pinned sharp from a scratch installation.");
const sharp = (await import(pathToFileURL(sharpPath).href)).default;
if (sharp.versions.sharp !== "0.35.4") throw new Error("Expected sharp 0.35.4.");
const master = name => readFile(resolve(root, "brand", name), "utf8");
const recolour = (source, colour) => source.replace(/fill="#[0-9a-f]{6}"/gi, `fill="${colour}"`);
const pathOf = source => source.match(/<path fill="#[0-9a-f]{6}" d="([^"]+)"\/>/i)?.[1] ?? (() => { throw new Error("Missing master path."); })();
const wrap = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-labelledby="t"><title id="t">${title}</title>${body}</svg>\n`;
const smallPath = pathOf(await master("dap-symbol-reversed.svg"));
const favicon = wrap("dap tab icon", `<circle cx="128" cy="128" r="128" fill="#123F2B"/><g transform="translate(34.4 34.4) scale(1.3)"><path fill="#FFFFFF" d="${smallPath}"/></g>`);
const app = wrap("dap app icon", `<rect width="256" height="256" rx="57.6" fill="#123F2B"/><g transform="translate(44.36 44.36) scale(0.667)">${recolour((await master("dap-symbol-small.svg")).match(/<g[\s\S]*<\/g>/)[0], "#FFFFFF")}</g>`);
const maskable = wrap("dap maskable icon", `<rect width="256" height="256" fill="#123F2B"/><g transform="translate(44.36 44.36) scale(0.667)">${recolour((await master("dap-symbol-small.svg")).match(/<g[\s\S]*<\/g>/)[0], "#FFFFFF")}</g>`);
const files = new Map();
for (const [label, colour] of [["black", "#000000"], ["white", "#FFFFFF"], ["mono-123f2b", "#123F2B"]]) {
  const wordmark = recolour(await master("dap-wordmark.svg"), colour);
  files.set(`dap-wordmark-${label}.svg`, Buffer.from(wordmark));
  files.set(`dap-symbol-${label}.svg`, Buffer.from(recolour(await master("dap-symbol.svg"), colour)));
  files.set(`dap-wordmark-${label}-1200.png`, await sharp(Buffer.from(wordmark)).resize({ width: 1200 }).png().toBuffer());
}
files.set("dap-symbol-square.svg", Buffer.from(wrap("dap square symbol", `<g transform="translate(0.01 0.01) scale(0.996)">${(await master("dap-symbol.svg")).match(/<g[\s\S]*<\/g>/)[0]}</g>`)));
files.set("dap-symbol-app-icon.svg", Buffer.from(app));
files.set("dap-symbol-favicon.svg", Buffer.from(favicon));
files.set("favicon.svg", Buffer.from(favicon));
const faviconPNGs = [];
for (const size of [16, 32, 48]) {
  const png = await sharp(Buffer.from(favicon)).resize(size, size).png().toBuffer();
  faviconPNGs.push(png); files.set(`favicon-${size}.png`, png);
}
// ICO directory entries contain the exact corresponding PNG, supported by modern browsers.
const directory = Buffer.alloc(6 + 16 * faviconPNGs.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(faviconPNGs.length, 4);
let offset = directory.length;
faviconPNGs.forEach((png, index) => {
  const entry = 6 + index * 16, size = [16, 32, 48][index];
  directory[entry] = directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8); directory.writeUInt32LE(offset, entry + 12); offset += png.length;
});
files.set("favicon.ico", Buffer.concat([directory, ...faviconPNGs]));
for (const [name, size, source] of [["apple-touch-icon.png", 180, app], ["icon-192.png", 192, app], ["icon-512.png", 512, app], ["maskable-512.png", 512, maskable]]) files.set(name, await sharp(Buffer.from(source)).resize(size, size).png().toBuffer());
files.set("head-snippet.html", Buffer.from('<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="#123F2B">\n'));
files.set("site.webmanifest", Buffer.from(JSON.stringify({ name: "dap logo", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }], theme_color: "#123F2B", background_color: "#123F2B", display: "standalone" }, null, 2) + "\n"));
await mkdir(resolve(root, "brand/dist"), { recursive: true });
for (const [name, bytes] of files) {
  await writeFile(resolve(root, "brand/dist", name), bytes);
  console.log(JSON.stringify({ file: `brand/dist/${name}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
}
