import { authorize, unauthorized } from "@/lib/auth";
import { loadSettings, saveSettings } from "@/lib/config";
import type { Settings } from "@/lib/types";

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  return Response.json(loadSettings());
}

function validationError(patch: Partial<Settings>): string | null {
  if (patch.topK !== undefined && (patch.topK < 1 || patch.topK > 20)) {
    return "topK must be between 1 and 20";
  }
  if (patch.chunkSize !== undefined && (patch.chunkSize < 500 || patch.chunkSize > 20000)) {
    return "chunkSize must be between 500 and 20000";
  }
  const size = patch.chunkSize ?? loadSettings().chunkSize;
  if (patch.chunkOverlap !== undefined && (patch.chunkOverlap < 0 || patch.chunkOverlap >= size)) {
    return "chunkOverlap must be >= 0 and smaller than chunkSize";
  }
  if (patch.ollamaHost !== undefined) {
    try {
      const url = new URL(patch.ollamaHost);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "ollamaHost must be http(s)";
    } catch {
      return "ollamaHost is not a valid URL";
    }
  }
  return null;
}

export async function PUT(req: Request) {
  if (!authorize(req)) return unauthorized();
  let patch: Partial<Settings>;
  try {
    patch = (await req.json()) as Partial<Settings>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const problem = validationError(patch);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  return Response.json(saveSettings(patch));
}
