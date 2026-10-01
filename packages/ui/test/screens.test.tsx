import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { DEFAULT_STEP } from "../src/room/mock/scenario.ts";
import { laneId, renderAt, stepOf } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

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
