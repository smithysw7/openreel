import type { StoryboardDraft } from "./types";

/**
 * 分镜 LLM：任意 OpenAI 兼容接口（GLM / DeepSeek / OpenAI 等）。
 * 未配置 LLM_API_KEY 时返回 null，调用方使用内置 mock 分镜，全流程依然可跑通。
 */

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function chatJson<T>(
  system: string,
  user: string,
  opts?: { temperature?: number },
): Promise<T | null> {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "glm-4.6";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts?.temperature ?? 0.8,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`LLM 请求失败（HTTP ${res.status}）: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = parseJsonLoose<T>(text);
    if (parsed) return parsed;
    await sleep(200);
  }
  return null;
}

const STORYBOARD_SYSTEM = `你是一位专业电影分镜师。根据用户给定的故事梗概与画风，输出一个 8 镜头的短片分镜表。
要求：
1. 严格输出 JSON（不要任何多余文本），格式：
{"title": "短片标题", "shots": [{"title": "镜头短标题", "description": "画面内容描述", "motion": "运镜与人物动作", "dialogue": "台词或旁白，可为空字符串", "durationSec": 5}]}
2. shots 必须恰好 8 个，构成"开场-冲突-高潮-结尾"的完整叙事弧线。
3. description 必须包含对主角外观的固定描述（沿用用户给定的角色描述原文关键词），确保跨镜头角色一致。
4. motion 写清运镜（如"缓慢推近"、"侧面跟拍摇镜"）与人物动作，供图生视频模型使用。
5. durationSec 取 4 到 6 之间的整数；dialogue 每句不超过 30 字。`;

export async function generateStoryboard(
  logline: string,
  style: string,
  characterHint?: string,
): Promise<StoryboardDraft | null> {
  const user = `故事梗概：${logline}\n画风：${style}\n${characterHint ? `角色设定：${characterHint}` : ""}\n请输出分镜 JSON。`;
  const result = await chatJson<StoryboardDraft>(STORYBOARD_SYSTEM, user);
  if (!result || !Array.isArray(result.shots) || result.shots.length < 4) return null;
  return result;
}

/** 内置 mock 分镜：未配置 LLM 时使用，保证零配置可跑通全流程 */
export function mockStoryboard(logline: string, style: string): StoryboardDraft {
  const beats = [
    { title: "开场·世界", motion: "大远景缓慢横移，建立空间感" },
    { title: "主角登场", motion: "中景缓慢推近，主角抬头" },
    { title: "触发事件", motion: "特写急切跟随，意外发生" },
    { title: "下定决心", motion: "近景固定镜头，眼神变化" },
    { title: "冲突爆发", motion: "手持跟拍，快速移动" },
    { title: "低谷时刻", motion: "俯拍缓慢下降，静默氛围" },
    { title: "高潮反击", motion: "环绕运镜，动作爆发" },
    { title: "尾声·余韵", motion: "拉远升起，画面渐暗" },
  ];
  return {
    title: "未命名短片",
    shots: beats.map((b) => ({
      title: b.title,
      description: `${b.title}。${logline}。整体画风：${style}。`,
      motion: b.motion,
      dialogue: "",
      durationSec: 5,
    })),
  };
}
