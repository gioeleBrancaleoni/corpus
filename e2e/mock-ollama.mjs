// Deterministic Ollama stub for E2E (spec §11): no GPU, no network beyond localhost.
// Embeddings are bag-of-words counts over a tiny vocabulary, so texts sharing
// words rank high on cosine similarity; chat returns one canned streamed answer.
import http from "node:http";

const PORT = Number(process.env.MOCK_OLLAMA_PORT ?? 11435);

const VOCAB = [
  "photosynthesis", "light", "energy", "chlorophyll", "plants", "sunlight",
  "trains", "steam", "coal", "diesel", "locomotives",
  "pasta", "tomato", "basil", "water",
  "invoice", "total", "acme", "widgets", "vat", "eur", "payment",
];

function embedText(text) {
  const words = text.toLowerCase().split(/[^a-z]+/);
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const vec = VOCAB.map((term) => counts.get(term) ?? 0);
  vec.push(0.05); // bias dim: never a zero vector
  return vec;
}

const ANSWERS = {
  photosynthesis: ["Photosynthesis ", "converts light into ", "chemical energy ", "[1]."],
  invoice: ["The total of invoice ", "INV-2026-0042 is ", "**EUR 1,234.56** ", "[1]."],
};

function pickAnswer(body) {
  const lastUser = (body.messages ?? []).filter((m) => m.role === "user").at(-1);
  return /invoice|acme|total/i.test(lastUser?.content ?? "")
    ? ANSWERS.invoice
    : ANSWERS.photosynthesis;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/version") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ version: "0.0.0-mock" }));
    return;
  }

  if (url.pathname === "/api/tags") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        models: [
          { name: "mock-chat", size: 1000, details: { parameter_size: "1M" } },
          { name: "mock-embed", size: 500, details: { parameter_size: "1M" } },
        ],
      }),
    );
    return;
  }

  if (url.pathname === "/api/embed" && req.method === "POST") {
    const body = await readBody(req);
    const input = Array.isArray(body.input) ? body.input : [body.input];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ embeddings: input.map(embedText) }));
    return;
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const answer = pickAnswer(body);
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    let i = 0;
    const timer = setInterval(() => {
      if (i < answer.length) {
        res.write(`${JSON.stringify({ message: { content: answer[i] }, done: false })}\n`);
        i += 1;
      } else {
        clearInterval(timer);
        res.end(`${JSON.stringify({ done: true })}\n`);
      }
    }, 40);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock ollama listening on http://127.0.0.1:${PORT}`);
});
