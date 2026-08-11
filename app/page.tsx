"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsDialog } from "@/components/SettingsDialog";
import { type ConnectionState, StatusDot } from "@/components/StatusDot";
import type { Settings } from "@/lib/types";

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conn, setConn] = useState<ConnectionState>("checking");

  const refreshConnection = useCallback(async () => {
    setConn("checking");
    try {
      const res = await fetch("/api/models");
      const data = (await res.json()) as { ok: boolean };
      setConn(data.ok ? "connected" : "unreachable");
    } catch {
      setConn("unreachable");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      setSettings((await res.json()) as Settings);
      void refreshConnection();
    })();
  }, [refreshConnection]);

  const hasRoot = !!settings?.rootDir;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="text-sm font-semibold tracking-tight">Corpus</span>
        <span className="text-xs text-muted">local · private · yours</span>
        <div className="ml-auto flex items-center gap-3">
          <StatusDot
            state={conn}
            label={
              conn === "connected"
                ? "Ollama connected"
                : conn === "unreachable"
                  ? `Ollama not reachable at ${settings?.ollamaHost ?? ""}`
                  : "Checking Ollama…"
            }
          />
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs hover:border-muted/50"
          >
            Settings
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_300px] max-lg:grid-cols-[minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-line max-lg:hidden">
          <div className="flex h-10 items-center justify-between border-b border-line px-3 text-xs font-medium text-muted">
            Library
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 text-muted">
            {hasRoot ? (
              <p className="font-mono text-xs break-all">{settings?.rootDir}</p>
            ) : (
              <p className="text-xs">No folder selected yet.</p>
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-auto">
          <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
        </section>

        <aside className="flex min-h-0 flex-col border-l border-line max-lg:hidden">
          <div className="flex h-10 items-center border-b border-line px-3 text-xs font-medium text-muted">
            Sources
          </div>
          <div className="flex-1 p-3 text-xs text-muted">
            Sources for each answer will appear here.
          </div>
        </aside>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setSettings(s);
          void refreshConnection();
        }}
      />
    </div>
  );
}
