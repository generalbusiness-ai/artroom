/**
 * Screen 2: the room, live. Claims and their overlaps (before any code),
 * lanes, landing operations (prepared in parallel, published one at a time),
 * and how far the log has been published.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import type { FeedEntry } from "../room/adapter.ts";
import type { Lane, LandOp } from "../room/contract.ts";
import { Actor, Badge, Glob, LandBadge, RefusalNotice, Sha, When, WhyLink } from "../ui/bits.tsx";
import { useApp } from "../ui/context.ts";
import { clock, laneGoal, latest, onlyCheckpointWaits, plural, relative, unpublished } from "../ui/format.ts";
import { LandingDetail, landingFacts } from "../ui/landing.tsx";
import { Icon } from "../ui/icons.tsx";
import { href } from "../ui/router.ts";

const landed = (l: Lane) => l.generations.some((g) => g.landed);

function SlotCell() {
  const { snap } = useApp();
  const slot = snap.slot;
  if (slot === null)
    return (
      <div class="status-cell" data-slot="unavailable">
        <span class="label">Publication slot</span>
        <span class="value">
          <Badge tone="outline">Unavailable</Badge>
        </span>
        <span class="cell-note">This connection cannot read the slot, and no loaded landing holds it. It may be free or held.</span>
      </div>
    );
  if (slot.state === "free")
    return (
      <div class="status-cell" data-slot="free">
        <span class="label">Publication slot</span>
        <span class="value">
          <Badge tone="ok">Free</Badge>
        </span>
        <span class="cell-note">One publication at a time. The last was publication {slot.last}.</span>
      </div>
    );
  const op = snap.landOps.find((o) => o.id === slot.op);
  const f = op ? landingFacts(snap, op) : null;
  const badge =
    op?.state === "unresolved" ? (
      op.abort ? (
        <Badge tone="bad" icon="alert">Held: abort attempt</Badge>
      ) : op.readBack.main === "unexpected" ? (
        <Badge tone="bad" icon="alert">Held: another writer</Badge>
      ) : (
        <Badge tone="warn" icon="cloudOff">Held: unresolved</Badge>
      )
    ) : (
      <Badge tone="accent" icon="upload">Held: publishing</Badge>
    );
  return (
    <div class="status-cell" data-slot="held">
      <span class="label">Publication slot</span>
      <span class="value">{badge}</span>
      <span class="cell-note">
        Publication {slot.publication}, “{laneGoal(snap, op?.lane)}”, reserved at entry {slot.reservedAt}. {f?.summary}
      </span>
    </div>
  );
}

function StatusLine() {
  const { snap } = useApp();
  const lag = unpublished(snap);
  const lastLanded = snap.landOps.filter((o) => o.state === "landed").at(-1);
  return (
    <section class="card status-line" aria-label="Room status">
      <div class="status-cell">
        <span class="label">Main</span>
        <span class="value">
          <Sha sha={snap.main.head} label="main" />
        </span>
        <span class="cell-note">
          {snap.main.head === null
            ? "This connection cannot read main."
            : lastLanded
              ? <>Last moved by “{laneGoal(snap, lastLanded.lane)}”{snap.main.movedAt && <>, {relative(snap.main.movedAt, snap.now)}</>}</>
              : "Nothing has landed in this session."}
        </span>
      </div>
      <SlotCell />
      <div class="status-cell">
        <span class="label">Log</span>
        <span class="value">
          {lag === 0 ? <Badge tone="ok" icon="check">All published</Badge> : <Badge tone="outline">{plural(lag, "entry", "entries")} not yet published</Badge>}
        </span>
        <span class="cell-note">
          Published to <code>refs/artroom/log</code> through entry {snap.log.publishedThrough} of {snap.log.head}. Anyone can verify that part offline.
          {onlyCheckpointWaits(snap) && " The one waiting is the checkpoint that records this publication; it goes out with the next batch."}
        </span>
      </div>
    </section>
  );
}

function LaneCard({ lane }: { lane: Lane }) {
  const { snap } = useApp();
  const p = latest(snap, lane.lane);
  const op = lane.landing ? snap.landOps.find((o) => o.id === lane.landing) : undefined;
  const isLanded = landed(lane);
  const hits = new Set(lane.overlaps.map((o) => o.mine));
  const met = p ? p.obligations.filter((o) => o.state === "met").length : 0;
  const expiresSoon = lane.state === "held" && Date.parse(lane.lease.expiresAt) - Date.parse(snap.now) <= 5 * 60_000;
  const holderBefore = lane.state === "unheld" ? snap.feed.filter((f) => f.lane === lane.lane && f.kind === "lease-expired").at(-1) : undefined;
  const handover = lane.state === "unheld" && lane.handover ? snap.feed.find((f) => f.id === lane.handover) : undefined;
  return (
    <li class={`card lane${lane.state === "unheld" && !isLanded ? " unheld" : ""}${isLanded ? " landed" : ""}`} data-lane={lane.goal}>
      <div class="lane-top">
        <div class="grow stack-sm">
          <a class="lane-goal" href={href.proposal(lane.lane)} data-nav="item">
            {lane.goal}
          </a>
          <div class="lane-meta">
            {lane.state === "held" ? (
              <>
                <span class="row" style={{ gap: "6px" }}>
                  Held by <Actor handle={lane.lease.holder} />
                </span>
                {!isLanded && (
                  <span class={expiresSoon ? "tone-warn" : ""}>
                    <Icon name="clock" size={13} /> Lease ends {clock(lane.lease.expiresAt)} ({relative(lane.lease.expiresAt, snap.now)})
                  </span>
                )}
              </>
            ) : (
              <span>{isLanded ? "Released after landing" : "Nobody holds this lane"}</span>
            )}
            <span>{lane.generation ? `Generation ${lane.generation}` : "No code yet: claim only"}</span>
            {p && !isLanded && <span>{plural(met, "obligation")} met of {p.obligations.length}</span>}
          </div>
        </div>
        <div class="row" style={{ justifyContent: "flex-end" }}>
          {isLanded && <Badge tone="ok" icon="check">Landed</Badge>}
          {!isLanded && p?.preview.state === "conflict" && <Badge tone="bad" icon="merge">Conflicts with main</Badge>}
          {!isLanded && p?.preview.state === "clean" && !op && <Badge tone="outline">Merges cleanly</Badge>}
          {op && !isLanded && <LandBadge op={op} />}
          {lane.state === "unheld" && !isLanded && <Badge tone="warn" icon="unlock">Unheld</Badge>}
        </div>
      </div>
      {!isLanded && (
        <div class="row" aria-label="Claimed scope">
          {lane.scope.map((g) => (
            <Glob key={g} glob={g} hit={hits.has(g)} />
          ))}
        </div>
      )}
      {lane.overlaps.map((o) => (
        <p class="overlap" key={`${o.lane}${o.mine}${o.theirs}`}>
          <Icon name="alert" size={15} />
          <span>
            Overlaps “{laneGoal(snap, o.lane)}”{o.holder && <> ({o.holder})</>}: <code>{o.mine}</code> and <code>{o.theirs}</code>
            {o.certain ? " certainly meet." : " may meet."}{" "}
            <span class="muted">{lane.generation === 0 ? "Seen from the claims, before any code exists." : "Shown since the claims were made."}</span>
          </span>
        </p>
      ))}
      {lane.state === "unheld" && !isLanded && (
        <p class="small muted">
          {lane.why === "expired" && holderBefore ? <>{holderBefore.text} </> : null}
          {handover ? <>Handover note: {handover.text}</> : null}
          Everything recorded stays: the claim, each generation, the notes and the verdicts.
        </p>
      )}
    </li>
  );
}

function OpCard({ op }: { op: LandOp }) {
  const { snap } = useApp();
  return (
    <div class={`op ${op.state}`} data-op={op.state}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <a class="op-title" href={href.proposal(op.lane, op.generation)}>
          {laneGoal(snap, op.lane)}
        </a>
        <LandBadge op={op} />
      </div>
      <p class="small muted">
        Generation {op.generation}
        {"publication" in op && <> · publication {op.publication}</>}
      </p>
      <LandingDetail op={op} />
    </div>
  );
}

function Landing() {
  const { snap } = useApp();
  const preparing = snap.landOps.filter((o) => o.state === "accepted" || o.state === "preparing" || o.state === "ready");
  const holding = snap.landOps.filter((o) => o.state === "publishing" || o.state === "unresolved");
  const done = snap.landOps.filter((o) => o.state === "landed" || o.state === "aborted" || o.state === "failed" || o.state === "retryable").slice().reverse();
  return (
    <section class="section" aria-labelledby="landing-h">
      <div class="section-head">
        <h2 id="landing-h">Landing</h2>
        <p>What lands is what was checked.</p>
      </div>
      <div class="pipeline">
        <div class="card stage">
          <div class="stage-head">
            <h3>Preparing</h3>
            <span class="stage-rule">in parallel</span>
          </div>
          {preparing.length ? preparing.map((o) => <OpCard key={o.id} op={o} />) : <p class="slot-empty">Nothing is preparing.</p>}
        </div>
        <div class="card stage">
          <div class="stage-head">
            <h3>Publication slot</h3>
            <span class="stage-rule">one at a time</span>
          </div>
          {holding.length ? holding.map((o) => <OpCard key={o.id} op={o} />) : <p class="slot-empty">Free</p>}
        </div>
        <div class="card stage">
          <div class="stage-head">
            <h3>Finished</h3>
          </div>
          {done.length ? done.map((o) => <OpCard key={o.id} op={o} />) : <p class="slot-empty">Nothing yet.</p>}
        </div>
      </div>
    </section>
  );
}

function FeedItem({ e, fresh }: { e: FeedEntry; fresh: boolean }) {
  const { snap } = useApp();
  const afterOp = e.after ? snap.landOps.find((o) => o.id === e.after) : undefined;
  return (
    <li class={`feed-item${fresh ? " new" : ""}`}>
      <span class="feed-seq" aria-label={`Entry ${e.seq}`}>
        {e.seq}
      </span>
      <div class="stack-sm">
        <p class="feed-text">{e.text}</p>
        {e.refusal && <RefusalNotice refusal={e.refusal} />}
        {afterOp && (
          <p class="small tone-warn">
            Recorded after the landing of “{laneGoal(snap, afterOp.lane)}” was reserved{"publication" in afterOp ? ` (publication ${afterOp.publication})` : ""}. Acts after a reservation cannot cancel it; only a
            compromised-key revocation starts an abort attempt.
          </p>
        )}
        <p class="feed-meta">
          <When at={e.at} />
          {e.type !== "act" && <span>· {e.type === "system" ? "recorded by the room" : "refused"}</span>}
          {snap.policy && (e.type !== "system" || e.kind === "lease-expired") && <WhyLink act={e.id} />}
        </p>
      </div>
    </li>
  );
}

function Activity() {
  const { snap } = useApp();
  const [all, setAll] = useState(false);
  const seen = useRef(snap.log.head);
  const prev = seen.current;
  useEffect(() => {
    seen.current = snap.log.head;
  }, [snap.log.head]);
  const entries = snap.feed.slice().reverse();
  const shown = all ? entries : entries.slice(0, 10);
  const unpublished = shown.filter((e) => e.seq > snap.log.publishedThrough);
  const published = shown.filter((e) => e.seq <= snap.log.publishedThrough);
  return (
    <section aria-labelledby="activity-h" aria-live="polite">
      <div class="section-head">
        <h2 id="activity-h">Activity</h2>
        <p>Newest first</p>
      </div>
      <div class="card pad">
        {(snap.coverage.feed.from > 0 || !snap.coverage.feed.complete) && (
          <p class="small muted" data-partial="feed">
            {snap.coverage.feed.from > 0 && <>Entries before {snap.coverage.feed.from} are not loaded. </>}
            {!snap.coverage.feed.complete && <>Not every entry up to {snap.log.head} was loaded.</>}
          </p>
        )}
        <ol class="feed">
          {unpublished.map((e) => (
            <FeedItem key={e.id} e={e} fresh={e.seq > prev} />
          ))}
        </ol>
        <p class="pub-line">Published through entry {snap.log.publishedThrough}</p>
        <ol class="feed">
          {published.map((e) => (
            <FeedItem key={e.id} e={e} fresh={e.seq > prev} />
          ))}
        </ol>
        {entries.length > 10 && (
          <button class="btn quiet small" type="button" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${entries.length} entries`}
          </button>
        )}
      </div>
    </section>
  );
}

export function RoomScreen() {
  const { snap } = useApp();
  const active = snap.lanes.filter((l) => !landed(l));
  const done = snap.lanes.filter(landed);
  const agents = snap.people.filter((p) => p.kind === "agent").length;
  const people = snap.people.filter((p) => p.kind === "person").length;
  return (
    <>
      <header class="page-head">
        <h1>Room</h1>
        <p>
          {plural(people, "person", "people")} and {plural(agents, "agent")} work in <code>{snap.room.name}</code>. Each lane starts with a claim: a goal and the paths it will touch. Overlaps show before
          any code is written.
        </p>
      </header>
      <StatusLine />
      <div class="two-col section">
        <div>
          <section aria-labelledby="lanes-h">
            <div class="section-head">
              <h2 id="lanes-h">Lanes</h2>
              <p>{plural(active.length, "open lane")}</p>
            </div>
            {!snap.coverage.lanes && (
              <p class="notice warn small" data-partial="lanes">
                Showing the first {plural(snap.lanes.length, "lane")}. The room has more than this connection loaded.
              </p>
            )}
            {active.length ? (
              <ol class="lanes">
                {active.map((l) => (
                  <LaneCard key={l.lane} lane={l} />
                ))}
              </ol>
            ) : (
              <div class="card pad muted">
                {snap.coverage.lanes ? "No lanes yet. An agent or a person opens one with a claim." : "No open lanes were loaded."}
              </div>
            )}
          </section>
          {snap.landOps.length > 0 && <Landing />}
          {done.length > 0 && (
            <section class="section" aria-labelledby="landed-h">
              <div class="section-head">
                <h2 id="landed-h">Landed</h2>
              </div>
              <ol class="lanes">
                {done.map((l) => (
                  <LaneCard key={l.lane} lane={l} />
                ))}
              </ol>
            </section>
          )}
        </div>
        <Activity />
      </div>
    </>
  );
}
