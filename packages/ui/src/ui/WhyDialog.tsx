/** The "why" panel: what `explain` says about one act — the rules applied, their outcomes, and the invariants checked. */

import { useEffect, useRef, useState } from "preact/hooks";
import type { Why } from "../room/adapter.ts";
import type { ActId, Decision } from "../room/contract.ts";
import { Actor, Badge } from "./bits.tsx";
import { useApp } from "./context.ts";
import { Icon } from "./icons.tsx";

function outcomeText(d: Decision): string {
  const o = d.outcome;
  switch (o.result) {
    case "pass":
      return "Passed.";
    case "refuse":
    case "block":
      return `${o.result === "refuse" ? "Refused" : "Blocked"}: ${o.reason} Fix: ${o.fix}`;
    case "obligation":
      return `Created the obligation ${o.obligation}.`;
    case "carry":
      return `Let ${o.evidence} carry.`;
    case "no-carry":
      return `Did not let ${o.evidence} carry.`;
    case "notify":
      return `Notified ${o.to.join(", ")}.`;
    case "error":
      return `Errored (${o.code}): ${o.detail}`;
  }
}

export function WhyDialog({ act, onClose }: { act: ActId | null; onClose: () => void }) {
  const { adapter } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [why, setWhy] = useState<Why | null | "loading">("loading");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (act) {
      setWhy("loading");
      void adapter.explain(act).then(setWhy);
      if (!d.open) {
        if (typeof d.showModal === "function") d.showModal();
        else d.setAttribute("open", "");
      }
    } else if (d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [act, adapter]);

  return (
    <dialog class="why" ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="why-title">
      <div class="why-head">
        <div class="stack-sm">
          <h2 id="why-title">{why && why !== "loading" ? why.title : "Why"}</h2>
          {why && why !== "loading" && (
            <p class="row small muted">
              Entry {why.seq}
              {why.by && (
                <>
                  {" "}· by <Actor handle={why.by} plain />
                </>
              )}
              {why.outcome === "refused" ? <Badge tone="bad">Refused</Badge> : why.outcome === "system" ? <Badge>Recorded by the room</Badge> : <Badge tone="ok">Accepted</Badge>}
              {why.published ? <Badge tone="outline">Published: verifiable offline</Badge> : <Badge tone="outline">Not yet published</Badge>}
            </p>
          )}
        </div>
        <button class="btn quiet icon-btn" type="button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div class="why-body">
        {why === "loading" ? (
          <p class="muted">Loading…</p>
        ) : why === null ? (
          <p class="muted">The room has no explanation for this entry.</p>
        ) : (
          <>
            {why.reasons.length > 0 && (
              <section class="stack-sm">
                <h3>Rests on</h3>
                <ul class="stack-sm small">
                  {why.reasons.map((r, i) => (
                    <li key={i}>
                      {"url" in r ? (
                        <a href={r.url} rel="noreferrer">
                          {r.url}
                        </a>
                      ) : "act" in r ? (
                        <code>{r.act}</code>
                      ) : (
                        <code>{r.commit}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section class="stack-sm">
              <h3>Policy decisions</h3>
              {why.decisions.length ? (
                <ul class="stack-sm">
                  {why.decisions.map((d, i) => (
                    <li key={i} class="small">
                      <code>{d.rule}</code> <span class="subtle">({d.kind})</span> {outcomeText(d)}
                      <span class="subtle">
                        {" "}
                        {d.usage.steps} evaluation steps; input {d.input.slice(0, 19)}…
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="small muted">No policy rule applied to this act.</p>
              )}
            </section>
            <section class="stack-sm">
              <h3>Platform rules checked</h3>
              <ul class="stack-sm">
                {why.invariants.map((v, i) => (
                  <li key={i} class="inv">
                    <Icon name={v.held ? "check" : "refused"} class={v.held ? "tone-ok" : "tone-bad"} label={v.held ? "held" : "did not hold"} />
                    <code>{v.rule}</code>
                    <span>{v.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
