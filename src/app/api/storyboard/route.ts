import { generateStoryboard, mockStoryboard } from "@/lib/llm";
import { newId, saveProject } from "@/lib/store";
import type { Aspect, Project, Shot } from "@/lib/types";


interface CreateBody {
  logline?: string;
  style?: string;
  aspect?: Aspect;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const logline = (body.logline ?? "").trim();
  const style = (body.style ?? "").trim() || "电影感写实";
  const aspect: Aspect = body.aspect === "9:16" ? "9:16" : "16:9";
  if (logline.length < 4) {
    return Response.json({ error: "故事梗概太短了，多写几个字（至少 4 个字符）" }, { status: 400 });
  }

  let draft = mockStoryboard(logline, style);
  let usedLlm = false;
  try {
    const llmDraft = await generateStoryboard(logline, style);
    if (llmDraft) {
      draft = llmDraft;
      usedLlm = true;
    }
  } catch (err) {
    return Response.json(
      { error: `分镜生成失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const shots: Shot[] = draft.shots.slice(0, 8).map((s, i) => ({
    id: `shot-${i + 1}`,
    index: i,
    title: s.title?.trim() || `镜头 ${i + 1}`,
    description: s.description?.trim() || logline,
    motion: s.motion?.trim() || "固定镜头",
    dialogue: s.dialogue?.trim() || "",
    durationSec: Math.min(6, Math.max(4, Math.round(s.durationSec ?? 5))),
    status: "pending",
  }));

  const now = new Date().toISOString();
  const project: Project = {
    id: newId(),
    title: draft.title?.trim() || `${style}·未命名短片`,
    logline,
    style,
    aspect,
    shots,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(project);
  return Response.json({ project, usedLlm });
}
