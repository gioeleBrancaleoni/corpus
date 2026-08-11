import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

// Uploads write into the library root, so these tests point the app at a
// throwaway root under e2e/.data (gitignored) and restore the fixtures root
// afterwards. Runs last alphabetically; workers=1 keeps it serial anyway.
const UPLOAD_ROOT = path.join(__dirname, ".data", "upload-root");
const FIXTURES_ROOT = path.join(__dirname, "fixtures", "library");

test.beforeAll(async ({ request }) => {
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const res = await request.put("/api/settings", { data: { rootDir: UPLOAD_ROOT } });
  expect(res.ok()).toBe(true);
});

test.afterAll(async ({ request }) => {
  await request.put("/api/settings", { data: { rootDir: FIXTURES_ROOT } });
});

test("upload → auto-classified folder → indexed → cited as a source", async ({
  page,
  request,
}) => {
  const res = await request.post("/api/upload", {
    multipart: {
      file: {
        name: "leaf-biology.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# Leaf biology\n\nPhotosynthesis converts light into chemical energy in plants.\n",
        ),
      },
    },
  });
  expect(res.status()).toBe(200);
  const data = (await res.json()) as { path: string; folder: string; indexed: boolean };
  expect(data.folder).toBe("botany");
  expect(data.path).toBe("botany/leaf-biology.md");
  expect(data.indexed).toBe(true);
  expect(fs.existsSync(path.join(UPLOAD_ROOT, "botany", "leaf-biology.md"))).toBe(true);

  // Immediately queryable: the uploaded file shows up as the top source.
  await page.goto("/");
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByLabel("Question").fill("What does photosynthesis do?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.locator("div.prose").getByText("converts light into chemical energy")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("[data-source='1']")).toContainText("botany/leaf-biology.md");
});

test("a malicious folder suggestion from the model is confined to the root", async ({
  request,
}) => {
  const res = await request.post("/api/upload", {
    multipart: {
      file: {
        name: "trap.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("EVIL-FOLDER-TRIGGER this document tries to escape the library\n"),
      },
    },
  });
  expect(res.status()).toBe(200);
  const data = (await res.json()) as { path: string; folder: string };
  // mock suggested "../../../../pwned" → sanitized to a single safe segment
  expect(data.folder).toMatch(/^[a-z0-9-]+$/);
  expect(data.path).not.toContain("..");
  expect(fs.existsSync(path.join(UPLOAD_ROOT, data.path))).toBe(true);
  // and nothing landed outside the root
  expect(fs.existsSync(path.join(UPLOAD_ROOT, "..", "..", "..", "..", "pwned"))).toBe(false);
});

test("manual folder override is honored (and still sanitized)", async ({ request }) => {
  const res = await request.post("/api/upload", {
    multipart: {
      folder: "Tax Documents 2026",
      file: { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("tax note") },
    },
  });
  const data = (await res.json()) as { path: string; folder: string };
  expect(data.folder).toBe("tax-documents-2026");
  expect(fs.existsSync(path.join(UPLOAD_ROOT, "tax-documents-2026", "note.txt"))).toBe(true);
});

test("unsupported types and oversized files are rejected", async ({ request }) => {
  const bad = await request.post("/api/upload", {
    multipart: {
      file: { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("x") },
    },
  });
  expect(bad.status()).toBe(415);

  await request.put("/api/settings", { data: { maxUploadMB: 1 } });
  const big = await request.post("/api/upload", {
    multipart: {
      file: {
        name: "big.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(1_200_000, 97), // 1.2 MB of "a"
      },
    },
  });
  expect(big.status()).toBe(413);
  await request.put("/api/settings", { data: { maxUploadMB: 25 } });
});

test("duplicate names are de-duplicated, never overwritten", async ({ request }) => {
  const send = () =>
    request.post("/api/upload", {
      multipart: {
        folder: "inbox",
        file: { name: "dup.txt", mimeType: "text/plain", buffer: Buffer.from("same name") },
      },
    });
  await send();
  const second = (await (await send()).json()) as { path: string };
  expect(second.path).toBe("inbox/dup-2.txt");
});
