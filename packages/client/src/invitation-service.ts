/** URL syntax for an invitation service. This does not establish trust in its host. */
interface ServiceUrl {
  protocol: string; hostname: string; username: string; password: string;
  search: string; hash: string; href: string; origin: string; pathname: string;
}

/** Internal shared check. Keep the invitation's original service bytes unchanged. */
export function invitationServiceUrl(value: unknown): ServiceUrl | null {
  if (typeof value !== "string") return null;
  try {
    const Url = (globalThis as { URL?: new (url: string) => ServiceUrl }).URL;
    if (!Url) return null;
    const url = new Url(value);
    if (url.username || url.password || url.search || url.hash || url.href.includes("?") || url.href.includes("#")) return null;
    if (url.protocol === "https:") return url;
    const loopback = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname) || url.hostname === "[::1]";
    return url.protocol === "http:" && loopback ? url : null;
  } catch { return null; }
}
