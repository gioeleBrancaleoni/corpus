import fs from "node:fs";
import path from "node:path";

/**
 * Fresh app state for every E2E run: wipe e2e/.data and write a config.json
 * pointing at the fixtures library and the mock Ollama server.
 */
export default function globalSetup(): void {
  const dataDir = path.join(__dirname, ".data");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "config.json"),
    JSON.stringify(
      {
        rootDir: path.join(__dirname, "fixtures", "library"),
        ollamaHost: "http://localhost:11435",
        chatModel: "mock-chat",
        embedModel: "mock-embed",
        embedDim: null,
        topK: 3,
        chunkSize: 3200,
        chunkOverlap: 600,
      },
      null,
      2,
    ),
  );
}
