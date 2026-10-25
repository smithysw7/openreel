import { downloadToFile, generateImage, generateVideo, isComfyConfigured } from "@/lib/comfy";
import { generateMockImage, generateMockVideo, probeDuration } from "@/lib/media";
import { assetPath, assetUrl, getProject, readAssetAsDataUrl, saveProject } from "@/lib/store";
import type { Project, Shot } from "@/lib/types";

/** 同一镜头同时只允许一个生成任务（进程内守卫，重启后自动清空） */
const runningJobs = new Set<string>();

/**
 * 生成任务串行队列：
 * 1) 避免 8 个任务并发读-改-写同一个项目 JSON 互相覆盖状态；
 * 2) 避免真实模式下并发请求触发 Router 的 429 并发限制。
 */
const jobQueue: (() => Promise<void>)[] = [];
let draining = false;

function enqueueJob(task: () => Promise<void>): void {
  jobQueue.push(task);
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift()!;
      await job();
    }
  } finally {
    draining = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 基于最新项目快照更新单个镜头（避免与其他写入路径互相覆盖） */
async function updateShot(
  projectId: string,
  shotId: string,
  mutate: (project: Project, shot: Shot) => void,
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) return;
  const shot = project.shots.find((s) => s.id === shotId);
  if (!shot) return;
  mutate(project, shot);
  await saveProject(project);
}

interface ShotBody {
  projectId?: string;
  shotId?: string;
}

export async function POST(req: Request) {
  let body: ShotBody;
  try {
    body = (await req.json()) as ShotBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const project = body.projectId ? await getProject(body.projectId) : null;
  if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });
  const shot = project.shots.find((s) => s.id === body.shotId);
  if (!shot) return Response.json({ error: "镜头不存在" }, { status: 404 });

  const jobKey = `${project.id}/${shot.id}`;
  if (runningJobs.has(jobKey)) {
    return Response.json({ error: "该镜头正在生成中" }, { status: 409 });
  }
  runningJobs.add(jobKey);
  await updateShot(project.id, shot.id, (_p, s) => {
    s.status = "generating";
    s.error = undefined;
  });

  // 排入串行队列后台执行，客户端轮询 GET /api/project/[id] 获取进度
  enqueueJob(() => runShotJob(project.id, shot.id).finally(() => runningJobs.delete(jobKey)));
  return Response.json({ project }, { status: 202 });
}

async function runShotJob(projectId: string, shotId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) return;
  const shot = project.shots.find((s) => s.id === shotId);
  if (!shot) return;

  try {
    if (isComfyConfigured()) {
      const actor = project.actor;
      const characterBlock = actor ? `${actor.name}，${actor.description}。` : "";
      const styleBlock = actor?.styleBlock ?? project.style;

      // 1) 关键帧（失败则降级为文生视频，不中断整个镜头）
      let keyframeDataUrl: string | undefined;
      try {
        const keyframePrompt = `${shot.title}：${shot.description}。角色：${characterBlock}风格：${styleBlock}`;
        // 锚定参考图优先用用户上传的参考图，否则用演员卡第一张定妆照（保证跨镜头角色一致）
        const anchorPath =
          actor?.refImagePath ??
          (actor?.sheetImages?.[0]
            ? assetPath(project.id, actor.sheetImages[0].split("/").pop()!)
            : undefined);
        const { urls } = await generateImage({
          prompt: keyframePrompt,
          referenceImage: anchorPath ? await readAssetAsDataUrl(anchorPath) : undefined,
          aspect: project.aspect,
          timeoutMs: 8 * 60_000,
        });
        const disk = assetPath(project.id, `${shot.id}-keyframe.png`);
        await downloadToFile(urls[0], disk);
        keyframeDataUrl = await readAssetAsDataUrl(disk);
        await updateShot(projectId, shotId, (_p, s) => {
          s.keyframePath = assetUrl(project.id, `${shot.id}-keyframe.png`);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await updateShot(projectId, shotId, (p) => {
          p.warnings = [...(p.warnings ?? []), `镜头 ${shot.index + 1} 关键帧失败，已改用文生视频：${msg}`].slice(-10);
        });
      }

      // 2) 视频：有首帧走图生视频，否则文生视频
      const videoPrompt = keyframeDataUrl
        ? `${shot.motion}。延续首帧画面内容与人物形象。`
        : `${shot.title}：${shot.description}。${shot.motion}。角色：${characterBlock}风格：${styleBlock}`;
      const { urls } = await generateVideo({
        prompt: videoPrompt,
        firstFrame: keyframeDataUrl,
        durationSec: shot.durationSec,
        aspect: project.aspect,
        timeoutMs: 12 * 60_000,
      });
      const videoDisk = assetPath(project.id, `${shot.id}-video.mp4`);
      await downloadToFile(urls[0], videoDisk);
      const actual = await probeDuration(videoDisk);
      await updateShot(projectId, shotId, (_p, s) => {
        s.videoPath = assetUrl(project.id, `${shot.id}-video.mp4`);
        if (Number.isFinite(actual) && actual > 0.5) s.durationSec = Math.round(actual * 10) / 10;
        s.status = "ready";
      });
    } else {
      // 演示模式：占位媒体，模拟生成耗时
      const shotLabel = `镜头 ${shot.index + 1} · ${shot.title}（占位画面）`;
      await sleep(1200);
      await generateMockImage(assetPath(project.id, `${shot.id}-keyframe.png`), shot.index, project.aspect, shotLabel);
      await updateShot(projectId, shotId, (_p, s) => {
        s.keyframePath = assetUrl(project.id, `${shot.id}-keyframe.png`);
      });
      await sleep(1000);
      await generateMockVideo(assetPath(project.id, `${shot.id}-video.mp4`), shot.durationSec, project.aspect, shotLabel);
      const actual = await probeDuration(assetPath(project.id, `${shot.id}-video.mp4`));
      await updateShot(projectId, shotId, (p, s) => {
        s.videoPath = assetUrl(project.id, `${shot.id}-video.mp4`);
        if (Number.isFinite(actual) && actual > 0.5) s.durationSec = Math.round(actual * 10) / 10;
        s.status = "ready";
        p.warnings = [
          ...new Set([
            ...(p.warnings ?? []),
            "演示模式：镜头为占位画面，配置 COMFY_API_KEY 后重新生成即可得到真实视频",
          ]),
        ].slice(-10);
      });
    }
  } catch (err) {
    await updateShot(projectId, shotId, (_p, s) => {
      s.status = "failed";
      s.error = err instanceof Error ? err.message : String(err);
    });
  }
}
