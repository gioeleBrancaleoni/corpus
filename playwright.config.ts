import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3111;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DATA_DIR = path.join(__dirname, "e2e", ".data");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-ollama.mjs",
      url: "http://localhost:11435/api/version",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npm run dev -- -p ${PORT}`,
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { CORPUS_DATA_DIR: E2E_DATA_DIR },
    },
  ],
});
