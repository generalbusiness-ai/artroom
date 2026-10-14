import { render, waitFor as waitForSlowly } from "@testing-library/preact";
import { App } from "../src/app.tsx";
import type { RoomAdapter } from "../src/room/adapter.ts";
import { MockRoom, type MockOptions } from "../src/room/mock/mock-room.ts";
import { STEPS } from "../src/room/mock/scenario.ts";

export const stepOf = (label: string) => {
  const i = STEPS.findIndex((s) => s.label.startsWith(label));
  if (i < 0) throw new Error(`no step ${label}`);
  return i;
};

/** Render the whole app at a route. */
export function renderAt(hash: string, opts: MockOptions | RoomAdapter = {}) {
  location.hash = hash;
  const adapter = "snapshot" in opts ? opts : new MockRoom(opts);
  const view = render(<App adapter={adapter} />);
  return { adapter, ...view };
}

/** The lane ID for a goal, at a step. */
export function laneId(goal: string, step?: number) {
  const s = new MockRoom(step === undefined ? {} : { step }).snapshot();
  return s.lanes.find((l) => l.goal === goal)!.lane;
}

/**
 * testing-library's `waitFor`, looking again every 2 ms. Its own default is
 * every 50 ms, which is what most of this suite's time was: the state these
 * tests wait for is an adapter's snapshot or a count, which no change to the
 * page announces.
 */
export const waitFor: typeof waitForSlowly = (callback, options) => waitForSlowly(callback, { interval: 2, ...options });

/** Lets what is already under way finish: timers that are due and the promises behind them. */
export const settled = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));
