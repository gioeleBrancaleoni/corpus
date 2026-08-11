import { authorize, unauthorized } from "@/lib/auth";
import { cancelIngest, getProgress, runIngest } from "@/lib/ingest";

export async function POST(req: Request) {
  if (!authorize(req)) return unauthorized();
  if (getProgress().state === "running") {
    return Response.json({ error: "an index run is already in progress" }, { status: 409 });
  }
  void runIngest(); // fire and forget; progress is polled via /api/ingest/status
  return Response.json({ started: true });
}

export async function DELETE(req: Request) {
  if (!authorize(req)) return unauthorized();
  cancelIngest();
  return Response.json({ cancelling: true });
}
