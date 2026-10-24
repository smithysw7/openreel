import crypto from "node:crypto";

/**
 * Comfy Router API 客户端
 * 文档：https://docs.comfy.org/development/comfy-router/reference.md
 * 流程：POST /v2/models/{provider}/{model}/requests 排队
 *      → GET .../requests/{id}/status 轮询（IN_QUEUE / IN_PROGRESS / COMPLETED）
 *      → GET .../requests/{id} 取结果（各模型原生输出，媒体为签名 URL，24h/12h 过期，需立即下载）
 */

const BASE = (process.env.COMFY_API_BASE ?? "https://api.comfy.org").replace(/\/+$/, "");

export function isComfyConfigured(): boolean {
  return Boolean(process.env.COMFY_API_KEY);
}

export function imageModel(): string {
  return process.env.OPENREEL_IMAGE_MODEL ?? "bfl/flux-3-image";
}

export function videoModel(): string {
  return process.env.OPENREEL_VIDEO_MODEL ?? "minimax/minimax-h3";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function authHeaders(): Record<string, string> {
  const key = process.env.COMFY_API_KEY;
  if (!key) throw new Error("COMFY_API_KEY 未配置：请在 .env 中填入后重启服务");
  return { "X-API-Key": key };
}

/** 提交并轮询一个 Router 任务，返回模型原生输出 JSON */
export async function runRouterModel(
  model: string,
  input: unknown,
  timeoutMs = 12 * 60_000,
): Promise<Record<string, unknown>> {
  const headers = { ...authHeaders(), "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() };
  const submitRes = await fetch(`${BASE}/v2/models/${model}/requests`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const submitBody = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!submitRes.ok) {
    throw new Error(`提交任务失败（HTTP ${submitRes.status}）: ${JSON.stringify(submitBody).slice(0, 800)}`);
  }
  const requestId = submitBody.request_id as string | undefined;
  if (!requestId) throw new Error(`提交任务响应缺少 request_id: ${JSON.stringify(submitBody).slice(0, 400)}`);

  const statusUrl = (submitBody.status_url as string) ?? `${BASE}/v2/models/${model}/requests/${requestId}/status`;
  const resultUrl = (submitBody.response_url as string) ?? `${BASE}/v2/models/${model}/requests/${requestId}`;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    await sleep(4000);
    if (Date.now() > deadline) throw new Error("生成超时（超过等待上限），可稍后重试");
    const stRes = await fetch(statusUrl, { headers: authHeaders() });
    const stBody = (await stRes.json().catch(() => ({}))) as Record<string, unknown>;
    const status = String(stBody.status ?? "").toUpperCase();
    if (status === "COMPLETED") break;
    if (status && status !== "IN_QUEUE" && status !== "IN_PROGRESS") {
      throw new Error(`任务失败（${status}）: ${String(stBody.error_type ?? JSON.stringify(stBody).slice(0, 400))}`);
    }
    const retryAfter = Number(stRes.headers.get("retry-after")) * 1000;
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 3000);
  }

  const resultRes = await fetch(resultUrl, { headers: authHeaders() });
  const resultBody = (await resultRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resultRes.ok) {
    throw new Error(`获取结果失败（HTTP ${resultRes.status}）: ${JSON.stringify(resultBody).slice(0, 800)}`);
  }
  if (resultBody.error_type) {
    throw new Error(`任务出错（${String(resultBody.error_type)}）: ${JSON.stringify(resultBody.detail ?? "").slice(0, 400)}`);
  }
  return resultBody;
}

export interface MediaUrls {
  images: string[];
  videos: string[];
  dataImages: string[];
  dataVideos: string[];
}

/** 深度遍历模型原生输出，收集媒体 URL / data URI（输出结构因模型而异） */
export function extractMediaUrls(value: unknown, seen = new Set<unknown>()): MediaUrls {
  const out: MediaUrls = { images: [], videos: [], dataImages: [], dataVideos: [] };
  const visit = (v: unknown): void => {
    if (v == null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    for (const item of Object.values(v as Record<string, unknown>)) {
      if (typeof item === "string") {
        if (/^data:image\/[a-z+]+;base64,/i.test(item)) out.dataImages.push(item);
        else if (/^data:video\/[a-z+]+;base64,/i.test(item)) out.dataVideos.push(item);
        else if (/^https?:\/\//i.test(item)) {
          if (/\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(item) || /\/image[s/]/i.test(item)) out.images.push(item);
          else if (/\.(mp4|mov|webm|m4v)(\?\S*)?$/i.test(item) || /\/video[s/]|format=mp4/i.test(item)) out.videos.push(item);
        }
      } else {
        visit(item);
      }
    }
  };
  visit(value);
  return out;
}

export interface ImageRequest {
  prompt: string;
  /** 参考图（data URL 或公网 URL），用于角色一致性 */
  referenceImage?: string;
  aspect?: "16:9" | "9:16";
  timeoutMs?: number;
}

/**
 * 图像生成（默认模型 bfl/flux-3-image）。
 * 入参以该模型 openapi.json 为准（additionalProperties: false，多余字段会被 422 拒绝）：
 * prompt / aspect_ratio / resolution / images（参考图，URL 或 base64，最多 10 张）/ grounding。
 * 输出：图像签名 URL 在 result.sample（24h 时效，须立即下载）。
 */
export async function generateImage(req: ImageRequest): Promise<{ urls: string[]; raw: Record<string, unknown> }> {
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    aspect_ratio: req.aspect ?? "16:9",
    resolution: "1k",
    grounding: false,
  };
  if (req.referenceImage) input.images = [req.referenceImage];
  const raw = await runRouterModel(imageModel(), input, req.timeoutMs);
  const media = extractMediaUrls(raw);
  const urls = [...media.images, ...media.dataImages];
  if (urls.length === 0) throw new Error(`图像模型未返回图片: ${JSON.stringify(raw).slice(0, 400)}`);
  return { urls, raw };
}

export interface VideoRequest {
  prompt: string;
  /** 首帧参考图（data URL 或公网 URL） */
  firstFrame?: string;
  durationSec?: number;
  aspect?: "16:9" | "9:16";
  timeoutMs?: number;
}

/**
 * 视频生成（默认模型 minimax/minimax-h3）。
 * 入参以该模型 openapi.json 为准：content（必含一个非空 text 项，图生视频加
 * first_frame 角色）、duration（4–15 秒）、resolution（768P / 2K）、ratio。
 * 输出：视频签名 URL 在 task.content.url（12h 时效，须立即下载）。
 */
export async function generateVideo(req: VideoRequest): Promise<{ urls: string[]; raw: Record<string, unknown> }> {
  const content: unknown[] = [{ type: "text", text: req.prompt }];
  if (req.firstFrame) content.push({ type: "image_url", image_url: { url: req.firstFrame }, role: "first_frame" });
  const input: Record<string, unknown> = {
    content,
    duration: Math.min(10, Math.max(4, Math.round(req.durationSec ?? 5))),
    ratio: req.aspect ?? "16:9",
    resolution: "768P",
  };
  const raw = await runRouterModel(videoModel(), input, req.timeoutMs);
  const media = extractMediaUrls(raw);
  const urls = [...media.videos, ...media.dataVideos];
  if (urls.length === 0) throw new Error(`视频模型未返回视频: ${JSON.stringify(raw).slice(0, 400)}`);
  return { urls, raw };
}

/** 下载远程媒体到本地（签名 URL 有 12–24h 时效，必须立即下载） */
export async function downloadToFile(url: string, dest: string): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载资源失败（HTTP ${res.status}）: ${url.slice(0, 120)}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return dest;
}
