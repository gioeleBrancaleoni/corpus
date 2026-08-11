/**
 * VRAM-based model recommendation. Pure functions only — no I/O — so the
 * logic is trivially unit-testable and usable on both server and client.
 */

export interface TierEntry {
  /** Tier applies when available VRAM (GiB) is >= this value. */
  minVramGiB: number;
  chat: string;
  embed: string;
}

/**
 * Default tiers, heaviest first; the last entry (minVramGiB 0) is the
 * CPU-only / low-VRAM floor. Sizes leave headroom for context windows,
 * the embedding model, and the OS — a 24 GB card gets a ~27B Q4 chat model,
 * not a 32B that would swap. All tags verified against ollama.com.
 * Edit this table to tune the recommendations.
 */
export const MODEL_TIERS: TierEntry[] = [
  { minVramGiB: 24, chat: "qwen3.6:27b", embed: "snowflake-arctic-embed2:latest" },
  { minVramGiB: 16, chat: "gpt-oss:20b", embed: "snowflake-arctic-embed2:latest" },
  { minVramGiB: 10, chat: "qwen2.5:7b", embed: "nomic-embed-text:latest" },
  { minVramGiB: 6, chat: "qwen2.5:7b", embed: "nomic-embed-text:latest" },
  { minVramGiB: 0, chat: "llama3.2:3b", embed: "nomic-embed-text:latest" },
];

export interface ModelSuggestion {
  model: string;
  installed: boolean;
  /** Present only when the model still has to be pulled. */
  pullCommand?: string;
}

export interface Recommendation {
  /** The matched tier's minVramGiB, for display/debugging. */
  tierMinVram: number;
  chat: ModelSuggestion;
  embed: ModelSuggestion;
}

/** "nomic-embed-text:latest" and "nomic-embed-text" name the same model. */
function normalize(tag: string): string {
  return tag.endsWith(":latest") ? tag.slice(0, -":latest".length) : tag;
}

function isInstalled(model: string, installed: string[]): boolean {
  const want = normalize(model);
  return installed.some((tag) => normalize(tag) === want);
}

function suggest(
  pick: (t: TierEntry) => string,
  eligibleTiers: TierEntry[],
  installed: string[],
): ModelSuggestion {
  // Prefer any already-installed model from the matched tier or a lighter
  // one (never a heavier tier than the VRAM allows).
  for (const tier of eligibleTiers) {
    const model = pick(tier);
    if (isInstalled(model, installed)) return { model, installed: true };
  }
  const model = pick(eligibleTiers[0]!);
  return { model, installed: false, pullCommand: `ollama pull ${model}` };
}

export function recommendModels(vramGiB: number, installed: string[]): Recommendation {
  const start = MODEL_TIERS.findIndex((t) => vramGiB >= t.minVramGiB);
  const eligible = MODEL_TIERS.slice(start < 0 ? MODEL_TIERS.length - 1 : start);
  return {
    tierMinVram: eligible[0]!.minVramGiB,
    chat: suggest((t) => t.chat, eligible, installed),
    embed: suggest((t) => t.embed, eligible, installed),
  };
}
