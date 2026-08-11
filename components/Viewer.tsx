"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const CODE_LANGS: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "jsx",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".sh": "bash",
  ".sql": "sql",
  ".html": "markup",
  ".css": "css",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "markup",
};

function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

function subscribeToScheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useDarkMode(): boolean {
  return useSyncExternalStore(
    subscribeToScheme,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

interface LoadedFile {
  path: string;
  text?: string;
  error?: string;
}

export function Viewer({ path: filePath }: { path: string | null }) {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [mdRaw, setMdRaw] = useState(false);
  const dark = useDarkMode();

  const ext = filePath ? extOf(filePath) : "";
  const isPdf = ext === ".pdf";
  const isMd = ext === ".md" || ext === ".markdown";
  const isDocx = ext === ".docx";
  const codeLang = CODE_LANGS[ext];

  useEffect(() => {
    if (!filePath || isPdf || isDocx) return;
    let stale = false;
    void (async () => {
      try {
        const res = await fetch(`/api/files/raw?path=${encodeURIComponent(filePath)}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        const body = await res.text();
        if (!stale) setLoaded({ path: filePath, text: body });
      } catch (err) {
        if (!stale) {
          setLoaded({
            path: filePath,
            error: err instanceof Error ? err.message : "could not load file",
          });
        }
      }
    })();
    return () => {
      stale = true;
    };
  }, [filePath, isPdf, isDocx]);

  const current = loaded && loaded.path === filePath ? loaded : null;
  const text = current?.text ?? null;
  const error = current?.error ?? null;

  const csvRows = useMemo(() => {
    if (ext !== ".csv" || !text) return null;
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0 || lines.length > 2000) return null;
    return lines.map((l) => l.split(","));
  }, [ext, text]);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Select a file from the library to preview it.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{filePath}</span>
        {isMd && (
          <button
            onClick={() => setMdRaw(!mdRaw)}
            className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs hover:border-muted/50"
          >
            {mdRaw ? "Rendered" : "Raw"}
          </button>
        )}
        <a
          href={`/api/files/download?path=${encodeURIComponent(filePath)}`}
          className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs hover:border-muted/50"
        >
          Download
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-viewer-body>
        {isPdf ? (
          <iframe
            title={filePath}
            src={`/api/files/raw?path=${encodeURIComponent(filePath)}`}
            className="h-full w-full"
          />
        ) : isDocx ? (
          <div className="p-6 text-muted">
            <p>Word documents are indexed for questions but not previewed.</p>
            <a
              href={`/api/files/download?path=${encodeURIComponent(filePath)}`}
              className="text-accent underline underline-offset-2"
            >
              Download {filePath.split("/").pop()}
            </a>
          </div>
        ) : error ? (
          <div className="p-6 text-danger">{error}</div>
        ) : text === null ? (
          <ViewerSkeleton />
        ) : isMd && !mdRaw ? (
          <article className="prose prose-sm dark:prose-invert max-w-[72ch] px-6 py-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </article>
        ) : csvRows ? (
          <table className="m-4 border-collapse font-mono text-xs">
            <tbody>
              {csvRows.map((row, i) => (
                <tr key={i} className={i === 0 ? "font-semibold" : ""}>
                  {row.map((cell, j) => (
                    <td key={j} className="border border-line px-2 py-1">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : codeLang ? (
          <SyntaxHighlighter
            language={codeLang}
            style={dark ? oneDark : oneLight}
            customStyle={{ margin: 0, background: "transparent", fontSize: "12px" }}
            showLineNumbers
          >
            {text}
          </SyntaxHighlighter>
        ) : (
          <pre className="px-6 py-5 font-mono text-xs whitespace-pre-wrap">{text}</pre>
        )}
      </div>
    </div>
  );
}

function ViewerSkeleton() {
  return (
    <div className="animate-pulse space-y-3 px-6 py-5" aria-label="Loading file">
      <div className="h-4 w-1/3 rounded bg-surface" />
      <div className="h-3 w-full rounded bg-surface" />
      <div className="h-3 w-5/6 rounded bg-surface" />
      <div className="h-3 w-2/3 rounded bg-surface" />
    </div>
  );
}
