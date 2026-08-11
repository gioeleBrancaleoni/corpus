import { authorize, unauthorized } from "@/lib/auth";
import { detectGpu } from "@/lib/gpu";

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  return Response.json(await detectGpu());
}
