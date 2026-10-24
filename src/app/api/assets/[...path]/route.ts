import fs from "node:fs/promises";
import path from "node:path";
import { ASSETS_DIR } from "@/lib/store";


const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const safe = (parts ?? []).map((p) => path.basename(p));
  const file = path.join(ASSETS_DIR, ...safe);
  if (!path.resolve(file).startsWith(path.resolve(ASSETS_DIR))) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const buf = await fs.readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
