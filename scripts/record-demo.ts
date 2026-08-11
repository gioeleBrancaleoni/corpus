/**
 * Records the README demo GIF against a RUNNING app with a REAL Ollama.
 *
 * This is a demo artifact generator, NOT a CI test — it is intentionally
 * excluded from the CI matrix (CI has no GPU and no real models).
 *
 * Prerequisites (checked below, the script fails fast with a clear message):
 *   - the app is running (default http://localhost:3000, override with DEMO_URL)
 *   - the app's configured Ollama host is reachable and has the models pulled
 *   - `ffmpeg` is on PATH
 *   - the fictitious invoice fixtures in e2e/fixtures/invoices/ exist
 *
 * Output: docs/demo.gif (intermediate webm + palette are cleaned up).
 * Usage:  npm run demo:gif
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const DEMO_URL = process.env.DEMO_URL ?? "http://localhost:3000";
const QUESTION = "What is the total amount on invoice INV-2026-0042?";
const REPO_ROOT = path.resolve(__dirname, "..");
// The demo indexes ONLY the fictitious sample invoices. Never point this at
// real documents: the GIF ships in a public README.
const FIXTURES = path.join(REPO_ROOT, "e2e", "fixtures", "invoices");
const OUT_GIF = path.join(REPO_ROOT, "docs", "demo.gif");
const VIEWPORT = { width: 1280, height: 800 };

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runFfmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) {
    fail(`ffmpeg failed (${args.join(" ")}):\n${r.stderr?.toString().slice(-800)}`);
  }
}

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${DEMO_URL}/api/health`);
    if (!res.ok) throw new Error();
  } catch {
    fail(
      `App not reachable at ${DEMO_URL}.\n` +
        "  Start it first (npm run dev / npm start), or point DEMO_URL at it.",
    );
  }

  const models = (await (await fetch(`${DEMO_URL}/api/models`)).json()) as
    | { ok: true }
    | { ok: false; error: { message: string; host: string } };
  if (!models.ok) {
    fail(
      `Ollama not reachable from the app: ${models.error.message}\n` +
        "  Configure a reachable host in Settings and pull the chat + embedding models.",
    );
  }

  const ff = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ff.error || ff.status !== 0) {
    fail("ffmpeg not found on PATH. Install it (brew install ffmpeg / winget install ffmpeg).");
  }

  if (!fs.existsSync(path.join(FIXTURES, "invoice-acme.md"))) {
    fail(`Sample invoice fixtures missing at ${FIXTURES} (fictitious data only).`);
  }
}

/**
 * Load the configured models into VRAM before recording: a cold 20–30B model
 * takes 10–20s to load, which would show up as dead air in the clip.
 */
async function warmUp(): Promise<void> {
  const s = (await (await fetch(`${DEMO_URL}/api/settings`)).json()) as {
    ollamaHost: string;
    chatModel: string;
    embedModel: string;
  };
  console.log(`Warming up ${s.chatModel} + ${s.embedModel} on ${s.ollamaHost}…`);
  await fetch(`${s.ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: s.chatModel,
      messages: [{ role: "user", content: "hi" }],
      think: false,
      stream: false,
      options: { num_predict: 1 },
    }),
  }).catch(() => fail(`Could not warm up ${s.chatModel} on ${s.ollamaHost}.`));
  await fetch(`${s.ollamaHost}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: s.embedModel, input: ["warm-up"] }),
  }).catch(() => fail(`Could not warm up ${s.embedModel} on ${s.ollamaHost}.`));
}

async function record(videoDir: string): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  const page = await context.newPage();

  // Remember the user's library folder so the demo can restore it afterwards.
  const originalSettings = (await (await fetch(`${DEMO_URL}/api/settings`)).json()) as {
    rootDir: string | null;
  };

  let webmPath: string | null = null;
  try {
    await page.goto(DEMO_URL);
    await pause(1000); // idle intro frames

    // Settings → point the library at the sample invoices
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await pause(700);
    const rootInput = page.getByLabel("Library folder");
    await rootInput.click();
    await rootInput.fill("");
    await rootInput.pressSequentially(FIXTURES, { delay: 10 });
    await pause(700);
    await page.getByRole("button", { name: "Save settings" }).click();
    await pause(900);

    // Index and let the progress render briefly
    await page.getByRole("button", { name: /Index library|Re-index/ }).click();
    await page.getByRole("button", { name: "Re-index" }).waitFor({ timeout: 180_000 });
    await pause(900);

    // Chat: type the question naturally, ask, let the answer stream
    await page.getByRole("tab", { name: "Chat" }).click();
    await pause(500);
    const question = page.getByLabel("Question");
    await question.click();
    await question.pressSequentially(QUESTION, { delay: 55 });
    await pause(500);
    await page.getByRole("button", { name: "Ask" }).click();
    await page.getByRole("button", { name: "Answering…" }).waitFor({ timeout: 10_000 });
    await page
      .getByRole("button", { name: "Ask", exact: true })
      .waitFor({ timeout: 300_000 });
    await pause(1800); // let the streamed answer + [n] citation be read

    // Open the top source so the viewer shows the invoice
    await page.locator("[data-source='1']").getByRole("button").click();
    await pause(1500);

    await pause(1500); // idle outro frames
  } finally {
    // NOTE: no `return` in this block — a failed step above must propagate,
    // not be swallowed by cleanup.
    const video = page.video();
    await context.close(); // flushes the recording
    await browser.close();
    // Restore the user's original library folder
    await fetch(`${DEMO_URL}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootDir: originalSettings.rootDir }),
    }).catch(() => {});
    webmPath = video ? await video.path() : null;
  }
  if (!webmPath) fail("Playwright produced no video recording.");
  return webmPath;
}

function toGif(webm: string, tmpDir: string, fps: number, width: number): void {
  const palette = path.join(tmpDir, "palette.png");
  runFfmpeg(["-y", "-i", webm, "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`, palette]);
  runFfmpeg([
    "-y",
    "-i",
    webm,
    "-i",
    palette,
    "-lavfi",
    `fps=${fps},scale=${width}:-1:flags=lanczos [x]; [x][1:v] paletteuse`,
    OUT_GIF,
  ]);
  fs.rmSync(palette, { force: true });
}

async function main(): Promise<void> {
  await preflight();
  await warmUp();
  console.log(`Recording demo against ${DEMO_URL} (library: ${FIXTURES})…`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-demo-"));
  const webm = await record(tmpDir);
  fs.mkdirSync(path.dirname(OUT_GIF), { recursive: true });

  toGif(webm, tmpDir, 13, 1000);
  let size = fs.statSync(OUT_GIF).size;
  if (size > 5 * 1024 * 1024) {
    console.log(`GIF is ${(size / 1e6).toFixed(1)} MB — retrying at fps=10, width=900…`);
    toGif(webm, tmpDir, 10, 900);
    size = fs.statSync(OUT_GIF).size;
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✓ Wrote ${path.relative(REPO_ROOT, OUT_GIF)} (${(size / 1e6).toFixed(2)} MB)`);
}

void main();
