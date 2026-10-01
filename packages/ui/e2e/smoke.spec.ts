import { expect, test, type Page } from "@playwright/test";

/*
 * End-to-end smoke test of the scripted scenario, headless. It walks the
 * timeline step by step, checks the moments the scenario exists to show,
 * acts as a reviewer, and writes the screenshots in screenshots/.
 */

const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const shot = (name: string) => `screenshots/${name}.png`;

/** Full-page screenshot from the top, so the sticky top bar sits where it belongs. */
async function capture(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: shot(name), fullPage: true });
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

async function stepTo(page: Page, label: RegExp) {
  for (let i = 0; i < 60; i++) {
    if (label.test((await page.getByTestId("step-label").textContent()) ?? "")) return;
    await page.getByRole("button", { name: "Next step" }).click();
  }
  throw new Error(`never reached ${label}`);
}

async function laneHref(page: Page, goal: string) {
  await page.goto(page.url().replace(/#.*$/, "") + "#/room");
  return page.locator(`a.lane-goal:has-text("${goal}")`).first().getAttribute("href");
}

test.use({ viewport: LAPTOP });

test("the scenario plays end to end and each screen shows its idea", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?step=0&dev#/room");
  await expect(page.getByText("No lanes yet")).toBeVisible();

  // Intent before code: the overlap shows from the claims alone.
  await stepTo(page, /@birch claims again/);
  const birch = page.locator("[data-lane='Move session checks into authz']");
  await expect(birch).toContainText("No code yet");
  await expect(birch).toContainText("Seen from the claims, before any code exists.");
  await expect(page.getByRole("alert").first()).toContainText("agents-stay-out-of-migrations");

  // A refusal names its rule and fix.
  await stepTo(page, /proposes a file outside its claim/);
  await expect(page.getByRole("alert").first()).toContainText("outside-claim");
  await expect(page.getByRole("alert").first()).toContainText("Extend the claim to cover src/api/routes.ts");

  // Generation 2: one verdict carries, one goes stale.
  await stepTo(page, /proposes generation 2/);
  await page.goto((await page.evaluate(() => location.href)).replace(/#.*$/, "") + (await laneHref(page, "Rate-limit /api/login")));
  await expect(page.locator("[data-obligation='platform-review']")).toContainText("Carried from generation 1");
  await expect(page.locator("[data-obligation='platform-review']")).toContainText("reviewed paths and declared dependencies unchanged");
  await expect(page.locator("[data-obligation='security-review']")).toContainText("Stale");
  await expect(page.locator("[data-obligation='security-review']")).toContainText("src/lib/authz/check.ts changed");

  // Parallel landing, a held slot, an unresolved publication.
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Room" }).click();
  await stepTo(page, /Rate limit is ready/);
  await expect(page.locator("[data-op='unresolved']")).toContainText("pushes the same reserved commit forward again");
  await expect(page.locator("[data-op='ready']")).toContainText("Waiting for the publication slot");

  // Lease expiry, then the forward push lands and main moves.
  await stepTo(page, /lease expires/);
  await expect(page.locator("[data-lane='Move session checks into authz']")).toContainText("Nobody holds this lane");
  await stepTo(page, /The rate limit lands/);
  await expect(page.locator("[data-op='landed']")).toHaveCount(2);

  // Conflict preview, hand-off to another agent, recut.
  await stepTo(page, /now conflicts with main/);
  await expect(page.locator("[data-lane='Move session checks into authz']")).toContainText("Conflicts with main");
  await stepTo(page, /takes over the session lane/);
  await expect(page.locator("[data-lane='Move session checks into authz']")).toContainText("@cedar");
  await stepTo(page, /The log is published again/);
  await expect(page.getByRole("region", { name: "Room status" })).toContainText("The one waiting is the checkpoint that records this publication");

  expect(errors).toEqual([]);
});

test("a reviewer clears their queue", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?viewer=@maya#/needs-you");
  await expect(page.locator(".nav .count")).toHaveText("2");
  await page.locator("[data-why='evidence-invalidated']").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Your review" })).toBeFocused();
  await page.getByLabel("Comment").fill("Address plus account is right.");
  await page.getByRole("button", { name: "Record approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recorded as entry" })).toBeVisible();
  await expect(page.locator("[data-obligation='security-review']")).toHaveAttribute("data-state", "met");
  await expect(page.locator(".nav .count")).toHaveText("1");
  expect(errors).toEqual([]);
});

test("keyboard: skip link, number keys, and visible focus", async ({ page }) => {
  await page.goto("/#/needs-you");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Room");
  await page.keyboard.press("j");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).toBe("solid");
});

for (const scheme of ["light", "dark"] as const) {
  test(`screenshots, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/?viewer=@maya#/needs-you");
    await expect(page.locator(".item").first()).toBeVisible();
    await capture(page, `needs-you-${scheme}`);

    // Step 25: logging is stuck unresolved; the rate limit is ready behind it.
    await page.goto("/?step=25#/room");
    await expect(page.locator("[data-op='unresolved']")).toBeVisible();
    await capture(page, `room-${scheme}`);

    const href = await laneHref(page, "Rate-limit /api/login");
    await page.goto(`/?step=22${href}/2`);
    await expect(page.locator("[data-file='src/lib/authz/check.ts']")).toBeVisible();
    await capture(page, `proposal-${scheme}`);

    await page.goto("/#/policy");
    await page.getByRole("button", { name: "Run against history" }).click();
    await expect(page.getByTestId("dry-run-result")).toContainText("would change");
    await capture(page, `policy-${scheme}`);
  });
}

test("screenshot, phone width", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?viewer=@maya#/needs-you");
  await expect(page.locator(".item").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await capture(page, "needs-you-phone");
  const href = await laneHref(page, "Rate-limit /api/login");
  await page.goto(`/?step=22${href}/2`);
  await expect(page.locator("[data-obligation='security-review']")).toBeVisible();
  await capture(page, "proposal-phone");
});
