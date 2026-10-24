import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Project } from "./types";

export const DATA_DIR = process.env.OPENREEL_DATA_DIR
  ? path.resolve(process.env.OPENREEL_DATA_DIR)
  : path.join(process.cwd(), ".data");

export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.mkdir(ASSETS_DIR, { recursive: true });
}

export function newId(): string {
  return crypto.randomBytes(4).toString("hex");
}

export async function saveProject(project: Project): Promise<void> {
  await ensureDirs();
  project.updatedAt = new Date().toISOString();
  const file = path.join(PROJECTS_DIR, `${project.id}.json`);
  await fs.writeFile(file, JSON.stringify(project, null, 2), "utf8");
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const file = path.join(PROJECTS_DIR, `${path.basename(id)}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

/** 最近的项目列表（用于刷新后恢复） */
export async function listProjects(limit = 12): Promise<Project[]> {
  await ensureDirs();
  const files = await fs.readdir(PROJECTS_DIR);
  const projects: Project[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      projects.push(JSON.parse(await fs.readFile(path.join(PROJECTS_DIR, f), "utf8")) as Project);
    } catch {
      /* 跳过损坏文件 */
    }
  }
  return projects
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit);
}

export function assetPath(projectId: string, name: string): string {
  return path.join(ASSETS_DIR, path.basename(projectId), path.basename(name));
}

export function assetUrl(projectId: string, name: string): string {
  return `/api/assets/${path.basename(projectId)}/${path.basename(name)}`;
}

export async function saveAssetBuffer(projectId: string, name: string, data: Uint8Array): Promise<string> {
  const dest = assetPath(projectId, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return dest;
}

/** 把 data URL（base64）落盘为资产文件，返回磁盘路径 */
export async function saveDataUrl(projectId: string, baseName: string, dataUrl: string): Promise<string> {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) throw new Error("无效的 data URL");
  const mime = m[1] ?? "application/octet-stream";
  const ext =
    mime.includes("png") ? "png" :
    mime.includes("webp") ? "webp" :
    mime.includes("jpeg") || mime.includes("jpg") ? "jpg" :
    mime.includes("mp4") ? "mp4" :
    mime.includes("webm") ? "webm" :
    mime.includes("mpeg") || mime.includes("mp3") ? "mp3" :
    mime.includes("wav") ? "wav" :
    mime.includes("ogg") ? "ogg" : "bin";
  const payload = m[3];
  const buf = m[2]
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return saveAssetBuffer(projectId, `${baseName}.${ext}`, buf);
}

/** 读取本地文件为 base64 data URL（Comfy Router 支持用 data URL 传图） */
export async function readAssetAsDataUrl(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mime =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "mp4" ? "video/mp4" : "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
