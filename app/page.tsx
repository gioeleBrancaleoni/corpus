"use client";

import { useCallback, useEffect, useState } from "react";
import { type CenterTab, CenterTabs } from "@/components/CenterTabs";
import { EmptyState } from "@/components/EmptyState";
import { FileTree } from "@/components/FileTree";
import { IndexControls } from "@/components/IndexControls";
import { SettingsDialog } from "@/components/SettingsDialog";
import { type ConnectionState, StatusDot } from "@/components/StatusDot";
import { Viewer } from "@/components/Viewer";
import type { TreeNode } from "@/lib/tree";
import type { Settings } from "@/lib/types";

type TreeResponse = { ok: true; tree: TreeNode } | { ok: false; error: string };

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conn, setConn] = useState<ConnectionState>("checking");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<CenterTab>("viewer");

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

  const refreshTree = useCallback(async () => {
    try {
      const res = await fetch("/api/files/tree");
      const data = (await res.json()) as TreeResponse;
      if (data.ok) {
        setTree(data.tree);
        setTreeError(null);
      } else {
        setTree(null);
        setTreeError(data.error);
      }
    } catch {
      setTree(null);
      setTreeError("failed");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      setSettings((await res.json()) as Settings);
      void refreshConnection();
      void refreshTree();
    })();
  }, [refreshConnection, refreshTree]);

  const openFile = (path: string) => {
    setSelected(path);
    setTab("viewer");
  };

  const hasRoot = !!settings?.rootDir;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="text-sm font-semibold tracking-tight">Corpus</span>
        <span className="text-xs text-muted max-md:hidden">local · private · yours</span>
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
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
            <span className="text-xs font-medium text-muted">Library</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {tree ? (
              <FileTree tree={tree} selected={selected} onSelect={openFile} />
            ) : (
              <p className="p-2 text-xs text-muted">
                {treeError === "root-missing"
                  ? "The configured folder no longer exists."
                  : "No folder selected yet."}
              </p>
            )}
          </div>
          <IndexControls disabled={!hasRoot} onFinished={() => void refreshTree()} />
        </aside>

        <section className="flex min-h-0 flex-col">
          {hasRoot ? (
            <>
              <div className="flex h-11 shrink-0 items-center justify-center border-b border-line">
                <CenterTabs tab={tab} onChange={setTab} />
              </div>
              <div className="min-h-0 flex-1">
                {tab === "viewer" ? (
                  <Viewer path={selected} />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    Chat arrives with the RAG milestone.
                  </div>
                )}
              </div>
            </>
          ) : (
            <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
          )}
        </section>

        <aside className="flex min-h-0 flex-col border-l border-line max-lg:hidden">
          <div className="flex h-10 shrink-0 items-center border-b border-line px-3 text-xs font-medium text-muted">
            Sources
          </div>
          <div className="flex-1 overflow-auto p-3 text-xs text-muted">
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
          void refreshTree();
        }}
      />
    </div>
  );
}
