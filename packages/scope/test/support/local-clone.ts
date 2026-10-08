/** Test-only bridge to Node's real Git. Host identity/mint rights are stand-ins. */
import type {} from "vitest";
export interface LocalCloneAddress { url: string; nonce: string; directory: string }
export interface LocalCloneInspection {
  head: string; tree: string; expectedTree: string; paths: string; readme: string; origin: string;
  tokenInConfig: boolean; tokenInOutput: boolean; readRequests: number;
}
declare module "vitest" { interface ProvidedContext { localClone: LocalCloneAddress } }

export function localClone(at: LocalCloneAddress) {
  const headers = { "x-clone-fixture": at.nonce };
  const json = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${at.url}${path}`, { headers: { ...headers, "content-type": "application/json" }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error("local clone fixture refused");
    return response.json() as Promise<T>;
  };
  return {
    configure: (name: string) => json<{ remote: string }>("/configure", { name }),
    mint: (name: string, scope: "read" | "write", seconds: number) => json<{ id: string; scope: "read" | "write"; plaintext: string }>("/mint", { name, scope, seconds }),
    revoke: (name: string, plaintext: string) => json<boolean>("/revoke", { name, plaintext }),
    run: (args: readonly string[], env: Readonly<Record<string, string>>) => json<{ code: number | null; outputClean: boolean }>("/run", { args, env }),
    inspect: () => json<LocalCloneInspection>("/inspect"),
    status: () => json<unknown>("/status"),
    forward: async (request: Request) => {
      // Fixed trusted test proxy, as Host.upstream's synthetic Response. The
      // local transport URL is not evidence about HTTPS/redirect behavior.
      const response = await fetch(`${at.url}/backend`, {
        method: request.method, redirect: "manual", signal: request.signal,
        headers: { ...Object.fromEntries(request.headers), ...headers, "x-clone-remote": request.url },
        ...(request.method === "POST" ? { body: request.body } : {}),
      });
      return new Response(response.body, { status: response.status, headers: response.headers });
    },
  };
}
