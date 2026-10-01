// What a push to the base branch did, as far as the pusher can know.
//
//   landed    the receiver reported the ref updated (or already at the commit)
//   rejected  the ref was definitely not updated: a lease (stale ref or stale
//             info), a non-fast-forward, or another refusal the receiver reported
//   error     the push failed before anything was sent (authentication, DNS,
//             connection, missing repo); the ref did not change because of it
//   unknown   the pack may have been sent and no report arrived; the ref may or
//             may not have changed. Read back the branch before any further land.
//
// The rule: never say `error` or `rejected` when the ref might have changed.
// When in doubt, the answer is `unknown`.

export type PushOutcome =
	| { outcome: "landed"; detail: string }
	| { outcome: "rejected"; reason: "lease" | "non-fast-forward" | "remote-rejected"; detail: string }
	| { outcome: "error"; detail: string }
	| { outcome: "unknown"; detail: string };

// Failures that git reports only while sending or after sending the pack.
const AFTER_SEND = [
	/RPC failed/,
	/unexpected disconnect/,
	/remote end hung up unexpectedly/,
	/early EOF/,
	/send-pack:/,
	/\[remote failure\]/,
];

// Failures during discovery (the GET of info/refs, or connecting), before any
// pack is sent.
const BEFORE_SEND = [
	/^fatal: unable to access '[^']*': /m,
	/Authentication failed/,
	/could not read Username/,
	/^fatal: repository '[^']*' not found/m,
	/does not appear to be a git repository/,
];

// Classify `git push --porcelain` for one destination ref.
export function classifyGitPush(exitCode: number, stdout: string, stderr: string, dstRef: string): PushOutcome {
	const detail = (stdout + "\n" + stderr).trim().slice(-600);
	for (const line of stdout.split("\n")) {
		const m = /^(.)\t[^\t]*:([^\t]+)\t(.*)$/.exec(line);
		if (!m || m[2] !== dstRef) continue;
		const [, flag, , summary] = m;
		if (" +-*=".includes(flag)) {
			return exitCode === 0 ? { outcome: "landed", detail } : { outcome: "unknown", detail };
		}
		if (flag !== "!") return { outcome: "unknown", detail };
		if (/\(stale info\)|\(stale ref\)/.test(summary)) return { outcome: "rejected", reason: "lease", detail };
		if (/^\[rejected\]/.test(summary)) return { outcome: "rejected", reason: "non-fast-forward", detail };
		if (/^\[remote rejected\]/.test(summary)) return { outcome: "rejected", reason: "remote-rejected", detail };
		if (/^\[no match\]/.test(summary)) return { outcome: "error", detail };
		return { outcome: "unknown", detail }; // includes "[remote failure]": sent, no status
	}
	if (exitCode === 0) return { outcome: "unknown", detail }; // success without a status line for our ref
	if (AFTER_SEND.some((r) => r.test(stderr))) return { outcome: "unknown", detail };
	if (BEFORE_SEND.some((r) => r.test(stderr))) return { outcome: "error", detail };
	return { outcome: "unknown", detail };
}

// Classify an isomorphic-git push. `sent` is true once `onPrePush` has run:
// discovery succeeded and the pack may be on its way.
export function classifyIsoPush(
	result: { ok?: boolean; refs?: Record<string, { ok: boolean; error?: string }> } | undefined,
	err: unknown,
	sent: boolean,
	dstRef: string,
): PushOutcome {
	if (!err) {
		const r = result?.refs?.[dstRef];
		if (result?.ok && r?.ok) return { outcome: "landed", detail: "ok" };
		return { outcome: "unknown", detail: JSON.stringify(result ?? null).slice(0, 600) };
	}
	const e = err as { code?: string; message?: string; data?: any };
	const detail = String(e?.message ?? err).slice(0, 600);
	// The client's fast-forward check. It runs before anything is sent.
	if (e?.code === "PushRejectedError") return { outcome: "rejected", reason: "non-fast-forward", detail };
	// The receiver reported that the ref, or the whole pack, was not accepted.
	if (e?.code === "GitPushError") {
		const r = e.data?.result?.refs?.[dstRef];
		if (r && !r.ok && /stale/.test(r.error ?? "")) return { outcome: "rejected", reason: "lease", detail };
		return { outcome: "rejected", reason: "remote-rejected", detail };
	}
	return sent ? { outcome: "unknown", detail } : { outcome: "error", detail };
}
