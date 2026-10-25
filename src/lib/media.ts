import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/** 所有 ffmpeg 相关处理。真实片段与 mock 占位片段统一走同一条拼装管线。 */

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => reject(new Error(`无法执行 ${cmd}：${err.message}（请确认已安装 ffmpeg 并加入 PATH）`)));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} 退出码 ${code}: ${stderr.slice(-600)}`));
    });
  });
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  const n = Number(out.trim());
  return Number.isFinite(n) ? n : 5;
}

export async function hasAudio(file: string): Promise<boolean> {
  const out = await run("ffprobe", [
    "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "default=nw=1:nk=1", file,
  ]);
  return out.trim().length > 0;
}

function dims(aspect: "16:9" | "9:16"): { w: number; h: number } {
  return aspect === "9:16" ? { w: 720, h: 1280 } : { w: 1280, h: 720 };
}

const MOCK_PALETTES = [
  ["0x1e1b4b", "0x0ea5e9"],
  ["0x4c1d95", "0xdb2777"],
  ["0x134e4a", "0x84cc16"],
  ["0x7c2d12", "0xf59e0b"],
];

async function ensureParentDir(dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
}

/** 中文字体探测（演示模式标签用），找不到字体则不带标签 */
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/msyh.ttf",
  "C:/Windows/Fonts/simhei.ttf",
  "C:/Windows/Fonts/arial.ttf",
];
let cachedFont: string | null | undefined;

async function getFontFile(): Promise<string | null> {
  if (cachedFont !== undefined) return cachedFont;
  cachedFont = null;
  for (const f of FONT_CANDIDATES) {
    try {
      await fs.access(f);
      cachedFont = f;
      break;
    } catch {
      /* 试下一个 */
    }
  }
  return cachedFont;
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/:/g, "\\:");
}

/** 底部居中标签滤镜；无可用字体时返回 null（画面不带文字） */
async function labelFilter(text: string, fontSize: number): Promise<string | null> {
  if (!text.trim()) return null;
  const font = await getFontFile();
  if (!font) return null;
  // ffmpeg 滤镜是两层解析：Windows 路径里的冒号即使在引号内也要转义为 \:
  const fontPath = font.replace(/\\/g, "/").replace(/:/g, "\\:");
  return `drawtext=text='${escapeDrawtext(text)}':fontfile='${fontPath}'` +
    `:fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=h-${Math.round(fontSize * 2.4)}` +
    `:box=1:boxcolor=black@0.45:boxborderw=14`;
}

/** mock 占位图：渐变色块（演示模式下保证全流程可跑通） */
export async function generateMockImage(
  dest: string,
  seed: number,
  aspect: "16:9" | "9:16",
  label?: string,
): Promise<void> {
  await ensureParentDir(dest);
  const { w, h } = dims(aspect);
  const [c0, c1] = MOCK_PALETTES[seed % MOCK_PALETTES.length];
  const vf = await labelFilter(label ?? "", Math.round(h / 18));
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i",
    `gradients=s=${w}x${h}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${w}:y1=${h}:nb_colors=2`,
    ...(vf ? ["-vf", vf] : []),
    "-frames:v", "1", dest,
  ]);
}

/** mock 占位视频：testsrc2 动态测试图 */
export async function generateMockVideo(
  dest: string,
  durationSec: number,
  aspect: "16:9" | "9:16",
  label?: string,
): Promise<void> {
  await ensureParentDir(dest);
  const { w, h } = dims(aspect);
  const d = Math.min(10, Math.max(3, Math.round(durationSec)));
  const vf = await labelFilter(label ?? "", Math.round(h / 18));
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `testsrc2=duration=${d}:size=${w}x${h}:rate=24`,
    ...(vf ? ["-vf", vf] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", dest,
  ]);
}

/** mock BGM：低沉棕色噪声氛围底噪 */
export async function generateMockBgm(dest: string, durationSec: number): Promise<void> {
  await ensureParentDir(dest);
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i",
    `anoisesrc=colour=brown:amplitude=0.04:duration=${Math.ceil(durationSec)}:sample_rate=44100`,
    "-af", "lowpass=f=600,volume=0.7,tremolo=f=0.3:d=0.4",
    "-c:a", "aac", dest,
  ]);
}

/** 归一化单个片段：统一尺寸/帧率/像素格式，音频统一 48k 立体声（无音轨则补静音） */
export async function normalizeClip(src: string, dest: string, aspect: "16:9" | "9:16"): Promise<void> {
  const { w, h } = dims(aspect);
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`;
  const withAudio = await hasAudio(src);
  const args = ["-y", "-i", src];
  if (!withAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-shortest");
  }
  args.push(
    "-map", "0:v:0",
    "-map", withAudio ? "0:a:0" : "1:a:0",
    "-vf", vf,
    "-af", "aformat=sample_rates=48000:channel_layouts=stereo",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    dest,
  );
  await run("ffmpeg", args);
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

export interface SrtEntry {
  start: number;
  end: number;
  text: string;
}

export async function generateSrt(entries: SrtEntry[], dest: string): Promise<boolean> {
  const valid = entries.filter((e) => e.text.trim().length > 0 && e.end > e.start);
  if (valid.length === 0) return false;
  const body = valid
    .map((e, i) => `${i + 1}\n${srtTime(e.start)} --> ${srtTime(e.end)}\n${e.text.replace(/\r?\n/g, " ").trim()}\n`)
    .join("\n");
  // 加 BOM 便于 libass 在 Windows 上识别 UTF-8
  await fs.writeFile(dest, "\uFEFF" + body, "utf8");
  return true;
}

/** ffmpeg subtitles 滤镜的 Windows 路径转义 */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * 成片拼装管线：
 * 1) 每个片段归一化  2) concat 拼接（流复制）  3) 烧录字幕  4) 混入旁白与 BGM
 */
export async function assembleFilm(opts: {
  clipPaths: string[];
  dialogues: string[];
  outPath: string;
  tmpDir: string;
  aspect: "16:9" | "9:16";
  bgmPath?: string;
  /** 旁白配音：path 为音频文件，offsetSec 为相对成片起始的混入时间 */
  narrations?: { path: string; offsetSec: number }[];
}): Promise<{ durationSec: number; subtitlesBurned: boolean; bgmMixed: boolean }> {
  const { clipPaths, dialogues, outPath, tmpDir, aspect, bgmPath } = opts;
  const narrations = opts.narrations ?? [];
  if (clipPaths.length === 0) throw new Error("没有可用的镜头片段");
  // 清掉上一次拼装的中间产物，避免临时目录无限膨胀
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  // 1) 归一化
  const normalized: string[] = [];
  const durations: number[] = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const dest = path.join(tmpDir, `norm-${String(i).padStart(2, "0")}.mp4`);
    await normalizeClip(clipPaths[i], dest, aspect);
    normalized.push(dest);
    durations.push(await probeDuration(dest));
  }

  // 2) concat（统一规格后可流复制）
  const listFile = path.join(tmpDir, "concat.txt");
  await fs.writeFile(
    listFile,
    normalized.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n",
    "utf8",
  );
  const concatOut = path.join(tmpDir, "concat.mp4");
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", concatOut]);

  // 3) 烧录字幕（按归一化后的实际时长计算时间轴）
  let current = concatOut;
  let subtitlesBurned = false;
  let start = 0;
  const entries: SrtEntry[] = normalized.map((_, i) => {
    const entry = { start, end: start + durations[i], text: dialogues[i] ?? "" };
    start += durations[i];
    return entry;
  });
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const srtFile = path.join(tmpDir, "subs.srt");
  if (await generateSrt(entries, srtFile)) {
    const burned = path.join(tmpDir, "subtitled.mp4");
    await run("ffmpeg", [
      "-y", "-i", concatOut,
      "-vf", `subtitles=filename='${escapeFilterPath(srtFile)}'`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "copy",
      burned,
    ]);
    current = burned;
    subtitlesBurned = true;
  }

  // 4) 混入旁白与 BGM（旁白按 offsetSec 对齐，有旁白时原声自动压低）
  let bgmMixed = false;
  if (narrations.length > 0 || bgmPath) {
    const args = ["-y", "-i", current];
    const chains: string[] = [];
    const mixIns: string[] = [];
    let idx = 1;
    if (narrations.length > 0) chains.push(`[0:a]volume=0.45[m]`);
    else chains.push(`[0:a]anull[m]`);
    mixIns.push("[m]");
    for (const nr of narrations) {
      args.push("-i", nr.path);
      const ms = Math.max(0, Math.round(nr.offsetSec * 1000));
      chains.push(`[${idx}:a]adelay=${ms}:all=1[n${idx}]`);
      mixIns.push(`[n${idx}]`);
      idx++;
    }
    if (bgmPath) {
      args.push("-stream_loop", "-1", "-i", bgmPath);
      chains.push(`[${idx}:a]volume=0.15[bg]`);
      mixIns.push("[bg]");
      idx++;
      bgmMixed = true;
    }
    chains.push(`${mixIns.join("")}amix=inputs=${mixIns.length}:duration=first:normalize=0[aout]`);
    args.push(
      "-filter_complex", chains.join(";"),
      "-map", "0:v:0", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      outPath,
    );
    await run("ffmpeg", args);
  } else {
    await fs.copyFile(current, outPath);
  }

  return { durationSec: totalDuration, subtitlesBurned, bgmMixed };
}
