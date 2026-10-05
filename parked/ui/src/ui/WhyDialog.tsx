/** The "why" panel: what `explain` says about one act — the rules applied, their outcomes, and the invariants checked. */

import { useEffect, useRef, useState } from "preact/hooks";
import type { EntryMeaning, Why } from "../room/adapter.ts";
import type { ActId, Decision } from "../room/contract.ts";
import { Actor, Badge, RecordFields } from "./bits.tsx";
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

/** Where a record's meaning came from, in a sentence (R-DECL-23). The record is read under the policy of its own entry, not today's. */
function meaningNote(m: EntryMeaning): string {
  switch (m.vocabulary) {
    case "declared":
      return `Declared by the policy in force at this entry, version ${m.policy}.${m.retired !== undefined ? ` A later policy dropped this kind at seq ${m.retired}. This record keeps the meaning it had.` : ""}`;
    case "artroom-legacy-v1":
      return `One of the built-in review acts, under a policy with no declarations of its own.${m.retired !== undefined ? ` That policy was replaced at seq ${m.retired}.` : ""}`;
    case "platform":
      return "A platform act. It means the same in every room.";
    case "unknown":
      return "The policy in force at this entry did not declare this kind.";
    default:
      return "";
  }
}

type Loaded =
  | { readonly act: ActId; readonly status: "loading" }
  | { readonly act: ActId; readonly status: "ready"; readonly why: Why | null }
  | { readonly act: ActId; readonly status: "error"; readonly message: string };

export function WhyDialog({ act, onClose }: { act: ActId | null; onClose: () => void }) {
  const { adapter } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Each request gets a number. A response counts only if its number is still the latest.
  const latest = useRef(0);

  const load = (a: ActId) => {
    const ticket = ++latest.current;
    setLoaded({ act: a, status: "loading" });
    adapter.explain(a).then(
      (why) => {
        if (latest.current === ticket) setLoaded({ act: a, status: "ready", why });
      },
      (error: unknown) => {
        if (latest.current !== ticket) return;
        const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "no answer";
        setLoaded({ act: a, status: "error", message });
      },
    );
  };

  useEffect(() => {
    const d = ref.current;
    if (act) load(act);
    else {
      latest.current++; // closing invalidates any request in flight
      setLoaded(null);
    }
    if (!d) return;
    if (act && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!act && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [act, adapter]);

  useEffect(
    () => () => {
      latest.current++; // unmounting invalidates too
    },
    [],
  );

  const current = loaded && loaded.act === act ? loaded : null;
  const why = current?.status === "ready" ? current.why : current?.status === "loading" || !current ? "loading" : null;

  return (
    <dialog class="why" ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="why-title" data-act={act ?? ""}>
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
        {current?.status === "error" ? (
          <div class="notice warn" role="alert">
            <p>The room did not explain this entry: {current.message}.</p>
            <div>
              <button class="btn small" type="button" onClick={() => act && load(act)}>
                Try again
              </button>
            </div>
          </div>
        ) : why === "loading" ? (
          <p class="muted">Loading…</p>
        ) : why === null ? (
          <p class="muted">The room has no explanation for this entry.</p>
        ) : (
          <>
            {why.meaning && (
              <section class="stack-sm" data-meaning={why.meaning.vocabulary}>
                <h3>What it meant at entry {why.seq}</h3>
                <p class="small muted">{meaningNote(why.meaning)}</p>
                <RecordFields meaning={why.meaning} />
              </section>
            )}
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
