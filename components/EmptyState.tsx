export function EmptyState({ onOpenSettings }: { onOpenSettings(): void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold">Corpus</h1>
        <p className="mt-1 text-muted">
          Ask questions about your own documents. Everything runs on your machines; nothing is
          sent to any cloud.
        </p>
        <ol className="mt-6 space-y-4">
          <Step n={1} title="Pull two Ollama models">
            <code className="font-mono text-xs">ollama pull nomic-embed-text</code> and a chat
            model such as <code className="font-mono text-xs">qwen2.5:7b</code>.
          </Step>
          <Step n={2} title="Pick your documents folder">
            <button onClick={onOpenSettings} className="text-accent underline underline-offset-2">
              Open settings
            </button>{" "}
            and set the library folder and Ollama host.
          </Step>
          <Step n={3} title="Index the library">
            Press <span className="font-medium">Index</span> in the sidebar, then ask your first
            question.
          </Step>
        </ol>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted">{children}</p>
      </div>
    </li>
  );
}
