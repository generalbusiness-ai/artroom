/**
 * The Acts screen: what this room's policy lets people do, in the room's
 * own words, and a form to do one of them (declared acts stage 5, request
 * a5d64b35).
 *
 * It lists the active declarations with their labels and help. For a
 * chosen act it builds a form from the declaration: one input per field, by
 * type, with the declared limits checked before anything is sent. It
 * submits with the binding of the declarations the person was looking at.
 *
 * If the room answers that the act's meaning changed (`binding-stale`), the
 * form says so, reads the declarations again, shows what changed, and sends
 * again only when the person says to. It never resubmits by itself
 * (R-DECL-16).
 *
 * Nothing here names an act. The same screen serves any application.
 *
 * Each guard is one statement marked `// G5U:<id>`.
 */

import { useRef, useState } from "preact/hooks";
import { SHAPE_TAG, SHAPE_TEXT, TARGET_INPUTS, declarationChanges, fieldsOf, newIdempotencyKey, own, readBody, readTarget, targetsOf, typeText, type ActField } from "../room/acts.ts";
import type { ActDeclaration, ActsCatalogue, Binding, DeclaredRecord, DeclaredTarget, Json, Refusal, TargetShape } from "../room/contract.ts";
import { isRefusal } from "../room/contract.ts";
import { Badge, RefusalNotice, WhyLink } from "../ui/bits.tsx";
import { useApp } from "../ui/context.ts";
import { laneGoal } from "../ui/format.ts";
import { Icon } from "../ui/icons.tsx";
import { href } from "../ui/router.ts";

const orList = (items: readonly string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`);
const whoText = (d: ActDeclaration) => (d.who.roles.length ? `Admins, and anyone with the role ${orList(d.who.roles.map(String))}.` : "Admins only.");

/**
 * One act as it was sent: the declarations it was read under, its target,
 * body and binding, and its idempotency key. If the room's answer is lost,
 * exactly this is sent again, so the room can tell it is the same act.
 */
interface Intent {
  readonly under: ActsCatalogue;
  readonly target: DeclaredTarget;
  readonly body: { readonly [field: string]: Json };
  readonly binding: Binding;
  readonly key: string;
}

type Status =
  | { readonly state: "editing" }
  | { readonly state: "sending" }
  | { readonly state: "done"; readonly record: DeclaredRecord }
  | { readonly state: "refused"; readonly refusal: Refusal }
  /** The meaning changed. `fresh` is what the room declares now; nothing is sent until the person confirms. */
  | { readonly state: "stale"; readonly fresh: ActsCatalogue; readonly changes: readonly string[] }
  | { readonly state: "gone" }
  /** The answer was lost: the room may have recorded the act. `intent` is what was sent, kept to ask again unchanged. */
  | { readonly state: "unresolved"; readonly intent: Intent; readonly message: string }
  | { readonly state: "failed"; readonly message: string };

function FieldInput({ f, value, problem, onInput }: { f: ActField; value: string; problem: string | undefined; onInput: (v: string) => void }) {
  const { snap } = useApp();
  const id = `act-field-${f.name}`;
  const spec = f.field;
  const common = { id, "aria-invalid": problem ? true : undefined, "aria-describedby": `${id}-hint` } as const;
  const control = (() => {
    switch (spec.type) {
      case "text":
      case "globs":
      case "check-input":
        return <textarea class="textarea" {...common} value={value} onInput={(e) => onInput(e.currentTarget.value)} />;
      case "bool":
        return (
          <select class="select" {...common} value={value} onChange={(e) => onInput(e.currentTarget.value)}>
            <option value="">{f.required ? "Choose" : "Leave out"}</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );
      case "enum":
        return (
          <select class="select" {...common} value={value} onChange={(e) => onInput(e.currentTarget.value)}>
            <option value="">{f.required ? "Choose" : "Leave out"}</option>
            {spec.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        );
      case "member":
        return (
          <select class="select" {...common} value={value} onChange={(e) => onInput(e.currentTarget.value)}>
            <option value="">{f.required ? "Choose" : "Leave out"}</option>
            {snap.people.map((p) => (
              <option key={p.handle} value={p.handle}>
                {p.handle}
              </option>
            ))}
          </select>
        );
      default:
        // int, act, segment and the steps' own single-line fields. A type this page does not know is still shown; reading it refuses.
        return <input class="input" type="text" inputMode={spec.type === "int" ? "numeric" : undefined} {...common} value={value} onInput={(e) => onInput(e.currentTarget.value)} />;
    }
  })();
  return (
    <div class="field" data-field={f.name}>
      <label for={id}>
        <span>
          {f.name} {f.required ? <span class="subtle">(required)</span> : <span class="subtle">(optional)</span>}
        </span>
      </label>
      {control}
      <p class="small subtle" id={`${id}-hint`}>
        {typeText(spec)}
        {f.from === "step" && <> · needed by the step {f.step}</>}
      </p>
      {problem && (
        <p class="small tone-bad" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

function TargetInputs({ kind, declaration, shape, values, problems, onInput }: { kind: string; declaration: ActDeclaration; shape: TargetShape; values: Record<string, string>; problems: Readonly<Record<string, string>>; onInput: (name: string, v: string) => void }) {
  const { snap } = useApp();
  // A thread's kind is the kind of the act that opened it (R-DECL-6), which the room gives on the lane. Offer the threads this act may act on.
  const threads = snap.lanes.filter((l) => {
    return l.kind === undefined || !declaration.threads || declaration.threads.includes(l.kind); // G5U:thread-filter
  });
  return (
    <>
      {TARGET_INPUTS[shape].map((t) => {
        const id = `act-target-${t.name}`;
        return (
          <div class="field" key={t.name} data-target={t.name}>
            <label for={id}>
              <span>
                {t.label} {t.optional ? <span class="subtle">(optional)</span> : <span class="subtle">(required)</span>}
              </span>
            </label>
            {t.name === "lane" ? (
              <select class="select" id={id} value={values["lane"] ?? ""} onChange={(e) => onInput("lane", e.currentTarget.value)}>
                <option value="">Choose a thread</option>
                {threads.map((l) => (
                  <option key={l.lane} value={l.lane}>
                    {laneGoal(snap, l.lane)}
                  </option>
                ))}
              </select>
            ) : (
              <input class="input" type="text" id={id} value={values[t.name] ?? ""} onInput={(e) => onInput(t.name, e.currentTarget.value)} />
            )}
            {problems[t.name] && (
              <p class="small tone-bad" role="alert">
                {problems[t.name]}
              </p>
            )}
          </div>
        );
      })}
      {shape !== "none" && TARGET_INPUTS[shape].some((t) => t.name === "lane") && threads.length === 0 && <p class="small muted">No thread here takes “{declaration.label}” ({kind}) yet.</p>}
    </>
  );
}

/**
 * The form for one act. `held` is the declarations the person is looking at:
 * the catalogue they chose the act from, until they accept a new meaning
 * (`onAccept`). Its binding is what gets sent.
 */
function ActForm({ held, kind, onBack, onAccept }: { held: ActsCatalogue; kind: string; onBack: () => void; onAccept: (fresh: ActsCatalogue) => void }) {
  const { adapter } = useApp();
  const act = held.acts[kind]!;
  const d = act.declaration;
  const shapes = targetsOf(d);
  const [shape, setShape] = useState<TargetShape>(shapes[0] ?? "none");
  const [target, setTarget] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<{ target: Readonly<Record<string, string>>; body: Readonly<Record<string, string>> }>({ target: {}, body: {} });
  const [status, setStatus] = useState<Status>({ state: "editing" });
  const fields = fieldsOf(d, shape) ?? [];

  /** Send once, under `under`'s binding. Nothing is sent when a field or the target is wrong. */
  const send = async (under: ActsCatalogue) => {
    const decl = under.acts[kind]!.declaration;
    const t = readTarget(shape, target);
    const b = readBody(fieldsOf(decl, shape) ?? [], values);
    if (!t.ok || !b.ok) {
      setProblems({ target: t.ok ? {} : t.problems, body: b.ok ? {} : b.problems });
      setStatus({ state: "editing" });
      return; // G5U:no-send-on-problems
    }
    setProblems({ target: {}, body: {} });
    await deliver({ under, target: t.target, body: b.body, binding: under.acts[kind]!.binding, key: newIdempotencyKey() }); // G5U:send-binding
  };

  /** Send one intent, exactly as it is. Asking again after a lost answer calls this with the same intent and key. */
  const deliver = async (intent: Intent) => {
    const under = intent.under;
    setStatus({ state: "sending" });
    let r;
    try {
      r = await adapter.act(kind, intent.target, intent.body, intent.binding, intent.key); // G5U:same-intent
    } catch (err) {
      const message = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "The room did not answer.";
      // An error that says the act may have been recorded is a lost answer, not a rejection (R-IDEM-2).
      if (typeof err === "object" && err !== null && (err as { maybeRecorded?: unknown }).maybeRecorded === true) setStatus({ state: "unresolved", intent, message }); // G5U:unresolved
      else setStatus({ state: "failed", message });
      return;
    }
    if (!isRefusal(r)) {
      setStatus({ state: "done", record: r });
      setValues({});
      return;
    }
    if (r.rule === "binding-stale" || r.rule === "kind-undeclared") {
      // The meaning the person read is not the room's any more. Read it again and show it; send nothing.
      const fresh = await adapter.readCatalogue();
      const now = fresh?.vocabulary === "declared" && Object.hasOwn(fresh.acts, kind) ? fresh.acts[kind]! : null;
      if (r.rule === "kind-undeclared" || !fresh || fresh.vocabulary !== "declared" || !now) {
        setStatus({ state: "gone" }); // G5U:gone
        return;
      }
      setStatus({ state: "stale", fresh, changes: declarationChanges(under.acts[kind]!.declaration, now.declaration) }); // G5U:stale-no-resend
      return;
    }
    setStatus({ state: "refused", refusal: r });
  };

  /** The person accepts the new meaning: the form now shows it, and sends under it. */
  const confirm = (fresh: ActsCatalogue) => {
    onAccept(fresh);
    if (!targetsOf(fresh.acts[kind]!.declaration).includes(shape)) {
      setShape(targetsOf(fresh.acts[kind]!.declaration)[0] ?? "none");
      setStatus({ state: "editing" });
      return;
    }
    void send(fresh); // G5U:confirm-resend
  };

  if (status.state === "gone") {
    return (
      <div class="card pad stack" data-act-form={kind}>
        <div class="notice warn" role="alert">
          <div class="notice-title">
            <Icon name="alert" /> This room no longer has the act “{d.label}”
          </div>
          <p>Nothing was recorded. The room's policy changed while you were filling this in, and it does not declare “{d.label}” ({kind}) now.</p>
        </div>
        <div>
          <button class="btn" type="button" onClick={onBack}>
            See the room's acts
          </button>
        </div>
      </div>
    );
  }

  const fresh = status.state === "stale" ? status.fresh.acts[kind]!.declaration : null;
  return (
    <form
      class="card pad stack"
      data-act-form={kind}
      onSubmit={(e) => {
        e.preventDefault();
        // While an answer is unresolved, the form sends no new act: only the same one can be asked again.
        if (status.state !== "sending" && status.state !== "stale" && status.state !== "unresolved") void send(held); // G5U:unresolved-no-new
      }}
    >
      <div class="stack-sm">
        <h3>
          {d.label} <code class="subtle">{kind}</code>
        </h3>
        {d.help && <p class="muted">{d.help}</p>}
        <p class="small muted">{whoText(d)}</p>
      </div>

      {shapes.length > 1 && (
        <div class="field">
          <label for="act-shape">
            <span>What it acts on</span>
          </label>
          <select class="select" id="act-shape" value={shape} onChange={(e) => setShape(e.currentTarget.value as TargetShape)}>
            {shapes.map((s) => (
              <option key={s} value={s}>
                {SHAPE_TEXT[s]}
              </option>
            ))}
          </select>
        </div>
      )}
      {shapes.length === 1 && shape !== "none" && <p class="small muted">Acts on: {SHAPE_TEXT[shape].toLowerCase()}.</p>}

      <TargetInputs kind={kind} declaration={d} shape={shape} values={target} problems={problems.target} onInput={(name, v) => setTarget({ ...target, [name]: v })} />
      {fields.map((f) => (
        <FieldInput key={f.name} f={f} value={own(values, f.name) ?? ""} problem={own(problems.body, f.name)} onInput={(v) => setValues({ ...values, [f.name]: v })} />
      ))}

      {status.state === "stale" && fresh && (
        <div class="notice warn stack-sm" role="alert" data-stale={kind}>
          <div class="notice-title">
            <Icon name="alert" /> “{d.label}” means something different now
          </div>
          <p>Nothing was recorded. The room's policy changed after you opened this form, so what you were about to do is not what the room would record.</p>
          {status.changes.length ? (
            <ul class="small stack-sm" data-changes>
              {status.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p class="small">The act's own fields and steps read the same. The room's steps version or lane mode changed, which changes what the act does.</p>
          )}
          <p class="small">Check that the new meaning is still what you intend. Nothing is sent until you say so.</p>
          <div class="row">
            <button class="btn primary" type="button" onClick={() => confirm(status.fresh)}>
              Send it with the new meaning
            </button>
            <button class="btn" type="button" onClick={onBack}>
              Do not send
            </button>
          </div>
        </div>
      )}
      {status.state === "unresolved" && (
        <div class="notice warn stack-sm" role="alert" data-unresolved={kind}>
          <div class="notice-title">
            <Icon name="alert" /> The room's answer did not arrive
          </div>
          <p>“{d.label}” may have been recorded, or it may not: {status.message}</p>
          <p class="small">
            Asking again sends exactly the same act, with the same idempotency key (<code>{status.intent.key}</code>). If the room recorded it the first time, it answers with that record and records nothing new.
          </p>
          <div class="row">
            <button class="btn primary" type="button" onClick={() => void deliver(status.intent)}>
              Ask again, the same act
            </button>
            <button class="btn" type="button" onClick={onBack}>
              Leave it
            </button>
          </div>
        </div>
      )}
      {status.state === "refused" && <RefusalNotice refusal={status.refusal} />}
      {status.state === "failed" && (
        <div class="notice warn" role="alert">
          <p>The room did not take the act: {status.message}</p>
        </div>
      )}
      {status.state === "done" && (
        <div class="notice ok" role="status" data-recorded={status.record.id}>
          <div class="notice-title">
            <Icon name="check" /> Recorded as entry {status.record.seq}
          </div>
          <div>
            <WhyLink act={status.record.id}>Why it was accepted</WhyLink>
          </div>
        </div>
      )}

      {status.state !== "stale" && status.state !== "unresolved" && (
        <div class="row">
          <button class="btn primary" type="submit" disabled={status.state === "sending"}>
            {status.state === "sending" ? "Sending…" : `Send “${d.label}”`}
          </button>
          <button class="btn quiet" type="button" onClick={onBack}>
            Back to the room's acts
          </button>
        </div>
      )}
    </form>
  );
}

export function ActsScreen({ kind }: { kind?: string }) {
  const { snap } = useApp();
  const catalogue = snap.catalogue;
  // The catalogue the person chose the act from stays the form's until they accept another:
  // a refresh of the snapshot behind an open form changes nothing in it.
  const opened = useRef<{ kind: string; catalogue: ActsCatalogue } | null>(null);
  const [, redraw] = useState(0);
  if (!kind) opened.current = null;
  else if (opened.current?.kind !== kind) opened.current = catalogue?.vocabulary === "declared" && Object.hasOwn(catalogue.acts, kind) ? { kind, catalogue } : null; // G5U:form-holds-catalogue

  const back = () => {
    opened.current = null;
    location.hash = href.acts();
  };

  if (catalogue === null) {
    return (
      <div class="stack">
        <div class="section-head">
          <h1>Acts</h1>
        </div>
        <p class="muted" data-acts="unavailable">
          This connection cannot read the room's acts.
        </p>
      </div>
    );
  }
  if (catalogue.vocabulary !== "declared") {
    return (
      <div class="stack">
        <div class="section-head">
          <h1>Acts</h1>
        </div>
        <div class="card pad stack-sm" data-acts="legacy">
          <p>This room uses the built-in review acts: claim, propose, note, review, check, land and release.</p>
          <p class="muted">Its policy declares no acts of its own. When a policy that does is landed, they are listed here.</p>
        </div>
      </div>
    );
  }

  const chosen = opened.current;
  const entries = Object.entries(catalogue.acts);
  return (
    <div class="stack">
      <div class="section-head">
        <h1>Acts</h1>
        <p>
          What this room's policy lets people do, in its own words. Policy version <code>{catalogue.policy}</code>, since entry {catalogue.since}.
        </p>
      </div>
      {kind && !chosen && (
        <p class="muted" data-acts="no-such-act">
          This room's policy does not declare an act called <code>{kind}</code>.
        </p>
      )}
      {chosen ? (
        <ActForm
          key={chosen.kind}
          held={chosen.catalogue}
          kind={chosen.kind}
          onBack={back}
          onAccept={(fresh) => {
            opened.current = { kind: chosen.kind, catalogue: fresh };
            redraw((n) => n + 1);
          }}
        />
      ) : (
        <ul class="stack" data-acts="declared" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {entries.map(([k, a]) => (
            <li class="card pad stack-sm" key={k} data-act={k}>
              <div class="row">
                <strong>{a.declaration.label}</strong>
                <code class="subtle">{k}</code>
                {targetsOf(a.declaration).map((s) => (
                  <Badge key={s} tone="outline">
                    {SHAPE_TAG[s]}
                  </Badge>
                ))}
              </div>
              {a.declaration.help && <p class="muted">{a.declaration.help}</p>}
              <p class="small muted">{whoText(a.declaration)}</p>
              <div>
                <button
                  class="btn"
                  type="button"
                  data-nav="item"
                  onClick={() => {
                    location.hash = href.acts(k);
                  }}
                >
                  Prepare “{a.declaration.label}”
                </button>
              </div>
            </li>
          ))}
          {entries.length === 0 && <li class="muted">This policy declares no acts.</li>}
        </ul>
      )}
    </div>
  );
}
