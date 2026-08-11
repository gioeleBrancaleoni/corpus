// Cross-platform production start (spec §10, §12): bind 127.0.0.1 unless the
// user explicitly opts into LAN exposure with HOST=0.0.0.0.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const host = process.env.HOST ?? "127.0.0.1";
const port = process.env.PORT ?? "3000";

if (host !== "127.0.0.1" && host !== "localhost" && !process.env.CORPUS_TOKEN) {
  console.warn(
    `[corpus] warning: binding to ${host} without CORPUS_TOKEN set — ` +
      "anyone on your network can read your documents. See README › Security model.",
  );
}

const result = spawnSync(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  stdio: "inherit",
});
process.exit(result.status ?? 0);
