/** Copy approved static pages and repository brand masters; no duplicate master is source. */
import { cp, mkdir, rename, rm, mkdtemp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const home = dirname(fileURLToPath(import.meta.url)), root = resolve(home, "..");
export async function buildHome(output = resolve(home, "assets")) {
  output = resolve(output);
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(resolve(dirname(output), ".dap-home-build-"));
  try {
    for (const file of ["index.html", "room/index.html", "library/index.html", "counter/index.html", "jam/index.html", "style.css", "_headers"]) {
      await mkdir(dirname(resolve(staging, file)), { recursive: true });
      await cp(resolve(home, "src", file), resolve(staging, file));
    }
    const masters = { "dap-wordmark-green.svg": "dap.svg", "dist/favicon.svg": "favicon.svg", "dist/favicon.ico": "favicon.ico", "dist/dap-card-1200x630.png": "dap-card-1200x630.png", "fonts/OpenRunde-Regular.woff2": "fonts/OpenRunde-Regular.woff2", "fonts/OpenRunde-Semibold.woff2": "fonts/OpenRunde-Semibold.woff2", "fonts/OpenRunde-Bold.woff2": "fonts/OpenRunde-Bold.woff2", "fonts/LICENSE-OpenRunde.txt": "fonts/LICENSE-OpenRunde.txt" };
    for (const [master, name] of Object.entries(masters)) {
      await mkdir(dirname(resolve(staging, "brand", name)), { recursive: true });
      await cp(resolve(root, "brand", master), resolve(staging, "brand", name));
    }
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
    return output;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildHome());
