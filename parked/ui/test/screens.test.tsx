import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/app.tsx";
import type { Why } from "../src/room/adapter.ts";
import type { ActId, Proposal, Sha } from "../src/room/contract.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { AppContext } from "../src/ui/context.ts";
import { WhyDialog } from "../src/ui/WhyDialog.tsx";
import { DEFAULT_STEP } from "../src/room/mock/scenario.ts";
import { laneId, renderAt, settled, stepOf, waitFor } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  location.hash = "";
});

const sha = (c: string) => c.repeat(40) as Sha;

describe("Needs you", () => {
  test("each open item says what to do, why it is yours, and offers one action", () => {
    renderAt("#/needs-you", { step: DEFAULT_STEP, viewer: "@maya" });
    const open = screen.getByRole("list", { name: "Waiting for you" });
    const items = within(open).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const stale = items.find((i) => i.dataset["why"] === "evidence-invalidated")!;
    expect(stale.textContent).toContain("Your approval did not carry to generation 2");
    expect(stale.textContent).toContain("src/lib/authz/check.ts changed, and @maya declared src/lib/authz/** as a dependency");
    for (const item of items) expect(within(item).getAllByRole("link")).toHaveLength(1);
    const review = items.find((i) => i.dataset["why"] === "review-requested")!;
    expect(review.textContent).toContain("You are in @security");
    expect(within(review).getByRole("link").getAttribute("href")).toMatch(/\/1\/review$/);
  });

  test("an admin sees the unresolved publication and what waits behind it", () => {
    renderAt("#/needs-you", { step: stepOf("Rate limit is ready"), viewer: "@sam" });
    const item = document.querySelector<HTMLElement>("[data-why='publication-unresolved']")!;
    expect(item.textContent).toContain("You are an admin");
    expect(item.textContent).toContain("Waiting behind it: “Rate-limit /api/login”");
    expect(within(item).getByRole("link", { name: /See the landing queue/ })).toBeTruthy();
  });

  test("switching the viewer switches the queue", () => {
    renderAt("#/needs-you", { step: DEFAULT_STEP, viewer: "@maya" });
    fireEvent.change(screen.getByLabelText("Viewing as"), { target: { value: "@sam" } });
    expect(screen.getByText(/waiting for/).textContent).toContain("@sam");
    expect(document.querySelector("[data-why='publication-unresolved']")).not.toBeNull();
  });
});

describe("Room", () => {
  test("overlap is visible from the claims, before any code", () => {
    renderAt("#/room", { step: stepOf("@birch claims again") });
    const lane = document.querySelector<HTMLElement>("[data-lane='Move session checks into authz']")!;
    expect(lane.textContent).toContain("No code yet");
    expect(lane.textContent).toContain("Seen from the claims, before any code exists.");
    expect(lane.querySelector(".glob.hit")!.textContent).toBe("src/lib/authz/**");
  });

  test("the landing queue shows a held, unresolved slot and a ready landing waiting", () => {
    renderAt("#/room", { step: stepOf("Rate limit is ready") });
    expect(document.querySelector("[data-op='unresolved']")!.textContent).toContain("pushes the same reserved commit forward again");
    expect(document.querySelector("[data-op='ready']")!.textContent).toContain("Waiting for the publication slot");
    expect(screen.getByRole("region", { name: "Room status" }).textContent).toContain("Held: unresolved");
  });

  test("every refusal in the activity feed shows its rule and fix", () => {
    renderAt("#/room", { step: stepOf("Policy refuses") });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("agents-stay-out-of-migrations");
    expect(alert.textContent).toContain("Fix");
    expect(alert.textContent).toContain("Leave migrations/** out of the claim");
  });

  test("the publication lag is shown", () => {
    renderAt("#/room", { step: DEFAULT_STEP });
    expect(screen.getByRole("region", { name: "Room status" }).textContent).toMatch(/\d+ entr(y|ies) not yet published/);
    expect(screen.getByText(/^Published through entry \d+$/)).toBeTruthy();
  });
});

describe("Proposal", () => {
  test("evidence is marked reviewed here, carried with its reason, or stale with its reason", async () => {
    const lane = laneId("Rate-limit /api/login", DEFAULT_STEP);
    renderAt(`#/lane/${lane}/2`, { step: DEFAULT_STEP });
    const platform = document.querySelector<HTMLElement>("[data-obligation='platform-review']")!;
    expect(platform.dataset["state"]).toBe("met");
    expect(platform.textContent).toContain("Carried from generation 1");
    expect(platform.textContent).toContain("reviewed paths and declared dependencies unchanged");
    const security = document.querySelector<HTMLElement>("[data-obligation='security-review']")!;
    expect(security.dataset["state"]).toBe("open");
    expect(security.textContent).toContain("Stale");
    expect(security.textContent).toContain("src/lib/authz/check.ts changed, and @maya declared src/lib/authz/** as a dependency");
    const tests = document.querySelector<HTMLElement>("[data-obligation='tests']")!;
    expect(tests.querySelector("[data-basis='here']")!.textContent).toContain("Reviewed here");
    // The diff loads, with the note thread anchored to its line and head.
    await waitFor(() => expect(document.querySelector("[data-file='src/api/login.ts']")).not.toBeNull());
    expect(document.querySelector("[data-file='src/lib/authz/check.ts']")!.textContent).toContain("Changed since generation 1");
    const thread = document.querySelector<HTMLElement>(".thread")!;
    expect(thread.textContent).toContain("Written on generation 1");
    expect(thread.textContent).toContain("Can the key include the account?");
  });

  test("the viewer's approval is recorded and meets the obligation", async () => {
    const lane = laneId("Rate-limit /api/login", DEFAULT_STEP);
    renderAt(`#/lane/${lane}/2`, { step: DEFAULT_STEP, viewer: "@maya" });
    fireEvent.input(screen.getByLabelText("Comment"), { target: { value: "Address plus account is right." } });
    fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Recorded as entry"));
    expect(document.querySelector<HTMLElement>("[data-obligation='security-review']")!.dataset["state"]).toBe("met");
  });

  test("a refused review shows its rule, reason and fix", async () => {
    const lane = laneId("Move session checks into authz");
    renderAt(`#/lane/${lane}/2`, { viewer: "@sam" });
    fireEvent.click(screen.getByRole("button", { name: "Record approval" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("not-authorized-reviewer");
    expect(alert.textContent).toContain("Ask @security to review it.");
  });

  test("a conflicting head says it cannot land", () => {
    const lane = laneId("Move session checks into authz");
    renderAt(`#/lane/${lane}/1`, {});
    expect(screen.getByText(/Conflicts with main on src\/lib\/authz\/check.ts/)).toBeTruthy();
    expect(screen.getByText(/This head cannot land/)).toBeTruthy();
  });
});

describe("Policy", () => {
  test("rules show in plain English, refusals with their fix", () => {
    renderAt("#/policy", { step: DEFAULT_STEP });
    const refuse = document.querySelector<HTMLElement>("[data-rule='agents-stay-out-of-migrations']")!;
    expect(refuse.textContent).toContain("Fix");
    expect(refuse.textContent).toContain("ask @sam to claim the migration");
    expect(document.querySelector("[data-outcome='no-carry']")).not.toBeNull();
  });

  test("a dry run of a default dependency finds the verdict that would not have carried", async () => {
    renderAt("#/policy", {});
    fireEvent.click(screen.getByRole("button", { name: "Run against history" }));
    const result = await screen.findByTestId("dry-run-result");
    expect(result.textContent).toContain("1 outcome would change.");
    expect(result.textContent).toContain("@sam's approval of generation 1");
    expect(result.textContent).toContain("Would not carry: src/lib/authz/check.ts changed");
  });

  test("a draft refuse rule shows which claims it would have refused", async () => {
    renderAt("#/policy", {});
    fireEvent.click(screen.getByLabelText(/Refuse some claims/));
    fireEvent.click(screen.getByRole("button", { name: "Run against history" }));
    const result = await screen.findByTestId("dry-run-result");
    expect(result.textContent).toContain("3 outcomes would change.");
    expect(result.textContent).toContain("Refused by agents-stay-out-of-authz");
  });
});

describe("Shell", () => {
  test("the theme button cycles system, light and dark", () => {
    renderAt("#/needs-you", {});
    const button = screen.getByRole("button", { name: /Theme: system/ });
    fireEvent.click(button);
    expect(document.documentElement.dataset["theme"]).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: /Theme: light/ }));
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /Theme: dark/ }));
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
  });

  test("number keys switch screens and j moves to the next item", async () => {
    renderAt("#/needs-you", { step: DEFAULT_STEP });
    fireEvent.keyDown(window, { key: "j" });
    expect(document.activeElement?.getAttribute("data-nav")).toBe("item");
    fireEvent.keyDown(window, { key: "2" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Room"));
    fireEvent.keyDown(window, { key: "3" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Policy"));
  });

  test("the demo timeline steps the room and the screen follows", async () => {
    const { adapter } = renderAt("#/room", { step: 0 });
    expect(screen.getByText(/No lanes yet/)).toBeTruthy();
    adapter.timeline!.go(1);
    await waitFor(() => expect(document.querySelector("[data-lane='Rate-limit /api/login']")).not.toBeNull());
  });
});

describe("note threads stay bound to their recorded head (review 82f2743b, P2.4)", () => {
  const LANE_GOAL = "Rate-limit /api/login";

  async function openGen(mock: MockRoom, generation: number) {
    const lane = mock.snapshot().lanes.find((l) => l.goal === LANE_GOAL)!;
    location.hash = `#/lane/${lane.lane}/${generation}`;
    render(<App adapter={mock} />);
    await waitFor(() => expect(document.querySelector("[data-file='src/api/login.ts']")).not.toBeNull());
    return document.querySelector<HTMLElement>("[data-file='src/api/login.ts']")!;
  }

  test("with every interdiff known and the file unchanged, the thread is placed on the line and says why", async () => {
    const file = await openGen(new MockRoom({ step: 22 }), 2);
    const row = file.querySelector<HTMLElement>("tr.thread")!;
    expect(row.textContent).toContain("Written on generation 1");
    expect(row.textContent).toContain("The file is unchanged from that head to this one.");
  });

  test("with the interdiff unavailable, the thread stays on its own head and the relation is unknown", async () => {
    const mock = new MockRoom({ step: 22 });
    vi.spyOn(mock, "changedSince").mockReturnValue(null);
    const file = await openGen(mock, 2);
    expect(file.querySelector("tr.thread")).toBeNull();
    const held = file.querySelector<HTMLElement>("[data-relation='unknown']")!;
    expect(held.textContent).toContain("On generation 1");
    expect(held.textContent).toContain("line 15");
    expect(held.textContent).toContain("is not known here");
    expect(file.textContent).not.toContain("unchanged from that head");
  });

  test("a file changed in an earlier generation and unchanged in the latest is not projected", async () => {
    const mock = new MockRoom({ step: 22 });
    const snap = mock.snapshot();
    const lane = snap.lanes.find((l) => l.goal === LANE_GOAL)!;
    const g2 = snap.proposals.find((p) => p.lane === lane.lane && p.generation === 2)!;
    const g3: Proposal = { ...g2, generation: 3, head: sha("3"), id: "act_200_aaaaaaaa" };
    vi.spyOn(mock, "snapshot").mockReturnValue({ ...snap, proposals: [...snap.proposals, g3], lanes: snap.lanes.map((l) => (l.lane === lane.lane ? { ...l, generation: 3 } : l)) });
    vi.spyOn(mock, "changedSince").mockImplementation((ref) => (ref.generation === 2 ? ["src/api/login.ts"] : ref.generation === 3 ? ["src/lib/authz/check.ts"] : null));
    vi.spyOn(mock, "diff").mockImplementation((ref) => MockRoom.prototype.diff.call(mock, { ...ref, generation: Math.min(ref.generation, 2) }));
    const file = await openGen(mock, 3);
    expect(file.querySelector("tr.thread")).toBeNull();
    expect(file.querySelector<HTMLElement>("[data-relation='changed']")!.textContent).toContain("This file changed since that head");
  });
});

describe("the why dialog shows the explanation of the act it was asked for (review 82f2743b, P2.5)", () => {
  function setup() {
    const mock = new MockRoom();
    const ids = mock.snapshot().feed.slice(0, 2).map((f) => f.id) as [ActId, ActId];
    const why = (act: ActId, title: string): Why => ({ act, seq: 1, by: "@sam", title, outcome: "accepted", decisions: [], invariants: [], reasons: [], published: false });
    const state = { adapter: mock, snap: mock.snapshot(), why: () => {} };
    const view = (id: ActId | null) => (
      <AppContext.Provider value={state}>
        <WhyDialog act={id} onClose={() => {}} />
      </AppContext.Provider>
    );
    return { mock, ids, why, view };
  }

  test("a late answer for an earlier request does not replace the current one", async () => {
    const { mock, ids, why, view } = setup();
    let resolveA!: (v: Why) => void;
    let resolveB!: (v: Why) => void;
    const pa = new Promise<Why>((r) => (resolveA = r));
    const pb = new Promise<Why>((r) => (resolveB = r));
    vi.spyOn(mock, "explain").mockImplementation((id) => (id === ids[0] ? pa : pb));
    const { rerender } = render(view(ids[0]));
    rerender(view(null));
    rerender(view(ids[1]));
    resolveB(why(ids[1], "Explanation B"));
    await screen.findByText("Explanation B");
    resolveA(why(ids[0], "Explanation A"));
    await settled();
    expect(screen.queryByText("Explanation A")).toBeNull();
    expect(screen.getByText("Explanation B")).toBeTruthy();
  });

  test("a failed explain shows a recoverable error, and trying again works", async () => {
    const { mock, ids, why, view } = setup();
    const explain = vi.spyOn(mock, "explain").mockRejectedValueOnce({ name: "ArtroomError", message: "unavailable" }).mockResolvedValueOnce(why(ids[0], "Explanation A"));
    render(view(ids[0]));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The room did not explain this entry: unavailable.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByText("Explanation A");
    expect(explain).toHaveBeenCalledTimes(2);
  });
});
