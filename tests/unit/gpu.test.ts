import { describe, expect, it } from "vitest";
import { detectGpu, parseNvidiaSmi } from "@/lib/gpu";

describe("parseNvidiaSmi", () => {
  it("parses a single-GPU csv line into name and VRAM in GiB", () => {
    const out = parseNvidiaSmi("24564, NVIDIA GeForce RTX 3090 Ti\n");
    expect(out).toEqual({ name: "NVIDIA GeForce RTX 3090 Ti", vramGiB: 24 });
  });

  it("picks the GPU with the most VRAM on multi-GPU machines", () => {
    const out = parseNvidiaSmi("8192, NVIDIA T1000\n24564, NVIDIA GeForce RTX 3090 Ti\n");
    expect(out?.name).toBe("NVIDIA GeForce RTX 3090 Ti");
    expect(out?.vramGiB).toBe(24);
  });

  it("returns null for garbage or empty output", () => {
    expect(parseNvidiaSmi("")).toBeNull();
    expect(parseNvidiaSmi("No devices were found")).toBeNull();
    expect(parseNvidiaSmi("banana, ")).toBeNull();
  });
});

describe("detectGpu", () => {
  it("returns detected:false (never throws) when the binary is missing", async () => {
    const out = await detectGpu("definitely-not-a-real-binary-xyz");
    expect(out).toEqual({ detected: false });
  });
});
