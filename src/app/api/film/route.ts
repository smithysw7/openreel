import { isComfyConfigured } from "@/lib/comfy";
import { generateSpeechLocal } from "@/lib/comfy_local";
import { assembleFilm, generateMockBgm } from "@/lib/media";
import { assetPath, assetUrl, DATA_DIR, getProject, saveDataUrl, saveProject } from "@/lib/store";
import path from "node:path";
import fs from "node:fs/promises";


interface FilmBody {
  projectId?: string;
  /** 可选：BGM 音频 data URL */
  bgmDataUrl?: string;
}

export async function POST(req: Request) {
  let body: FilmBody;
  try {
    body = (await req.json()) as FilmBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const project = body.projectId ? await getProject(body.projectId) : null;
  if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });

  const readyShots = project.shots
    .filter((s) => s.videoPath)
    .sort((a, b) => a.index - b.index);
  if (readyShots.length < 2) {
    return Response.json({ error: "至少需要 2 个已生成的镜头才能成片" }, { status: 400 });
  }

  let bgmDisk: string | undefined;
  if (body.bgmDataUrl) {
    try {
      bgmDisk = await saveDataUrl(project.id, `bgm-${Date.now()}`, body.bgmDataUrl);
    } catch {
      return Response.json({ error: "BGM 文件无法解析，请换一个音频文件" }, { status: 400 });
    }
  } else if (!isComfyConfigured()) {
    const mockBgm = assetPath(project.id, "mock-bgm.m4a");
    try {
      await fs.access(mockBgm);
    } catch {
      const total = readyShots.reduce((acc, s) => acc + s.durationSec, 0);
      await generateMockBgm(mockBgm, total);
    }
    bgmDisk = mockBgm;
  }

  // 旁白配音：为每个有台词的镜头生成 TTS（本地 OmniVoice），缓存复用
  const narrations: { path: string; offsetSec: number }[] = [];
  let cum = 0;
  for (const s of readyShots) {
    const dialogue = (s.dialogue ?? "").trim();
    if (dialogue) {
      const isNarrator = dialogue.startsWith("旁白");
      const spoken = dialogue.replace(/^[^：]{1,6}：/, "");
      const dest = assetPath(project.id, `narr-${s.id}`);
      let narrDisk: string | undefined;
      try {
        await fs.access(`${dest}-0.mp3`);
        narrDisk = `${dest}-0.mp3`;
      } catch {
        try {
          const outs = await generateSpeechLocal({
            text: spoken,
            voiceInstruct: isNarrator ? "male, middle-aged, low pitch" : "male, young adult, moderate pitch",
            destBase: dest,
            timeoutMs: 10 * 60_000,
          });
          narrDisk = outs[0]?.path;
        } catch (err) {
          project.warnings = [
            ...(project.warnings ?? []),
            `镜头 ${s.index + 1} 配音失败（字幕仍保留）：${err instanceof Error ? err.message : String(err)}`,
          ].slice(-10);
        }
      }
      if (narrDisk) narrations.push({ path: narrDisk, offsetSec: cum });
    }
    cum += s.durationSec;
  }

  const outName = `film-${Date.now()}.mp4`;
  const outDisk = assetPath(project.id, outName);
  // 只保留最近 2 个成片文件，避免资产目录无限膨胀
  try {
    const dir = path.dirname(outDisk);
    const oldFilms = (await fs.readdir(dir))
      .filter((f) => /^film-\d+\.mp4$/.test(f))
      .sort()
      .slice(0, -2);
    for (const f of oldFilms) await fs.rm(path.join(dir, f), { force: true });
  } catch {
    /* 清理失败不影响成片 */
  }
  try {
    const result = await assembleFilm({
      clipPaths: readyShots.map((s) => assetPath(project.id, path.basename(s.videoPath!))),
      dialogues: readyShots.map((s) => s.dialogue ?? ""),
      outPath: outDisk,
      tmpDir: path.join(DATA_DIR, "tmp", project.id),
      aspect: project.aspect,
      bgmPath: bgmDisk,
      narrations,
    });
    project.filmPath = assetUrl(project.id, outName);
    await saveProject(project);
    return Response.json({ project, ...result });
  } catch (err) {
    return Response.json(
      { error: `成片失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
