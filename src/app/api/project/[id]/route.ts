import { getProject, saveProject } from "@/lib/store";
import type { Shot } from "@/lib/types";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });
  return Response.json({ project });
}

interface PatchBody {
  title?: string;
  shot?: Partial<Pick<Shot, "id" | "title" | "description" | "motion" | "dialogue" | "durationSec">>;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (typeof body.title === "string" && body.title.trim()) {
    project.title = body.title.trim();
  }
  if (body.shot?.id) {
    const shot = project.shots.find((s) => s.id === body.shot!.id);
    if (!shot) return Response.json({ error: "镜头不存在" }, { status: 404 });
    if (typeof body.shot.title === "string") shot.title = body.shot.title.trim();
    if (typeof body.shot.description === "string") shot.description = body.shot.description.trim();
    if (typeof body.shot.motion === "string") shot.motion = body.shot.motion.trim();
    if (typeof body.shot.dialogue === "string") shot.dialogue = body.shot.dialogue.trim();
    if (typeof body.shot.durationSec === "number") {
      shot.durationSec = Math.min(6, Math.max(4, Math.round(body.shot.durationSec)));
    }
  }
  await saveProject(project);
  return Response.json({ project });
}
