import { expect, test } from "@playwright/test";

const DEAD_HOST = "http://localhost:59999";
const MOCK_HOST = "http://localhost:11435";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ request }) => {
  await request.put("/api/settings", { data: { ollamaHost: MOCK_HOST } });
});

test("shows a friendly state when Ollama is unreachable", async ({ page, request }) => {
  const res = await request.put("/api/settings", { data: { ollamaHost: DEAD_HOST } });
  expect(res.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByText(`Ollama not reachable at ${DEAD_HOST}`)).toBeVisible({
    timeout: 15_000,
  });

  // Chat degrades gracefully with a specific error, not a crash
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByLabel("Question").fill("Anyone home?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText(/not reachable/i).nth(1)).toBeVisible({ timeout: 15_000 });

  // Settings dialog shows the red status too
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText(/Ollama not reachable/i).last()).toBeVisible();
});
