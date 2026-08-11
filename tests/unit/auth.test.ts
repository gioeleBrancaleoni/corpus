import { afterEach, describe, expect, it } from "vitest";
import { authorize, unauthorized } from "@/lib/auth";

afterEach(() => {
  delete process.env.CORPUS_TOKEN;
});

describe("authorize", () => {
  it("allows everything when no token is configured", () => {
    expect(authorize(new Request("http://x/api/files"))).toBe(true);
  });

  it("rejects requests without credentials when token is set", () => {
    process.env.CORPUS_TOKEN = "secret";
    expect(authorize(new Request("http://x/api/files"))).toBe(false);
  });

  it("accepts a matching bearer header", () => {
    process.env.CORPUS_TOKEN = "secret";
    const req = new Request("http://x/api/files", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(authorize(req)).toBe(true);
  });

  it("rejects a wrong bearer token", () => {
    process.env.CORPUS_TOKEN = "secret";
    const req = new Request("http://x/api/files", {
      headers: { Authorization: "Bearer nope" },
    });
    expect(authorize(req)).toBe(false);
  });

  it("accepts a matching corpus_token cookie", () => {
    process.env.CORPUS_TOKEN = "secret";
    const req = new Request("http://x/api/files", {
      headers: { Cookie: "theme=dark; corpus_token=secret" },
    });
    expect(authorize(req)).toBe(true);
  });

  it("unauthorized() returns a 401 JSON response", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTruthy();
  });
});
