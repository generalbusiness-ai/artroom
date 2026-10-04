/**
 * Screen 3: one proposal generation. The diff with notes anchored to path,
 * line and head; obligations as a checklist; each piece of evidence marked
 * "reviewed here" or "carried, because …", and what did not carry; the
 * "why" links.
 */

import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FileDiff, RoomSnapshot } from "../room/adapter.ts";
import type { ActId, Evidence, Lane, NotCarried, Note, Obligation, Proposal, Refusal, Review } from "../room/contract.ts";
import { isCarried, isRefusal } from "../room/contract.ts";
import { carriedBy, isAdvisory, judgmentsFor } from "../room/checks.ts";
import { Actor, Badge, Glob, LandBadge, RefusalNotice, Sha, When, WhyLink } from "../ui/bits.tsx";
import { useApp } from "../ui/context.ts";
import { clock, join, plural, relative, ruleTitle, short } from "../ui/format.ts";
import { Icon } from "../ui/icons.tsx";
import { ChangeHistoryView } from "../ui/ChangeHistory.tsx";
import { LandingDetail } from "../ui/landing.tsx";
import { href } from "../ui/router.ts";

const splitGlobs = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

// ------------------------------------------------------------- evidence

function reviewOf(snap: RoomSnapshot, act: ActId): Review | undefined {
  return snap.reviews.find((r) => r.id === act);
}

function EvidenceRow({ ev, current, o }: { ev: Evidence; current: Proposal; o: Obligation }) {
  const { snap } = useApp();
  const review = reviewOf(snap, ev.act);
  const check = snap.checks.find((c) => c.id === ev.act);
  const who = review?.by.member ?? check?.by.member ?? null;
  const source = isCarried(ev) ? ev.from : { generation: ev.generation, head: ev.head };
  const what = review ? (review.verdict === "approve" ? "approved" : "objected to") : check ? `ran ${check.check}: ${check.ok ? "passed" : "failed"}` : "recorded";
  // A check carries only by its sealed check-carried event (R-CARRY-13); the reason shown is that event's.
  const event = isCarried(ev) && ev.kind === "check" ? carriedBy(snap, current, o, ev.act) : undefined;
  return (
    <li class={`ev${isCarried(ev) ? " carried" : ""}`} data-basis={ev.basis}>
      <div class="row">
        {isCarried(ev) ? (
          <Badge tone="carried" icon="carry">
            Carried from generation {ev.from.generation}
          </Badge>
        ) : (
          <Badge tone="ok" icon="check">
            Reviewed here
          </Badge>
        )}
        <span class="small">
          <Actor handle={who} plain /> {what} generation {source.generation} at <Sha sha={source.head} />
        </span>
      </div>
      {isCarried(ev) && ev.kind === "check" && (
        <p class="because" data-carry-reason>
          {event?.event.outcome.carried ? (
            <>
              Carried to generation {current.generation} by entry {event.seq}: {event.event.outcome.reason.text}.
            </>
          ) : (
            <>No check-carried event for this carry, on this generation's integration and under this policy, is loaded here, so its reason is not shown.</>
          )}
        </p>
      )}
      {isCarried(ev) && ev.kind === "review" && (
        <>
          <p class="because">Carried to generation {current.generation}: {ev.reason.text}.</p>
          {ev.reason.code === "paths-unchanged" && (
            <details>
              <summary class="disclosure">
                <Icon name="chevron" class="chev" />
                What was tested
              </summary>
              <dl class="kv tested" style={{ marginTop: "6px" }}>
                <dt>Changed since</dt>
                <dd>{ev.reason.changed.length ? ev.reason.changed.join(", ") : "nothing"}</dd>
                <dt>Reviewed scope</dt>
                <dd>{ev.reason.tested.scope.join(", ") || "none"}, no match</dd>
                <dt>Depends on</dt>
                <dd>{ev.reason.tested.dependsOn.join(", ") || "nothing declared"}{ev.reason.tested.dependsOn.length ? ", no match" : ""}</dd>
                <dt>Global inputs</dt>
                <dd>{plural(ev.reason.tested.globalInputs.length, "pattern")}, no match</dd>
                <dt>Policy</dt>
                <dd>{ev.reason.policy === "same" ? "the same version" : "a newer version that still accepts it"}</dd>
              </dl>
            </details>
          )}
        </>
      )}
      {review?.text && <p class="ev-quote">{review.text}</p>}
      {review && (review.scope.length > 0 || review.dependsOn.length > 0) && (
        <p class="tested">
          Reviewed {review.scope.join(", ")}
          {review.dependsOn.length > 0 && <> · depends on {review.dependsOn.join(", ")}</>}
        </p>
      )}
      {check && <p class="tested">{check.detail} · integration <Sha sha={check.integration} /></p>}
      {check && !check.ok && isAdvisory(o) && <p class="tested">Advisory: this failure does not block a landing.</p>}
      <div>
        <WhyLink act={ev.act} />
      </div>
    </li>
  );
}

function StaleRow({ n }: { n: NotCarried }) {
  const { snap } = useApp();
  const review = reviewOf(snap, n.act);
  const check = snap.checks.find((c) => c.id === n.act);
  const who = review?.by.member ?? check?.by.member ?? null;
  const gen = review?.generation ?? check?.generation;
  const head = review?.head ?? snap.proposals.find((p) => p.lane === check?.lane && p.generation === gen)?.head;
  return (
    <li class="ev stale" data-basis="stale">
      <div class="row">
        <Badge tone="warn" icon="refresh">
          {review ? "Stale" : "Runs again"}
        </Badge>
        <span class="small">
          <Actor handle={who} plain /> {review ? (review.verdict === "approve" ? "approved" : "objected to") : "checked"} generation {gen} at <Sha sha={head} />
        </span>
      </div>
      <p class="stale-text">Did not carry: {n.text}</p>
      <p class="tested">Kept as history. It counts only for generation {gen}.</p>
      <div>
        <WhyLink act={n.act} />
      </div>
    </li>
  );
}

/** Each sealed check-carried event for this obligation: carried with its reason, or not carried with why (R-CARRY-13). */
function CarryJudgments({ o, p }: { o: Obligation; p: Proposal }) {
  const { snap } = useApp();
  const judged = judgmentsFor(snap, p.lane, p.generation, o.id);
  if (!judged.length) return null;
  return (
    <div class="stack-sm" aria-label="Carry judgments">
      <h4 class="small">Carry judgments recorded by the room</h4>
      <ul class="evidence">
        {judged.map(({ id, seq, event }) => (
          <li key={id} class={`ev ${event.outcome.carried ? "carried" : "stale"}`} data-carry={event.outcome.carried ? "carried" : "not-carried"}>
            <div class="row">
              {event.outcome.carried ? (
                <Badge tone="carried" icon="carry">
                  Carried
                </Badge>
              ) : (
                <Badge tone="warn" icon="refresh">
                  Not carried
                </Badge>
              )}
              <span class="small">
                The check in entry {event.act.split("_")[1]}, to integration <Sha sha={event.integration} />
              </span>
            </div>
            {event.outcome.carried ? (
              <p class="because" data-carry-reason>
                It counts there: {event.outcome.reason.text}.
              </p>
            ) : (
              <p class="stale-text">Did not carry: {event.outcome.notCarried.text}</p>
            )}
            <p class="tested">
              Recorded at entry {seq}
              {event.policy === o.policy ? "." : ", under another policy version, so it does not count under this one."}
            </p>
            <div>
              <WhyLink act={id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ObligationCard({ o, p, stale }: { o: Obligation; p: Proposal; stale: readonly NotCarried[] }) {
  const { snap } = useApp();
  const met = o.state === "met";
  const advisory = isAdvisory(o);
  const need =
    o.kind === "review" ? (
      <>
        Needs {o.count === 1 ? "an approval" : `${o.count} approvals`} from {join(o.from as string[])} for {join(o.paths as string[])}.
      </>
    ) : (
      <>
        {advisory ? "Asks for" : "Needs"} the <code>{o.check}</code> check from {join(o.by as string[])}.{advisory && " Advisory: it never blocks a landing."}
      </>
    );
  return (
    <li class={`card obl${advisory ? " advisory" : ""}`} data-obligation={o.rule} data-state={o.state} data-advisory={advisory ? "true" : "false"}>
      <div class="obl-head">
        <span class={`check-circle${met ? " met" : ""}`} aria-hidden="true">
          <Icon name="check" size={13} />
        </span>
        <div class="grow stack-sm">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <h3>{ruleTitle(snap, o.rule)}</h3>
            <span class="row" style={{ gap: "6px" }}>
              {advisory && <Badge tone="outline">Advisory</Badge>}
              {met ? <Badge tone="ok">Met</Badge> : o.state === "open" && o.reopened ? <Badge tone="warn">Reopened</Badge> : <Badge tone="outline">Open</Badge>}
            </span>
          </div>
          <p class="small muted">{need}</p>
        </div>
      </div>
      {o.state === "open" && o.reopened?.because === "not-carried" && (
        <p class="item-detail">
          {stale.length > 0 ? "Reopened: an earlier approval did not carry. See below." : <>Reopened because an earlier verdict did not carry: {o.reopened.detail.text}</>}
        </p>
      )}
      {(o.evidence.length > 0 || stale.length > 0) && (
        <ul class="evidence">
          {o.evidence.map((ev) => (
            <EvidenceRow key={ev.act} ev={ev} current={p} o={o} />
          ))}
          {stale.map((n) => (
            <StaleRow key={n.act} n={n} />
          ))}
        </ul>
      )}
      {o.kind === "check" && <CarryJudgments o={o} p={p} />}
    </li>
  );
}

/** Which obligation an evidence item that did not carry belonged to, on the generation before. */
function staleFor(snap: RoomSnapshot, p: Proposal, o: Obligation): NotCarried[] {
  const prev = snap.proposals.find((x) => x.lane === p.lane && x.generation === p.generation - 1);
  const before = prev?.obligations.find((x) => x.id === o.id);
  return p.notCarried.filter((n) => before?.evidence.some((e) => e.act === n.act) ?? false);
}

// ------------------------------------------------------------- notes

function Thread({ root, replies, lane, label }: { root: Note; replies: Note[]; lane: Lane; label?: string }) {
  const { adapter } = useApp();
  const [text, setText] = useState("");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const anchor = root.anchor;
  return (
    <div class="thread" data-thread={root.id}>
      {[root, ...replies].map((n) => (
        <div class="note" key={n.id}>
          <div class="note-meta">
            <Actor handle={n.by.member} />
            <When at={n.at} />
            {n === root && label && <Badge tone="outline">{label}</Badge>}
            {n.flags.includes("after-reservation") && <Badge tone="warn">After reservation</Badge>}
          </div>
          <p>{n.text}</p>
        </div>
      ))}
      <form
        class="note-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await adapter.note(anchor, text, root.id);
          if (isRefusal(r)) setRefusal(r);
          else {
            setRefusal(null);
            setText("");
          }
        }}
      >
        <label class="visually-hidden" for={`reply-${root.id}`}>
          Reply in {lane.goal}
        </label>
        <textarea id={`reply-${root.id}`} class="textarea" style={{ minHeight: "40px" }} rows={1} placeholder="Reply" value={text} onInput={(e) => setText(e.currentTarget.value)} />
        {refusal && <RefusalNotice refusal={refusal} title="The reply was refused" />}
        <div>
          <button class="btn small" type="submit" disabled={!text.trim()}>
            Reply
          </button>
        </div>
      </form>
    </div>
  );
}

function NewNote({ p, path, line, onDone }: { p: Proposal; path: string; line: number; onDone: () => void }) {
  const { adapter } = useApp();
  const [text, setText] = useState("");
  const [at, setAt] = useState(line);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      class="note-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await adapter.note({ lane: p.lane, generation: p.generation, head: p.head, path, line: at }, text);
        if (isRefusal(r)) setRefusal(r);
        else onDone();
      }}
    >
      <div class="row">
        <label class="field" style={{ width: "110px" }}>
          <span>Line</span>
          <input class="input" type="number" min={1} value={at} onInput={(e) => setAt(Number(e.currentTarget.value) || 1)} />
        </label>
        <p class="hint grow">
          Anchored to <code>{path}</code> at head <Sha sha={p.head} />. It stays with this head.
        </p>
      </div>
      <label class="field">
        <span>Note</span>
        <textarea ref={ref} class="textarea" rows={3} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      </label>
      {refusal && <RefusalNotice refusal={refusal} title="The note was refused" />}
      <div class="row">
        <button class="btn primary small" type="submit" disabled={!text.trim()}>
          Add note
        </button>
        <button class="btn quiet small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------- diff

type Relation = "here" | "unchanged" | "changed" | "unknown" | "later";

/**
 * How a note's head relates to the head on screen, for one path. "unchanged"
 * needs the interdiff of every generation in between, each without the path.
 */
function relationOf(n: Note, p: Proposal, path: string, changedIn: (g: number) => readonly string[] | null, snap: RoomSnapshot): Relation {
  const a = n.anchor as Extract<Note["anchor"], { path: string }>;
  if (a.head === p.head) return "here";
  if (a.generation >= p.generation) return a.generation === p.generation ? "unknown" : "later";
  for (let g = a.generation + 1; g <= p.generation; g++) {
    if (!snap.proposals.some((x) => x.lane === p.lane && x.generation === g)) return "unknown";
    const changed = changedIn(g);
    if (changed === null) return "unknown";
    if (changed.includes(path)) return "changed";
  }
  return "unchanged";
}

function FileView({ file, p, lane, since, prevGen }: { file: FileDiff; p: Proposal; lane: Lane; since: readonly string[] | null; prevGen: number }) {
  const { snap, adapter } = useApp();
  const [composing, setComposing] = useState<number | null>(null);
  const changedSince = since?.includes(file.path) ?? false;
  const roots = snap.notes.filter((n) => "path" in n.anchor && n.anchor.lane === p.lane && n.anchor.path === file.path && !n.replyTo);
  // A thread stays on the head it was written on. It is shown on this head's
  // lines only when continuity is proven for every generation in between.
  const placed = roots.map((n) => ({ note: n, relation: relationOf(n, p, file.path, (g) => adapter.changedSince({ lane: p.lane, generation: g }), snap) }));
  const visible = placed.filter((x) => x.relation === "here" || x.relation === "unchanged").map((x) => x.note);
  const elsewhere = placed.filter((x) => x.relation !== "here" && x.relation !== "unchanged");
  const repliesOf = (root: Note) => snap.notes.filter((n) => n.replyTo === root.id);
  const firstChanged = file.hunks.flatMap((h) => h.lines).find((l) => l.kind === "add")?.newLine ?? 1;
  return (
    <section class="card file" aria-label={file.path} data-file={file.path}>
      <div class="file-head">
        <Icon name="file" />
        <span class="file-path grow">{file.path}</span>
        <Badge tone="outline">{file.status === "added" ? "Added" : file.status === "deleted" ? "Deleted" : file.status === "renamed" ? "Renamed" : "Modified"}</Badge>
        {changedSince && <Badge tone="accent">Changed since generation {prevGen}</Badge>}
        <button class="btn quiet small" type="button" onClick={() => setComposing(firstChanged)}>
          <Icon name="message" /> Add a note
        </button>
      </div>
      {composing !== null && <NewNote p={p} path={file.path} line={composing} onDone={() => setComposing(null)} />}
      {elsewhere.length > 0 && (
        <section class="stack-sm" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }} aria-label={`Notes on other heads of ${file.path}`}>
          <h3 class="small">Notes written on other heads</h3>
          {elsewhere.map(({ note, relation }) => {
            const a = note.anchor as Extract<Note["anchor"], { path: string }>;
            const why =
              relation === "changed"
                ? "This file changed since that head, so its line numbers may not match these."
                : relation === "later"
                  ? "That head is newer than this one."
                  : "Whether this file changed since that head is not known here, so the note is not placed on these lines.";
            return (
              <div key={note.id} data-relation={relation} class="stack-sm">
                <p class="small muted">
                  On generation {a.generation} (<Sha sha={a.head} />), line {a.line}. {why} <a href={href.proposal(p.lane, a.generation)}>Open generation {a.generation}</a>
                </p>
                <Thread root={note} replies={repliesOf(note)} lane={lane} label={`Generation ${a.generation}, line ${a.line}`} />
              </div>
            );
          })}
        </section>
      )}
      <table class="diff">
        <colgroup>
          <col style={{ width: "46px" }} />
          <col style={{ width: "46px" }} />
          <col />
        </colgroup>
        <tbody>
          {file.hunks.map((h) => (
            <Fragment key={h.header}>
              <tr class="hunk">
                <td colSpan={3}>{h.header}</td>
              </tr>
              {h.lines.map((l, i) => {
                const threads = l.newLine !== undefined ? visible.filter((n) => "path" in n.anchor && n.anchor.line === l.newLine) : [];
                return (
                  <Fragment key={i}>
                    <tr class={l.kind}>
                      <td class="ln">{l.oldLine ?? ""}</td>
                      <td class="ln">
                        {l.newLine !== undefined ? (
                          <button type="button" tabIndex={-1} title={`Add a note on line ${l.newLine}`} onClick={() => setComposing(l.newLine!)}>
                            {l.newLine}
                          </button>
                        ) : (
                          ""
                        )}
                      </td>
                      <td class="code">
                        <span class="mark" aria-hidden="true">
                          {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
                        </span>
                        <span class="visually-hidden">{l.kind === "add" ? "added: " : l.kind === "del" ? "removed: " : ""}</span>
                        {l.text}
                      </td>
                    </tr>
                    {threads.map((root) => (
                      <tr class="thread" key={root.id}>
                        <td colSpan={3}>
                          <Thread
                            root={root}
                            replies={repliesOf(root)}
                            lane={lane}
                            {...("path" in root.anchor && root.anchor.head !== p.head
                              ? { label: `Written on generation ${root.anchor.generation} (${short(root.anchor.head)}). The file is unchanged from that head to this one.` }
                              : {})}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Diff({ p, lane }: { p: Proposal; lane: Lane }) {
  const { adapter } = useApp();
  const [files, setFiles] = useState<readonly FileDiff[] | null | "loading">("loading");
  const [onlySince, setOnlySince] = useState(false);
  useEffect(() => {
    let live = true;
    setFiles("loading");
    void adapter.diff(p).then((f) => live && setFiles(f));
    return () => {
      live = false;
    };
  }, [adapter, p.lane, p.generation]);
  const since = p.generation > 1 ? adapter.changedSince(p) : null;
  if (files === "loading") return <p class="muted">Loading the diff…</p>;
  if (files === null)
    return (
      <div class="card pad stack-sm">
        <p>This room cannot show the diff yet.</p>
        <p class="small muted">
          Changed paths: {p.changed.map((c) => c.path).join(", ")}. Fetch <code>{p.pinnedRef}</code> to read it.
        </p>
      </div>
    );
  const shown = onlySince && since ? files.filter((f) => since.includes(f.path)) : files;
  return (
    <section aria-labelledby="diff-h">
      <div class="section-head">
        <h2 id="diff-h">
          Changes <span class="subtle small">from main {short(p.base)} to {short(p.head)}</span>
        </h2>
        {since && (
          <label class="row small">
            <input type="checkbox" checked={onlySince} onChange={(e) => setOnlySince(e.currentTarget.checked)} />
            Only what changed since generation {p.generation - 1} ({plural(since.length, "file")})
          </label>
        )}
      </div>
      {shown.map((f) => (
        <FileView key={f.path} file={f} p={p} lane={lane} since={since} prevGen={p.generation - 1} />
      ))}
    </section>
  );
}

// ------------------------------------------------------------- review form

function ReviewForm({ p, lane, current, focus }: { p: Proposal; lane: Lane; current: number; focus: boolean }) {
  const { adapter, snap } = useApp();
  const me = snap.people.find((x) => x.handle === snap.viewer);
  const qualifies = (spec: string) => spec === snap.viewer || (me?.teams as readonly string[] | undefined)?.includes(spec) || spec === `role:${me?.role}`;
  const mine = p.obligations.filter((o) => o.kind === "review" && o.from.some((f) => qualifies(f)));
  const needed = [...new Set(p.obligations.flatMap((o) => (o.kind === "review" ? (o.from as string[]) : [])))];
  const [verdict, setVerdict] = useState<"approve" | "object">("approve");
  const [scope, setScope] = useState(() => [...new Set(mine.flatMap((o) => o.paths))].join(", ") || "src/**");
  const [dependsOn, setDependsOn] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Review | Refusal | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) {
      head.current?.scrollIntoView({ block: "start" });
      head.current?.focus();
    }
  }, [focus, p.generation]);
  const author = p.by.member === snap.viewer || (lane.state === "held" && lane.lease.holder === snap.viewer);
  const service = me?.kind === "service";
  if (service) return null;
  return (
    <section class="card pad stack" aria-labelledby="review-h" id="review">
      <h2 id="review-h" ref={head} tabIndex={-1}>
        Your review
      </h2>
      {p.generation !== current && (
        <p class="notice warn">
          This is generation {p.generation}. Generation {current} is current. A review here is kept as history and meets nothing.
        </p>
      )}
      {author ? (
        <p class="hint">You wrote or hold this lane. The room will refuse your review of it.</p>
      ) : !mine.length ? (
        <p class="hint">This generation needs {needed.length ? join(needed) : "no review"}. You are not in that list, so the room will refuse a review from you.</p>
      ) : null}
      <form
        class="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await adapter.review(p, { verdict, scope: splitGlobs(scope), dependsOn: splitGlobs(dependsOn), text });
          setResult(r);
        }}
      >
        <fieldset class="choice" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend class="visually-hidden">Verdict</legend>
          <label>
            <input type="radio" name="verdict" value="approve" checked={verdict === "approve"} onChange={() => setVerdict("approve")} /> Approve
          </label>
          <label>
            <input type="radio" name="verdict" value="object" checked={verdict === "object"} onChange={() => setVerdict("object")} /> Object
          </label>
        </fieldset>
        <label class="field">
          <span>What you reviewed</span>
          <input class="input mono" value={scope} onInput={(e) => setScope(e.currentTarget.value)} />
          <span class="hint">Path patterns. If any of these change in a later generation, your verdict does not carry.</span>
        </label>
        <label class="field">
          <span>What it depends on (optional)</span>
          <input class="input mono" value={dependsOn} placeholder="src/lib/authz/**" onInput={(e) => setDependsOn(e.currentTarget.value)} />
          <span class="hint">Code outside your scope that this relies on. A change there also stops your verdict carrying.</span>
        </label>
        <label class="field">
          <span>Comment</span>
          <textarea class="textarea" rows={3} value={text} onInput={(e) => setText(e.currentTarget.value)} />
        </label>
        <div class="row">
          <button class="btn primary" type="submit">
            {verdict === "approve" ? "Record approval" : "Record objection"}
          </button>
          <span class="hint">
            Bound to generation {p.generation} at <Sha sha={p.head} />.
          </span>
        </div>
      </form>
      {result &&
        (isRefusal(result) ? (
          <RefusalNotice refusal={result} title="Your review was refused" />
        ) : (
          <div class="notice ok" role="status">
            <div class="notice-title">
              <Icon name="check" /> Recorded as entry {result.seq}
            </div>
            <p class="small">
              {result.fulfils.length ? `It meets ${join(result.fulfils.map((f) => ruleTitle(snap, f.obligation.replace(/^obl_/, "")).toLowerCase()))}.` : "It is recorded; it meets no open obligation."}
            </p>
          </div>
        ))}
    </section>
  );
}

// ------------------------------------------------------------- screen

function LaneBox({ lane }: { lane: Lane }) {
  const { snap } = useApp();
  return (
    <section class="card pad stack-sm" aria-label="The claim">
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h2>The claim</h2>
        <WhyLink act={lane.lane} />
      </div>
      {lane.plan && <p class="small">{lane.plan}</p>}
      <div class="row">
        {lane.scope.map((g) => (
          <Glob key={g} glob={g} hit={lane.overlaps.some((o) => o.mine === g)} />
        ))}
      </div>
      <p class="small muted">
        {lane.state === "held" ? (
          <>
            Held by <Actor handle={lane.lease.holder} plain />, lease generation {lane.lease.generation}, ends {clock(lane.lease.expiresAt)} ({relative(lane.lease.expiresAt, snap.now)}).
          </>
        ) : (
          <>Nobody holds this lane ({lane.why}). Any member may take it over.</>
        )}
      </p>
    </section>
  );
}

export function ProposalScreen({ laneId, generation, focus }: { laneId: ActId; generation?: number; focus?: "review" }) {
  const { snap } = useApp();
  const lane = snap.lanes.find((l) => l.lane === laneId);
  if (!lane)
    return (
      <div class="card pad">
        <p>That lane is not in this room{snap.source.kind === "mock" ? " at this point in the scenario" : ""}.</p>
        <a href={href.room()}>Back to the room</a>
      </div>
    );
  const gens = snap.proposals.filter((p) => p.lane === lane.lane);
  const p = (generation ? gens.find((g) => g.generation === generation) : undefined) ?? gens.at(-1);
  const current = gens.at(-1)?.generation ?? 0;
  const op = snap.landOps.filter((o) => o.lane === lane.lane && p && o.generation === p.generation).at(-1);
  const discussion = snap.notes.filter((n) => "act" in n.anchor && snap.feed.find((f) => f.id === (n.anchor as { act: ActId }).act)?.lane === lane.lane);
  const landedGen = lane.generations.find((g) => g.landed);
  // Advisory obligations never block a landing (R-OBL-7), so they are listed apart and not counted.
  const blocking = p ? p.obligations.filter((o) => !isAdvisory(o)) : [];
  const advisory = p ? p.obligations.filter(isAdvisory) : [];

  return (
    <>
      <header class="page-head">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href={href.room()}>Room</a>
          <Icon name="chevron" size={12} />
          <span>Lane</span>
        </nav>
        <h1>{lane.goal}</h1>
        {p ? (
          <div class="row">
            <nav class="gen-switch" aria-label="Generations">
              {gens.map((g) => (
                <a key={g.generation} href={href.proposal(lane.lane, g.generation)} aria-current={g.generation === p.generation ? "page" : undefined}>
                  Generation {g.generation}
                </a>
              ))}
            </nav>
            <span class="small muted">
              {p.generation === current ? "Current generation." : `Earlier generation, kept as history. Generation ${current} is current.`}
            </span>
          </div>
        ) : (
          <p>No code yet. The claim is recorded, and overlaps are already visible.</p>
        )}
      </header>

      {p ? (
        <>
          <section class="card pad stack" aria-label="Proposal">
            <div class="row small muted">
              Proposed by <Actor handle={p.by.member} /> · <When at={p.at} /> · head <Sha sha={p.head} label="head" /> on main <Sha sha={p.base} label="base" />
              <span class="grow" />
              <WhyLink act={p.id}>Why this proposal</WhyLink>
            </div>
            <p class="summary">{p.summary}</p>
            <div class="row">
              {p.preview.state === "clean" && (
                <Badge tone="ok" icon="check">
                  Merges cleanly into main
                </Badge>
              )}
              {p.preview.state === "pending" && <Badge>Checking the merge…</Badge>}
              {p.preview.state === "conflict" && (
                <Badge tone="bad" icon="merge">
                  Conflicts with main on {p.preview.paths.join(", ")}
                </Badge>
              )}
              {landedGen?.generation === p.generation && (
                <Badge tone="ok" icon="check">
                  Landed at entry {landedGen.landed!.at}
                </Badge>
              )}
              {op && !landedGen && <LandBadge op={op} />}
              {p.flags.map((f) => (
                <Badge key={f} tone="warn">
                  {f}
                </Badge>
              ))}
              {(p.because ?? []).map((r, i) =>
                "url" in r ? (
                  <a key={i} class="btn quiet small" href={r.url} rel="noreferrer">
                    <Icon name="link" /> Because: {r.url.replace(/^https:\/\//, "")}
                  </a>
                ) : "act" in r ? (
                  <WhyLink key={i} act={r.act}>
                    Because: entry {r.act.split("_")[1]}
                  </WhyLink>
                ) : (
                  <span key={i} class="small">
                    Because: commit <Sha sha={r.commit} />
                  </span>
                ),
              )}
            </div>
            {op && (
              <div class="notice small" data-landing={op.state}>
                <div class="notice-title">Landing</div>
                <LandingDetail op={op} />
              </div>
            )}
            {p.preview.state === "conflict" && (
              <p class="notice bad small">
                This head cannot land. The holder recuts it on main as a new generation. The room stops asking for reviews of a head it knows conflicts.
              </p>
            )}
          </section>

          <div class="two-col section">
            <div>
              <ChangeHistoryView p={p} />
              <Diff p={p} lane={lane} />
              {discussion.length > 0 && (
                <section class="section" aria-labelledby="disc-h">
                  <div class="section-head">
                    <h2 id="disc-h">Notes on the lane's acts</h2>
                  </div>
                  <div class="stack">
                    {discussion
                      .filter((n) => !n.replyTo)
                      .map((n) => (
                        <Thread key={n.id} root={n} replies={snap.notes.filter((r) => r.replyTo === n.id)} lane={lane} label="On the land act" />
                      ))}
                  </div>
                </section>
              )}
            </div>
            <aside class="stack first-on-narrow" aria-label="Before it can land">
              <section aria-labelledby="obl-h" class="stack">
                <div class="section-head" style={{ marginBottom: 0 }}>
                  <h2 id="obl-h">Before it can land</h2>
                  <p>
                    {blocking.filter((o) => o.state === "met").length} of {blocking.length} met
                  </p>
                </div>
                <ol class="obligations">
                  {blocking.map((o) => (
                    <ObligationCard key={o.id} o={o} p={p} stale={staleFor(snap, p, o)} />
                  ))}
                </ol>
              </section>
              {advisory.length > 0 && (
                <section aria-labelledby="advisory-h" class="stack">
                  <div class="section-head" style={{ marginBottom: 0 }}>
                    <h2 id="advisory-h">Advisory checks</h2>
                    <p>Shown, never blocking</p>
                  </div>
                  <ol class="obligations">
                    {advisory.map((o) => (
                      <ObligationCard key={o.id} o={o} p={p} stale={staleFor(snap, p, o)} />
                    ))}
                  </ol>
                </section>
              )}
              {!landedGen && <ReviewForm p={p} lane={lane} current={current} focus={focus === "review"} />}
              <LaneBox lane={lane} />
            </aside>
          </div>
        </>
      ) : (
        <LaneBox lane={lane} />
      )}
    </>
  );
}
