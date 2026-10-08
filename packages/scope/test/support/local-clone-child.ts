/** Fixed test child: parent validates argv/env/target; only IPC carries the
 * result. Git's inherited terminal output is bounded/captured by the parent. */
import { nodeGit } from "../../../cli/src/git.ts";

const chunks: Buffer[] = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 16 * 1024) throw new Error("local clone input exceeded fixture bound");
  chunks.push(Buffer.from(chunk));
}
const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { args: string[]; env: Record<string, string> };
const code = await nodeGit().run(input.args, input.env);
process.send?.({ code });
