import { expect, test } from "@playwright/test";

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
