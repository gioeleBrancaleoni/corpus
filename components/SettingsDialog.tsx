"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelInfo, Settings } from "@/lib/types";
import { type ConnectionState, StatusDot } from "./StatusDot";

interface Props {
  open: boolean;
  onClose(): void;
  onSaved(s: Settings): void;
}

type ModelsResponse =
  | { ok: true; models: ModelInfo[] }
  | { ok: false; error: { kind: string; message: string; host: string } };

export function SettingsDialog({ open, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [conn, setConn] = useState<ConnectionState>("checking");
  const [connMsg, setConnMsg] = useState("Checking…");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkHost = useCallback(async (host: string) => {
    setConn("checking");
    setConnMsg("Checking…");
    try {
      const res = await fetch(`/api/models?host=${encodeURIComponent(host)}`);
      const data = (await res.json()) as ModelsResponse;
      if (data.ok) {
        setModels(data.models);
        setConn("connected");
        setConnMsg(`Connected — ${data.models.length} model${data.models.length === 1 ? "" : "s"}`);
      } else {
        setModels([]);
        setConn("unreachable");
        setConnMsg(`Ollama not reachable at ${data.error.host}`);
      }
    } catch {
      setModels([]);
      setConn("unreachable");
      setConnMsg("Ollama not reachable");
    }
  }, []);

  useEffect(() => {
    if (!open) {
      dialogRef.current?.close();
      return;
    }
    dialogRef.current?.showModal();
    void (async () => {
      const res = await fetch("/api/settings");
      const s = (await res.json()) as Settings;
      setForm(s);
      void checkHost(s.ollamaHost);
    })();
  }, [open, checkHost]);

  const update = (patch: Partial<Settings>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    if (patch.ollamaHost !== undefined) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const host = patch.ollamaHost;
      debounceRef.current = setTimeout(() => void checkHost(host), 500);
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as Settings & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save settings");
        return;
      }
      onSaved(data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const field = "flex flex-col gap-1";
  const label = "text-xs font-medium text-muted";
  const input =
    "rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-muted/70 disabled:opacity-50";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[480px] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-bg p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      {form && (
        <form
          method="dialog"
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <header className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Settings</h2>
            <StatusDot state={conn} label={connMsg} />
          </header>

          <div className={field}>
            <label className={label} htmlFor="rootDir">
              Library folder
            </label>
            <input
              id="rootDir"
              className={`${input} font-mono`}
              placeholder={"/path/to/documents"}
              value={form.rootDir ?? ""}
              onChange={(e) => update({ rootDir: e.target.value || null })}
            />
            <p className="text-xs text-muted">
              Browsing and indexing are confined to this folder. Nothing outside it is ever read.
            </p>
          </div>

          <div className={field}>
            <label className={label} htmlFor="ollamaHost">
              Ollama host
            </label>
            <input
              id="ollamaHost"
              className={`${input} font-mono`}
              value={form.ollamaHost}
              onChange={(e) => update({ ollamaHost: e.target.value })}
            />
            <p className="text-xs text-muted">
              Local (<span className="font-mono">http://localhost:11434</span>) or another machine
              on your LAN.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={field}>
              <label className={label} htmlFor="chatModel">
                Chat model
              </label>
              <ModelSelect
                id="chatModel"
                className={input}
                models={models}
                value={form.chatModel}
                onChange={(v) => update({ chatModel: v })}
              />
            </div>
            <div className={field}>
              <label className={label} htmlFor="embedModel">
                Embedding model
              </label>
              <ModelSelect
                id="embedModel"
                className={input}
                models={models}
                value={form.embedModel}
                onChange={(v) => update({ embedModel: v })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className={field}>
              <label className={label} htmlFor="topK">
                Sources (k)
              </label>
              <input
                id="topK"
                type="number"
                min={1}
                max={20}
                className={input}
                value={form.topK}
                onChange={(e) => update({ topK: Number(e.target.value) })}
              />
            </div>
            <div className={field}>
              <label className={label} htmlFor="chunkSize">
                Chunk size
              </label>
              <input
                id="chunkSize"
                type="number"
                min={500}
                max={20000}
                step={100}
                className={input}
                value={form.chunkSize}
                onChange={(e) => update({ chunkSize: Number(e.target.value) })}
              />
            </div>
            <div className={field}>
              <label className={label} htmlFor="chunkOverlap">
                Overlap
              </label>
              <input
                id="chunkOverlap"
                type="number"
                min={0}
                step={50}
                className={input}
                value={form.chunkOverlap}
                onChange={(e) => update({ chunkOverlap: Number(e.target.value) })}
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <footer className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] hover:border-muted/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-ink hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}

function ModelSelect({
  id,
  className,
  models,
  value,
  onChange,
}: {
  id: string;
  className: string;
  models: ModelInfo[];
  value: string;
  onChange(v: string): void;
}) {
  const known = models.some((m) => m.name === value);
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value} (not pulled)</option>}
      {models.map((m) => (
        <option key={m.name} value={m.name}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
