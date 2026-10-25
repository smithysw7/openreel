import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./store";

/**
 * 本地 ComfyUI 适配层（路线 B：Open Weights）。
 * 通过 ComfyUI Server API（/prompt → /history → /view）驱动本地工作流：
 * - 图像：Z-Image Turbo（workflows/z_image_t2i.json）
 * - 视频：MiniMax H3 i2v（workflows/h3_i2v.json，首帧经 /upload/image 注入）
 * 模板放在项目 workflows/ 目录，运行时读取。
 */

const BASE = (process.env.OPENREEL_LOCAL_COMFY ?? "http://127.0.0.1:8188").replace(/\/+$/, "");

let reachCache: { until: number; ok: boolean } | undefined;

export async function isLocalReachable(): Promise<boolean> {
  if (reachCache && Date.now() < reachCache.until) return reachCache.ok;
  let ok = false;
  try {
    const res = await fetch(`${BASE}/system_stats`, { signal: AbortSignal.timeout(2500) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  reachCache = { until: Date.now() + 30_000, ok };
  return ok;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 深度遍历替换模板占位符：整值占位符返回原始类型（数字保持数字） */
function fill(template: unknown, vars: Record<string, unknown>): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const whole = /^\{\{([A-Z_]+)\}\}$/.exec(v);
      if (whole && vars[whole[1]] !== undefined) return vars[whole[1]];
      return v.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, v2]) => [k, walk(v2)]));
    return v;
  };
  return walk(template) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
}

async function loadTemplate(name: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "workflows", name), "utf8")) as unknown;
}

export interface LocalOutput {
  path: string;
  filename: string;
}

async function submitWorkflow(workflow: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const body = (await res.json().catch(() => ({}))) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!res.ok || !body.prompt_id) {
    throw new Error(`本地提交失败（HTTP ${res.status}）: ${JSON.stringify(body).slice(0, 600)}`);
  }
  return body.prompt_id;
}

function extractErrorMessage(status: { messages?: unknown[] }): string | null {
  for (const m of status.messages ?? []) {
    if (Array.isArray(m) && m[0] === "execution_error") {
      const e = m[1] as { node_type?: string; exception_message?: string };
      return `${e.node_type ?? "节点"}: ${e.exception_message ?? "未知错误"}`;
    }
  }
  return null;
}

async function waitHistory(promptId: string, label: string, timeoutMs: number) {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label} 本地生成超时（${Math.round(timeoutMs / 60000)} 分钟）`);
    await sleep(4000);
    const res = await fetch(`${BASE}/history/${promptId}`);
    const hist = (await res.json().catch(() => ({})))[promptId];
    if (!hist) continue;
    const status = (hist as { status?: { status_str?: string; completed?: boolean; messages?: unknown[] } }).status ?? {};
    if (status.status_str === "error") {
      throw new Error(`${label} 本地执行出错: ${extractErrorMessage(status) ?? JSON.stringify(status).slice(0, 300)}`);
    }
    if (status.completed === true) return hist as { outputs?: Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>> };
  }
}

async function downloadOutputs(hist: { outputs?: Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>> }, destBase: string): Promise<LocalOutput[]> {
  const out: LocalOutput[] = [];
  let n = 0;
  for (const nodeOut of Object.values(hist.outputs ?? {})) {
    for (const key of ["videos", "images", "gifs", "video"]) {
      for (const item of nodeOut[key] ?? []) {
        const params = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder ?? "", type: item.type ?? "output" });
        const res = await fetch(`${BASE}/view?${params}`);
        if (!res.ok) throw new Error(`下载本地产物失败（HTTP ${res.status}）: ${item.filename}`);
        const dest = `${destBase}-${n++}.${(item.filename.split(".").pop() ?? "bin").toLowerCase()}`;
        await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
        out.push({ path: dest, filename: item.filename });
      }
    }
  }
  return out;
}

export interface LocalImageRequest {
  prompt: string;
  aspect?: "16:9" | "9:16";
  /** 生成结果落盘路径（不含扩展名，按产物实际扩展名补全） */
  destBase: string;
  timeoutMs?: number;
}

/** 本地出图（Z-Image Turbo） */
export async function generateImageLocal(req: LocalImageRequest): Promise<LocalOutput[]> {
  const width = req.aspect === "9:16" ? 720 : 1280;
  const height = req.aspect === "9:16" ? 1280 : 720;
  const wf = fill(await loadTemplate("z_image_t2i.json"), {
    PROMPT: req.prompt,
    SEED: Math.floor(Math.random() * 1e9),
    // 宽高直接写进模板的 EmptySD3LatentImage（占位符写入）
  });
  wf["7"].inputs.width = width;
  wf["7"].inputs.height = height;
  const id = await submitWorkflow(wf);
  const hist = await waitHistory(id, "图像", req.timeoutMs ?? 10 * 60_000);
  return downloadOutputs(hist, req.destBase);
}

export interface LocalVideoRequest {
  prompt: string;
  /** 首帧图片的本地磁盘路径（可选；提供则走 i2v，否则文生视频） */
  firstFramePath?: string;
  aspect?: "16:9" | "9:16";
  durationSec?: number;
  destBase: string;
  timeoutMs?: number;
}

/** 本地出视频（MiniMax H3，i2v 带首帧或文生视频） */
export async function generateVideoLocal(req: LocalVideoRequest): Promise<LocalOutput[]> {
  const width = req.aspect === "9:16" ? 544 : 960;
  const height = req.aspect === "9:16" ? 960 : 544;
  const seconds = Math.min(10, Math.max(4, Math.round(req.durationSec ?? 5)));
  const wf = fill(await loadTemplate("h3_i2v.json"), {
    PROMPT: req.prompt,
    WIDTH: width,
    HEIGHT: height,
    LENGTH: Math.round(seconds * 24),
    SEED: Math.floor(Math.random() * 1e9),
    SHOT: path.basename(req.destBase).replace(/[^a-zA-Z0-9_-]/g, "") || "shot",
  });
  if (req.firstFramePath) {
    const buf = await fs.readFile(req.firstFramePath);
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(buf)], { type: "image/png" }), path.basename(req.firstFramePath));
    form.append("type", "input");
    const upRes = await fetch(`${BASE}/upload/image`, { method: "POST", body: form });
    if (!upRes.ok) throw new Error(`上传首帧失败（HTTP ${upRes.status}）`);
    const upInfo = (await upRes.json()) as { name: string };
    wf["16"] = { class_type: "LoadImage", inputs: { image: upInfo.name } };
    (wf["6"].inputs as Record<string, unknown>).first_frame = ["16", 0];
  }
  const id = await submitWorkflow(wf);
  const hist = await waitHistory(id, "视频", req.timeoutMs ?? 40 * 60_000);
  return downloadOutputs(hist, req.destBase);
}
