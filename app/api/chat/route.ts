import { authorize, unauthorized } from "@/lib/auth";
import { OllamaError } from "@/lib/ollama";
import { answerQuestion } from "@/lib/rag";
import type { ChatMessage } from "@/lib/types";
import { DimensionMismatchError } from "@/lib/vector";

interface ChatRequestBody {
  question?: string;
  history?: ChatMessage[];
}

/**
 * Wire protocol: NDJSON stream of
 *   {"type":"sources","sources":Source[]}
 *   {"type":"delta","content":"…"}   (repeated)
 *   {"type":"done"} | {"type":"error","kind":string,"message":string}
 */
export async function POST(req: Request) {
  if (!authorize(req)) return unauthorized();

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question) return Response.json({ error: "question is required" }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const { sources, stream: answer } = await answerQuestion(question, history, {
          signal: req.signal,
        });
        send({ type: "sources", sources });
        for await (const delta of answer) {
          send({ type: "delta", content: delta });
        }
        send({ type: "done" });
      } catch (err) {
        if (err instanceof OllamaError) {
          send({ type: "error", kind: err.kind, message: err.message });
        } else if (err instanceof DimensionMismatchError) {
          send({
            type: "error",
            kind: "index-stale",
            message: "The index was built with a different embedding model. Re-index the library.",
          });
        } else if (!req.signal.aborted) {
          send({ type: "error", kind: "internal", message: "unexpected error while answering" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
