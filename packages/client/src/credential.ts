/** A bounded, checked one-time credential read. No retry can recover a consumed plaintext. */
import type { Read, ScopeId } from "@generalbusiness/artroom-contract";
import { LATE, isRead, isRecord, timeMs, takeBytes, within } from "@generalbusiness/artroom-bytes";
import { TransportError } from "./handle.ts";
import type { Fetch } from "./http.ts";

export interface ReadCredential { token: string; ends: string; remote: string }

/** The fetch runtimes used here also provide URL; the client has no DOM dependency. */
type Url = { protocol: string; username: string; password: string };
const remoteUrl = (value: unknown): boolean => {
  if (typeof value !== "string" || !/^https:\/\//i.test(value) || /[\x00-\x20\x7f-\x9f]/.test(value)) return false;
  const Url = (globalThis as { URL?: new (url: string) => Url }).URL;
  if (!Url) return false;
  try {
    const url = new Url(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch { return false; }
};
const isCredential = (value: unknown): value is ReadCredential => isRecord(value)
  && Object.keys(value).length === 3 && typeof value["token"] === "string" && /^[!-~]{1,4096}$/.test(value["token"])
  && timeMs(value["ends"]) !== null && remoteUrl(value["remote"]);

export async function readCredential(service: string, scope: ScopeId, reader: string, handle: string, options: { fetch?: Fetch; bytes?: number; seconds?: number } = {}): Promise<Read<ReadCredential>> {
  const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  if (!send) throw new TransportError("this runtime has no fetch; no credential was requested");
  const failed = (): TransportError => new TransportError("The credential reply is unavailable or invalid; the one-time credential may have been consumed.");
  try {
    const bytes = await within(options.seconds ?? 30, async (signal) => {
      const response = await send(`${service.replace(/\/+$/, "")}/v1/scopes/${encodeURIComponent(scope)}/credential/${encodeURIComponent(handle)}`, { method: "GET", headers: { authorization: reader }, signal: signal as never });
      return response.body ? takeBytes(response.body, options.bytes ?? 65536, signal) : null;
    });
    if (bytes === LATE || bytes === null) throw failed();
    const answer: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    if (!isRead(isCredential)(answer)) throw failed();
    return answer;
  } catch { throw failed(); }
}
