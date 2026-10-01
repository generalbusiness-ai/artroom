/**
 * The per-change view on the Proposal screen: which jj changes a generation
 * rewrote, added or dropped, with an interdiff for each rewritten one. Shown
 * only when commits carry `change-id` headers; otherwise nothing renders.
 * Labelled as author-supplied, because a header proves nothing and nothing
 * here feeds obligations, evidence or carrying.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import type { ChangeEntry, ChangeHistory, Interdiff } from "../room/adapter.ts";
import type { Proposal } from "../room/contract.ts";
import { Badge, Sha, type Tone } from "./bits.tsx";
import { useApp } from "./context.ts";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";

const KIND: Record<ChangeEntry["kind"], { label: string; tone: Tone }> = {
  rewritten: { label: "Rewritten", tone: "accent" },
  added: { label: "Added", tone: "ok" },
  dropped: { label: "Dropped", tone: "warn" },
  unchanged: { label: "Unchanged", tone: "outline" },
  divergent: { label: "Divergent", tone: "warn" },
};

const BOUND: Record<Extract<Interdiff, { kind: "too-large" }>["bound"], string> = {
  depth: "directory levels",
  entries: "tree entries",
  commits: "commits",
  lines: "lines in one file",
};

function PatchLines({ lines, label }: { lines: readonly string[]; label: string }) {
  return (
    <div class="stack-sm">
      <p class="small muted">{label}</p>
      <pre class="patch" aria-label={label}>
        {lines.map((l, i) => (
          <span key={i} class={l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : ""}>
            {l}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

function InterdiffView({ d, from, to }: { d: Interdiff; from: number; to: number }) {
  if (d.kind === "too-large")
    return (
      <p class="small muted" data-interdiff="too-large">
        Too large to compare here: more than {d.limit.toLocaleString("en")} {BOUND[d.bound]}. The same bound applies to every proposal's diff.
      </p>
    );
  if (!d.files.length)
    return (
      <p class="small muted" data-interdiff="same">
        The same edits as in generation {from}: only rebased or reworded.
      </p>
    );
  return (
    <div class="stack" data-interdiff="changed">
      {d.files.map((f) => (
        <div key={f.path} class="stack-sm">
          <p class="file-path small">{f.path}</p>
          {f.now.length > 0 && <PatchLines lines={f.now} label={`Edits only in generation ${to}'s version`} />}
          {f.before.length > 0 && <PatchLines lines={f.before} label={`Edits only in generation ${from}'s version`} />}
        </div>
      ))}
    </div>
  );
}

function Entry({ e, from, to }: { e: ChangeEntry; from: number; to: number }) {
  const k = KIND[e.kind];
  const subject = e.kind === "rewritten" || e.kind === "added" ? e.after.subject : e.kind === "dropped" ? e.before.subject : e.kind === "unchanged" ? e.commit.subject : (e.after[0] ?? e.before[0])?.subject;
  return (
    <li class="card change-entry" data-change={e.kind} data-change-id={e.changeId}>
      <div class="row">
        <Badge tone={k.tone}>{k.label}</Badge>
        <code class="change-id" title={`jj change ID ${e.changeId}`}>
          {e.changeId.slice(0, 8)}
        </code>
        <span class="grow">{subject}</span>
      </div>
      <p class="small muted">
        {e.kind === "rewritten" && (
          <>
            Commit <Sha sha={e.before.commit} /> in generation {from} became <Sha sha={e.after.commit} /> in generation {to}.
          </>
        )}
        {e.kind === "added" && (
          <>
            New in generation {to}: commit <Sha sha={e.after.commit} />.
          </>
        )}
        {e.kind === "dropped" && (
          <>
            In generation {from} as commit <Sha sha={e.before.commit} />; not in generation {to}.
          </>
        )}
        {e.kind === "unchanged" && (
          <>
            The same commit, <Sha sha={e.commit.commit} />, in both generations.
          </>
        )}
        {e.kind === "divergent" && <>This change ID is on more than one commit, so it cannot be matched across generations.</>}
      </p>
      {e.kind === "rewritten" && (
        <details open={e.interdiff.kind === "ok" && e.interdiff.files.length > 0}>
          <summary class="disclosure">
            <Icon name="chevron" class="chev" />
            Interdiff: how this change's own edits differ
          </summary>
          <div style={{ marginTop: "8px" }}>
            <InterdiffView d={e.interdiff} from={from} to={to} />
          </div>
        </details>
      )}
    </li>
  );
}

export function ChangeHistoryView({ p }: { p: Proposal }) {
  const { adapter } = useApp();
  const [h, setH] = useState<{ key: string; history: ChangeHistory | null } | null>(null);
  const latest = useRef("");
  const key = `${p.lane}/${p.generation}`;
  useEffect(() => {
    latest.current = key;
    if (p.generation < 2) return;
    adapter.changeHistory(p).then(
      (history) => latest.current === key && setH({ key, history }),
      () => latest.current === key && setH({ key, history: null }),
    );
  }, [adapter, key]);
  const history = h && h.key === key ? h.history : null;
  if (!history || p.generation < 2) return null;

  return (
    <section class="section stack" style={{ marginBottom: "30px" }} aria-labelledby="changes-h" data-testid="change-history">
      <div class="section-head" style={{ marginBottom: 0 }}>
        <h2 id="changes-h">
          Changes since generation {history.from}, by jj change ID
        </h2>
        <Badge tone="outline">Author-supplied</Badge>
      </div>
      <p class="small muted">
        From the commits' <code>change-id</code> headers, which the author's tools write. They help decide what to read again. They prove nothing, so obligations, evidence and
        carrying still use the changed paths.
      </p>
      {history.kind === "too-large" ? (
        <p class="small muted">Too many commits to compare here: more than {history.limit.toLocaleString("en")} in one generation.</p>
      ) : (
        <>
          <ol class="stack-sm" aria-label="Changes">
            {history.entries.map((e) => (
              <Entry key={e.changeId} e={e} from={history.from} to={history.to} />
            ))}
          </ol>
          {(history.headerless.before > 0 || history.headerless.after > 0) && (
            <p class="small muted" data-headerless>
              {plural(history.headerless.after, "commit")} in generation {history.to} and {plural(history.headerless.before, "commit")} in generation {history.from} have no change-id
              header, so they are not followed here.
            </p>
          )}
        </>
      )}
    </section>
  );
}
