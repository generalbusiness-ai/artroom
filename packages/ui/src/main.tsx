/**
 * Entry point. The page runs on the deterministic mock room. URL options:
 *   ?step=N        open the scenario at step N (default: a stuck publication)
 *   ?viewer=@sam   whose queue to show
 *   ?dev           show the demo timeline
 *   ?theme=dark    force a theme (light, dark or system)
 * The live adapter (src/room/live) needs the client package's `connect()`,
 * which lane 0 declares and a later lane implements.
 */

import { render } from "preact";
import { App, type Theme } from "./app.tsx";
import type { MemberId } from "./room/contract.ts";
import { MockRoom } from "./room/mock/mock-room.ts";
import { DEFAULT_STEP } from "./room/mock/scenario.ts";

const params = new URLSearchParams(location.search);
const stepParam = params.get("step");
const viewer = params.get("viewer");
const theme = params.get("theme");

const adapter = new MockRoom({
  step: stepParam !== null && stepParam !== "" ? Number(stepParam) : DEFAULT_STEP,
  ...(viewer ? { viewer: viewer as MemberId } : {}),
});

render(
  <App adapter={adapter} dev={params.has("dev")} {...(theme === "light" || theme === "dark" || theme === "system" ? { theme: theme as Theme } : {})} />,
  document.getElementById("app")!,
);
