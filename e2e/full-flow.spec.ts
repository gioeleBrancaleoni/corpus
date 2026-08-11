import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("index → ask → grounded answer → source links to the right file", async ({ page }) => {
  await page.goto("/");

  // Library tree shows the fixtures
  await expect(page.getByRole("treeitem").filter({ hasText: "plants.md" })).toBeVisible();
  await expect(page.getByText("Ollama connected")).toBeVisible();

  // Index the library and wait for completion
  await page.getByRole("button", { name: "Index library" }).click();
  await expect(page.getByRole("button", { name: "Re-index" })).toBeVisible({ timeout: 30_000 });

  // Ask a question in the Chat tab
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByLabel("Question").fill("What does photosynthesis do?");
  await page.getByRole("button", { name: "Ask" }).click();

  // Streamed grounded answer appears
  await expect(page.getByText("converts light into chemical energy")).toBeVisible({
    timeout: 15_000,
  });

  // Sources panel: top source is plants.md
  const firstSource = page.locator("[data-source='1']");
  await expect(firstSource).toContainText("plants.md");

  // Clicking the source opens the file in the viewer
  await firstSource.getByRole("button").click();
  await expect(page.getByRole("tab", { name: "Viewer", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How plants eat light" })).toBeVisible();

  // Download button targets the same file
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    "/api/files/download?path=plants.md",
  );
});

test("citation chips highlight the matching source", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByLabel("Question").fill("What does photosynthesis do?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("converts light into chemical energy")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Show source 1" }).click();
  await expect(page.locator("[data-source='1'] > button")).toHaveClass(/border-primary/);
});
