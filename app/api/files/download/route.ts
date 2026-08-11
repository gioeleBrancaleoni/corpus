import { serveFile } from "@/lib/file-routes";

export async function GET(req: Request) {
  return serveFile(req, "attachment");
}
