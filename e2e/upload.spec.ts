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

test("a stale index defers indexing instead of mixing vector formats", async ({ request }) => {
  // Poison the live DB's format marker so the index (non-empty after the
  // earlier uploads) is incompatible with the app's current vector format.
  // createRequire anchored at the real repo root: Playwright's transpile
  // cache breaks native-module path resolution for plain imports.
  const { createRequire } = await import("node:module");
  const requireFromRepo = createRequire(path.join(__dirname, "..", "package.json"));
  const Database = requireFromRepo("better-sqlite3") as typeof import("better-sqlite3");
  const dbPath = path.join(__dirname, ".data", "corpus.db");

  const withDb = <T>(fn: (db: import("better-sqlite3").Database) => T): T => {
    const db = new Database(dbPath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };

  withDb((db) => {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM files").get() as { c: number };
    expect(c).toBeGreaterThan(0);
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('indexFormat', 'legacy-mixed') " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run();
  });

  const res = await request.post("/api/upload", {
    multipart: {
      file: {
        name: "deferred.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Deferred\n\nThis lands on disk but must not be indexed yet.\n"),
      },
    },
  });
  expect(res.status()).toBe(200);
  const data = (await res.json()) as { path: string; indexed: boolean; reason?: string };
  expect(data.indexed).toBe(false);
  expect(data.reason).toContain("run Index library");
  // the file IS placed in the library…
  expect(fs.existsSync(path.join(UPLOAD_ROOT, data.path))).toBe(true);

  // …but the store was not mutated with a mixed-format vector
  withDb((db) => {
    expect(db.prepare("SELECT id FROM files WHERE path = ?").get(data.path)).toBeUndefined();
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'indexFormat'").get() as {
      value: string;
    };
    expect(meta.value).toBe("legacy-mixed");
  });

  // a full re-index heals everything (wipe + rebuild in the current format)
  const start = await request.post("/api/ingest");
  expect(start.ok()).toBe(true);
  await expect
    .poll(
      async () => ((await (await request.get("/api/ingest/status")).json()) as { state: string }).state,
      { timeout: 30_000 },
    )
    .toBe("done");
  withDb((db) => {
    expect(db.prepare("SELECT id FROM files WHERE path = ?").get(data.path)).toBeDefined();
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'indexFormat'").get() as {
      value: string;
    };
    expect(meta.value).toBe("unit-f32-v1");
  });
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
