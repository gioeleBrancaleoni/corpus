import { authorize, unauthorized } from "@/lib/auth";
import { loadSettings } from "@/lib/config";
import { OllamaError, listModels } from "@/lib/ollama";

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  const url = new URL(req.url);
  const host = url.searchParams.get("host") ?? loadSettings().ollamaHost;
  try {
    const models = await listModels(host);
    return Response.json({ ok: true, models });
  } catch (err) {
    if (err instanceof OllamaError) {
      return Response.json({
        ok: false,
        error: { kind: err.kind, message: err.message, host: err.host },
      });
    }
    return Response.json(
      { ok: false, error: { kind: "http", message: "unexpected error", host } },
      { status: 500 },
    );
  }
}
