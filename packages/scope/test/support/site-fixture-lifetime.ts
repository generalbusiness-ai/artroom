import { beginSessionFixture } from "../session-settings.ts";
/** Site test settings only. Native objects keep the same clock reference. */
import { onTestFinished } from "vitest";
import { b64url, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { net } from "../../src/testing.ts";
import { platformOutside } from "../worker.ts";

type Factory = NonNullable<ReturnType<typeof platformOutside.get>>;
const retired = new WeakSet<Factory>();
let currentRelease: (() => void) | null = null;
export function siteFixtureLifetime() {
  // Starting a later Site owner explicitly releases its predecessor first.
  // This prevents cleanup from ever restoring a released Site owner.
  currentRelease?.();
  const clock = net.clock;
  const before = { hold: net.hold, deaf: net.deaf };
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const inspector = "a test reader";
  let released = false;
  let hold: NonNullable<typeof net.hold> = () => false;
  const deaf: NonNullable<typeof net.deaf> = () => false;
  const wired = new Map<ScopeId, { previous: Factory | undefined; installed: Factory }>();
  net.hold = hold; net.deaf = deaf;
  const sessionOwner = beginSessionFixture({ secret, sessions: true, inspector });
  const active = () => {
    sessionOwner.active();
    if (released || net.clock !== clock || net.hold !== hold || net.deaf !== deaf) throw new Error("Site fixture lifetime ended before its continuation completed.");
  };
  const release = () => {
    if (released) return;
    released = true;
    if (currentRelease === release) currentRelease = null;
    // Do not reset/replace the shared clock or restore its old reading. Live
    // native objects retain this reference and may have sealed at the advance.
    if (net.hold === hold) net.hold = before.hold;
    if (net.deaf === deaf) net.deaf = before.deaf;
    sessionOwner.close();
    for (const [name, record] of wired) {
      retired.add(record.installed);
      if (platformOutside.get(name) !== record.installed) continue;
      if (record.previous && !retired.has(record.previous)) platformOutside.set(name, record.previous);
      else platformOutside.delete(name);
    }
  };
  currentRelease = release;
  onTestFinished(release);
  return {
    active,
    release,
    async wait<T>(action: () => Promise<T>): Promise<T> { active(); const value = await action(); active(); return value; },
    setHold(next: NonNullable<typeof net.hold>): void { active(); hold = next; net.hold = hold; },
    wire(name: ScopeId, installed: Factory): void {
      active();
      const prior = wired.get(name);
      const previous = prior ? prior.previous : platformOutside.get(name);
      if (prior) retired.add(prior.installed);
      wired.set(name, { previous, installed }); platformOutside.set(name, installed);
    },
    advance(seconds: number): void {
      active();
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Site clock advance must be nonnegative.");
      const now = timeMs(clock.now);
      if (now === null) throw new Error("Site fixture clock unavailable.");
      clock.now = timeOf(now + seconds * 1000);
    },
  };
}
