import { downloadToFile, generateImage, isComfyConfigured } from "@/lib/comfy";
import { DEFAULT_STYLE_BLOCK } from "@/lib/presets";
import {
  assetPath,
  assetUrl,
  getProject,
  newId,
  readAssetAsDataUrl,
  saveDataUrl,
  saveProject,
} from "@/lib/store";
import { generateMockImage } from "@/lib/media";
import type { ActorCard } from "@/lib/types";


const SHEET_POSES = [
  "正面定妆照，肩部以上半身，直视镜头",
  "侧面定妆照，肩部以上半身，轮廓清晰",
  "全身定妆照，自然站姿，双脚着地",
  "面部特写定妆照，中性表情，细节丰富",
];

interface CharacterBody {
  projectId?: string;
  name?: string;
  description?: string;
  /** 可选：参考图 data URL */
  refImage?: string;
}

export async function POST(req: Request) {
  let body: CharacterBody;
  try {
    body = (await req.json()) as CharacterBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim() || "主角";
  const description = (body.description ?? "").trim();
  if (description.length < 4) {
    return Response.json({ error: "请描述角色的外貌特征（至少 4 个字符），它会注入每个镜头以保证连戏" }, { status: 400 });
  }
  const project = body.projectId ? await getProject(body.projectId) : null;
  if (!project) return Response.json({ error: "项目不存在" }, { status: 404 });

  const warnings: string[] = [];
  let refDiskPath: string | undefined;
  let anchorDataUrl: string | undefined;

  if (body.refImage) {
    try {
      refDiskPath = await saveDataUrl(project.id, `ref-${Date.now()}`, body.refImage);
      anchorDataUrl = await readAssetAsDataUrl(refDiskPath);
    } catch (err) {
      warnings.push(`参考图保存失败，已忽略：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const styleBlock = `${project.style}, ${DEFAULT_STYLE_BLOCK}`;
  const sheetImages: string[] = [];

  if (isComfyConfigured()) {
    for (let i = 0; i < SHEET_POSES.length; i++) {
      const prompt = `${name}。${description}。${SHEET_POSES[i]}。同一人物，统一角色设定。风格：${styleBlock}`;
      try {
        const { urls } = await generateImage({
          prompt,
          referenceImage: anchorDataUrl,
          aspect: "16:9",
          timeoutMs: 8 * 60_000,
        });
        const disk = assetPath(project.id, `sheet-${i}.png`);
        await downloadToFile(urls[0], disk);
        sheetImages.push(assetUrl(project.id, `sheet-${i}.png`));
        // 第一张定妆照作为后续姿势的锚定参考图（开源版 Soul ID 的核心机制）
        if (!anchorDataUrl && i === 0) anchorDataUrl = await readAssetAsDataUrl(disk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`设定图 ${i + 1} 生成失败，已用占位图代替：${msg}`);
        await generateMockImage(assetPath(project.id, `sheet-${i}.png`), i, "16:9", `定妆照 ${i + 1}（占位）`);
        sheetImages.push(assetUrl(project.id, `sheet-${i}.png`));
      }
    }
  } else {
    for (let i = 0; i < SHEET_POSES.length; i++) {
      await generateMockImage(assetPath(project.id, `sheet-${i}.png`), i, "16:9", `定妆照 ${i + 1}（占位）`);
      sheetImages.push(assetUrl(project.id, `sheet-${i}.png`));
    }
    warnings.push("演示模式：未配置 COMFY_API_KEY，设定图为占位图");
  }

  const actor: ActorCard = {
    id: newId(),
    name,
    description,
    styleBlock,
    sheetImages,
    refImagePath: refDiskPath,
    createdAt: new Date().toISOString(),
  };
  project.actor = actor;
  project.warnings = warnings.length ? [...(project.warnings ?? []), ...warnings] : project.warnings;
  await saveProject(project);
  return Response.json({ project, actor, warnings });
}
