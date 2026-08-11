import { authorize, unauthorized } from "@/lib/auth";
import { getProgress } from "@/lib/ingest";

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  return Response.json(getProgress());
}
