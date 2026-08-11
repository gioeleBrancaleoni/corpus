export type ConnectionState = "checking" | "connected" | "unreachable";

export function StatusDot({ state, label }: { state: ConnectionState; label: string }) {
  const color =
    state === "connected" ? "bg-primary" : state === "unreachable" ? "bg-danger" : "bg-muted";
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <span className="relative flex h-2 w-2">
        {state === "checking" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted opacity-60" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
      </span>
      {label}
    </span>
  );
}
