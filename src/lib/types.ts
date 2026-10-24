export type Aspect = "16:9" | "9:16";

export type ShotStatus = "pending" | "generating" | "ready" | "failed";

export interface Shot {
  id: string;
  index: number;
  title: string;
  /** 画面描述：给关键帧/文生视频用的完整画面内容 */
  description: string;
  /** 运镜与动作：镜头怎么动、人物做什么 */
  motion: string;
  /** 台词（用于字幕，可为空） */
  dialogue?: string;
  durationSec: number;
  status: ShotStatus;
  keyframePath?: string;
  videoPath?: string;
  error?: string;
}

export interface ActorCard {
  id: string;
  name: string;
  /** 外貌锚定描述：会注入每一个镜头的生成 prompt，保证连戏 */
  description: string;
  /** 统一画风块：同样注入每个镜头 */
  styleBlock: string;
  sheetImages: string[];
  refImagePath?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  logline: string;
  style: string;
  aspect: Aspect;
  actor?: ActorCard;
  shots: Shot[];
  bgmPath?: string;
  filmPath?: string;
  warnings?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoryboardShotDraft {
  title: string;
  description: string;
  motion: string;
  dialogue?: string;
  durationSec?: number;
}

export interface StoryboardDraft {
  title: string;
  shots: StoryboardShotDraft[];
}
