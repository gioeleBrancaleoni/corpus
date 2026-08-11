import { execFile } from "node:child_process";

/**
 * GPU/VRAM detection for model recommendations. Detection must NEVER crash
 * the app: any failure (no NVIDIA driver, AMD/Apple/CPU-only machine)
 * resolves to { detected: false } and the user can enter VRAM manually in
 * Settings.
 */

export type GpuInfo = { detected: true; name: string; vramGiB: number } | { detected: false };

/**
 * Parse `nvidia-smi --query-gpu=memory.total,name --format=csv,noheader,nounits`
 * output, e.g. "24564, NVIDIA GeForce RTX 3090 Ti". Multi-GPU machines report
 * one line per GPU; we pick the one with the most VRAM.
 */
export function parseNvidiaSmi(output: string): { name: string; vramGiB: number } | null {
  let best: { name: string; vramGiB: number } | null = null;
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*,\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const vramGiB = Math.round((Number(m[1]) / 1024) * 10) / 10;
    if (vramGiB > 0 && (!best || vramGiB > best.vramGiB)) {
      best = { name: m[2]!, vramGiB };
    }
  }
  return best;
}

export function detectGpu(command = "nvidia-smi"): Promise<GpuInfo> {
  return new Promise((resolve) => {
    execFile(
      command,
      ["--query-gpu=memory.total,name", "--format=csv,noheader,nounits"],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ detected: false });
          return;
        }
        const parsed = parseNvidiaSmi(stdout);
        resolve(parsed ? { detected: true, ...parsed } : { detected: false });
      },
    );
  });
}
