"use client";

export type CenterTab = "viewer" | "chat";

export function CenterTabs({ tab, onChange }: { tab: CenterTab; onChange(t: CenterTab): void }) {
  const base = "px-3 py-1 rounded-md text-[13px] transition-colors duration-150";
  return (
    <div role="tablist" className="flex gap-1 rounded-lg bg-surface p-0.5">
      {(["viewer", "chat"] as const).map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={tab === t}
          onClick={() => onChange(t)}
          className={`${base} ${tab === t ? "bg-bg font-medium shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {t === "viewer" ? "Viewer" : "Chat"}
        </button>
      ))}
    </div>
  );
}
