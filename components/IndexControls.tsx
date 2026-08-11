"use client";

import { useEffect, useRef, useState } from "react";
import type { IngestProgress } from "@/lib/ingest";

interface Props {
  disabled: boolean;
  onFinished(): void;
}

export function IndexControls({ disabled, onFinished }: Props) {
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  // Poll once on mount so a page reload resumes the progress display.
  const [polling, setPolling] = useState(true);
  const onFinishedRef = useRef(onFinished);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/ingest/status");
        const p = (await res.json()) as IngestProgress;
        if (stopped) return;
        setProgress(p);
        if (p.state === "running") {
          wasRunningRef.current = true;
        } else {
          setPolling(false);
          if (wasRunningRef.current) {
            wasRunningRef.current = false;
            onFinishedRef.current();
          }
        }
      } catch {
        // transient network error; keep polling
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [polling]);

  const start = async () => {
    const res = await fetch("/api/ingest", { method: "POST" });
    if (res.ok) {
      wasRunningRef.current = true;
      setProgress({
        state: "running",
        totalFiles: 0,
        doneFiles: 0,
        currentFile: null,
        fileErrors: [],
      });
      setPolling(true);
    }
  };

  const cancel = async () => {
    await fetch("/api/ingest", { method: "DELETE" });
  };

  const running = progress?.state === "running";

  return (
    <div className="border-t border-line p-2">
      {running ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">
              Indexing {progress.doneFiles}/{progress.totalFiles || "…"}
            </span>
            <button onClick={() => void cancel()} className="text-danger hover:underline">
              Cancel
            </button>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.totalFiles}
            aria-valuenow={progress.doneFiles}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{
                width: progress.totalFiles
                  ? `${(progress.doneFiles / progress.totalFiles) * 100}%`
                  : "5%",
              }}
            />
          </div>
          {progress.currentFile && (
            <p className="truncate font-mono text-[11px] text-muted">{progress.currentFile}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <button
            onClick={() => void start()}
            disabled={disabled}
            className="w-full rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-ink hover:opacity-90 disabled:opacity-40"
          >
            {progress?.state === "done" || progress?.state === "cancelled"
              ? "Re-index"
              : "Index library"}
          </button>
          {progress?.state === "error" && (
            <p className="text-[11px] text-danger">{progress.error ?? "Indexing failed."}</p>
          )}
          {progress?.state === "done" && progress.fileErrors.length > 0 && (
            <p
              className="text-[11px] text-warn"
              title={progress.fileErrors.map((e) => `${e.path}: ${e.message}`).join("\n")}
            >
              {progress.fileErrors.length} file{progress.fileErrors.length === 1 ? "" : "s"} skipped
            </p>
          )}
        </div>
      )}
    </div>
  );
}
