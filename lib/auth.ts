import crypto from "node:crypto";

/**
 * Optional shared-secret gate for LAN exposure (spec §10). When CORPUS_TOKEN is
 * unset the app is open (bound to 127.0.0.1 by default). This is a lock on the
 * door, not an auth system.
 */

/**
 * Timing-safe comparison: hash both sides to a fixed 32 bytes so
 * timingSafeEqual never throws on length mismatch and leaks neither
 * content nor length.
 */
function tokensMatch(candidate: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function authorize(req: Request): boolean {
  const token = process.env.CORPUS_TOKEN;
  if (!token) return true;

  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ") && tokensMatch(header.slice("Bearer ".length), token)) {
    return true;
  }

  const cookies = req.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "corpus_token" && tokensMatch(rest.join("="), token)) return true;
  }
  return false;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
