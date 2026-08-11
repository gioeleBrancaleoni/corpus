"use client";

import { useEffect, useRef } from "react";
import type { Source } from "@/lib/types";

interface Props {
  sources: Source[];
  highlighted: number | null;
  onOpen(path: string): void;
}

export function SourcesPanel({ sources, highlighted, onOpen }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (highlighted === null) return;
    listRef.current
      ?.querySelector(`[data-source="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlighted]);

  if (sources.length === 0) {
    return (
      <div className="p-3 text-xs text-muted">
        Sources for each answer appear here. Every citation in an answer links to the exact file
        it came from.
      </div>
    );
  }

  return (
    <ol ref={listRef} className="space-y-2 p-2">
      {sources.map((s) => (
        <li key={s.n} data-source={s.n}>
          <button
            onClick={() => onOpen(s.path)}
            className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors duration-150 ${
              highlighted === s.n
                ? "border-primary bg-primary/10"
                : "border-line hover:border-muted/50"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 font-mono text-[10px] font-semibold text-primary">
                {s.n}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{s.path}</span>
              <span className="shrink-0 text-[10px] text-muted">{s.score.toFixed(2)}</span>
            </span>
            <span className="mt-1 line-clamp-3 block text-xs text-muted">{s.snippet}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
