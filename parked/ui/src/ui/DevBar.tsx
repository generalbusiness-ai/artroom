/** Demo controls for the mock room's timeline. Hidden unless the dev toggle is on. */

import type { Timeline } from "../room/adapter.ts";
import { useApp } from "./context.ts";
import { clock } from "./format.ts";
import { Icon } from "./icons.tsx";

export function DevBar({ timeline, onClose }: { timeline: Timeline; onClose: () => void }) {
  const { snap } = useApp();
  const t = timeline;
  return (
    <section class="devbar" aria-label="Demo timeline">
      <div class="row" style={{ gap: "4px" }}>
        <button class="btn quiet icon-btn" type="button" onClick={() => t.go(t.step - 1)} disabled={t.step === 0} aria-label="Previous step">
          <Icon name="back" />
        </button>
        <button class="btn icon-btn" type="button" onClick={() => (t.playing ? t.pause() : t.play())} aria-label={t.playing ? "Pause" : "Play"}>
          <Icon name={t.playing ? "pause" : "play"} />
        </button>
        <button class="btn quiet icon-btn" type="button" onClick={() => t.go(t.step + 1)} disabled={t.step === t.steps - 1} aria-label="Next step">
          <Icon name="forward" />
        </button>
      </div>
      <div class="stack-sm" style={{ minWidth: 0 }}>
        <label class="visually-hidden" for="timeline">
          Scenario step
        </label>
        <input id="timeline" type="range" min={0} max={t.steps - 1} value={t.step} onInput={(e) => t.go(Number(e.currentTarget.value))} />
        <p class="devbar-label" data-testid="step-label">
          Step {t.step} of {t.steps - 1} · {clock(snap.now)} · {t.label(t.step)}
        </p>
      </div>
      <button class="btn quiet small" type="button" onClick={onClose}>
        Hide
      </button>
    </section>
  );
}
