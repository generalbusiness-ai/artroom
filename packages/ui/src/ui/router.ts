/** Hash routes, so the static assets need no server routing. */

import { useEffect, useState } from "preact/hooks";
import type { ActId } from "../room/contract.ts";

export type Route =
  | { readonly name: "needs" }
  | { readonly name: "room" }
  | { readonly name: "policy" }
  | { readonly name: "proposal"; readonly lane: ActId; readonly generation?: number; readonly focus?: "review" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "room":
      return { name: "room" };
    case "policy":
      return { name: "policy" };
    case "lane": {
      const lane = parts[1] as ActId | undefined;
      if (!lane) return { name: "room" };
      const g = Number(parts[2]);
      return { name: "proposal", lane, ...(Number.isInteger(g) && g > 0 ? { generation: g } : {}), ...(parts[3] === "review" ? { focus: "review" as const } : {}) };
    }
    default:
      return { name: "needs" };
  }
}

export const href = {
  needs: () => "#/needs-you",
  room: () => "#/room",
  policy: () => "#/policy",
  proposal: (lane: ActId, generation?: number, focus?: "review") => `#/lane/${lane}${generation ? `/${generation}` : ""}${focus ? `/${focus}` : ""}`,
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}
