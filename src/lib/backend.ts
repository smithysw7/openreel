import { isComfyConfigured } from "./comfy";
import { isLocalReachable } from "./comfy_local";

export type Backend = "local" | "cloud" | "mock";

/**
 * 生成后端选择：
 * - OPENREEL_BACKEND=local|cloud|mock 强制指定；
 * - 默认 auto：本地 ComfyUI 可达 → local；否则配了云 Key → cloud；否则 mock（占位画面）。
 */
export async function pickBackend(): Promise<Backend> {
  const pref = (process.env.OPENREEL_BACKEND ?? "auto").toLowerCase();
  if (pref === "local") return "local";
  if (pref === "cloud") return isComfyConfigured() ? "cloud" : (await isLocalReachable()) ? "local" : "mock";
  if (pref === "mock") return "mock";
  if (await isLocalReachable()) return "local";
  if (isComfyConfigured()) return "cloud";
  return "mock";
}

export function backendLabel(b: Backend): string {
  if (b === "local") return "本地 ComfyUI（Z-Image Turbo + MiniMax H3 开源权重）";
  if (b === "cloud") return "Comfy 云端 API";
  return "演示模式";
}
