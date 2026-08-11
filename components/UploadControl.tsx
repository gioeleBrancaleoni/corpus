"use client";

import { useRef, useState } from "react";

interface UploadResult {
  path: string;
  folder: string;
  isNew: boolean;
  indexed: boolean;
  reason?: string;
}

interface Props {
  disabled: boolean;
  onUploaded(path: string): void;
}

type Stage =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; result: UploadResult }
  | { kind: "error"; message: string };

export function UploadControl({ disabled, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const upload = async (file: File) => {
    setStage({ kind: "busy", label: `Uploading ${file.name}…` });
    const body = new FormData();
    body.append("file", file);
    try {
      setStage({ kind: "busy", label: "Classifying & indexing…" });
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json()) as UploadResult & { error?: string };
      if (!res.ok) {
        setStage({ kind: "error", message: data.error ?? `upload failed (HTTP ${res.status})` });
        return;
      }
      setStage({ kind: "done", result: data });
      onUploaded(data.path);
    } catch {
      setStage({ kind: "error", message: "upload failed — is the app still running?" });
    }
  };

  return (
    <div className="border-t border-line p-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.markdown,.csv,.pdf,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled || stage.kind === "busy"}
        className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:border-muted/50 disabled:opacity-40"
      >
        {stage.kind === "busy" ? stage.label : "Upload a document"}
      </button>
      {stage.kind === "done" && (
        <p className="mt-1.5 text-[11px] text-muted">
          Filed into <span className="font-mono text-ink">{stage.result.path}</span>
          {stage.result.indexed ? " · indexed" : " · not indexed"}
          {stage.result.reason && <span> · {stage.result.reason}</span>}
        </p>
      )}
      {stage.kind === "error" && <p className="mt-1.5 text-[11px] text-danger">{stage.message}</p>}
    </div>
  );
}
