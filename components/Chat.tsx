"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Root, PhrasingContent } from "mdast";
import { visit } from "unist-util-visit";
import type { ChatMessage, Source } from "@/lib/types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
  streaming?: boolean;
}

interface Props {
  disabled: boolean;
  onSources(sources: Source[]): void;
  onCiteClick(n: number): void;
}

type WireEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "error"; kind: string; message: string };

export function Chat({ disabled, onSources, onCiteClick }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onSourcesRef = useRef(onSources);

  useEffect(() => {
    onSourcesRef.current = onSources;
  }, [onSources]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);

    const history: ChatMessage[] = turns
      .filter((t) => !t.error)
      .map((t) => ({ role: t.role, content: t.content }));

    setTurns((ts) => [
      ...ts,
      { role: "user", content: question },
      { role: "assistant", content: "", streaming: true },
    ]);

    const patchLast = (patch: Partial<ChatTurn> | ((t: ChatTurn) => Partial<ChatTurn>)) => {
      setTurns((ts) => {
        const last = ts.at(-1);
        if (!last || last.role !== "assistant") return ts;
        const p = typeof patch === "function" ? patch(last) : patch;
        return [...ts.slice(0, -1), { ...last, ...p }];
      });
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as WireEvent;
          if (event.type === "sources") {
            patchLast({ sources: event.sources });
            onSourcesRef.current(event.sources);
          } else if (event.type === "delta") {
            patchLast((t) => ({ content: t.content + event.content }));
          } else if (event.type === "error") {
            patchLast({ error: event.message, streaming: false });
          } else {
            patchLast({ streaming: false });
          }
        }
      }
      patchLast({ streaming: false });
    } catch (err) {
      patchLast({
        error: err instanceof Error ? err.message : "request failed",
        streaming: false,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[40ch] text-center text-muted">
              Ask a question about your indexed documents. Answers cite their sources, and every
              citation links back to the file it came from.
            </p>
          </div>
        ) : (
          <ol className="mx-auto max-w-[72ch] space-y-4">
            {turns.map((turn, i) => (
              <li key={i}>
                {turn.role === "user" ? (
                  <div className="ml-8 rounded-lg bg-surface px-3 py-2">{turn.content}</div>
                ) : (
                  <div className="mr-8 px-1 py-1 leading-relaxed">
                    {turn.error ? (
                      <p className="text-danger">{turn.error}</p>
                    ) : (
                      <p className="whitespace-pre-wrap">
                        <AnswerText text={turn.content} onCiteClick={onCiteClick} />
                        {turn.streaming && (
                          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary align-middle" />
                        )}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form
        className="shrink-0 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex max-w-[72ch] gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={disabled ? "Index your library first" : "Ask your documents…"}
            disabled={disabled || busy}
            aria-label="Question"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-[13px] placeholder:text-muted disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || busy || !input.trim()}
            className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-ink hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Answering…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * remark plugin: turn [n] citation markers inside text nodes into link nodes
 * with a #cite-n href, so they survive markdown rendering and can be swapped
 * for clickable chips by the `a` component below.
 */
function remarkCitations() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === undefined) return;
      const parts = node.value.split(/(\[\d+\])/g).filter((p) => p !== "");
      if (parts.length === 1 && !/^\[\d+\]$/.test(parts[0] ?? "")) return;
      const replacement: PhrasingContent[] = parts.map((part) => {
        const m = /^\[(\d+)\]$/.exec(part);
        return m
          ? { type: "link", url: `#cite-${m[1]}`, children: [{ type: "text", value: m[1]! }] }
          : { type: "text", value: part };
      });
      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}

/** Render the answer as markdown, with [n] citations as clickable chips. */
function AnswerText({ text, onCiteClick }: { text: string; onCiteClick(n: number): void }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkCitations]}
      components={{
        a: ({ href, children }) => {
          const m = /^#cite-(\d+)$/.exec(href ?? "");
          if (m) {
            const n = Number(m[1]);
            return (
              <button
                onClick={() => onCiteClick(n)}
                className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 align-text-top font-mono text-[10px] font-semibold text-primary not-prose hover:bg-primary/25"
                aria-label={`Show source ${n}`}
              >
                {n}
              </button>
            );
          }
          // Genuine links from documents: keep them plain and explicit.
          return (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
