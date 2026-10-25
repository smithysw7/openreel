"use client";

import { useCallback, useEffect, useState } from "react";
import { STYLE_PRESETS } from "@/lib/presets";
import type { Project, Shot } from "@/lib/types";

interface ConfigInfo {
  comfy: boolean;
  llm: boolean;
  local?: boolean;
  mockMode: boolean;
  backend?: "local" | "cloud" | "mock";
  backendLabel?: string;
  imageModel: string;
  videoModel: string;
}

interface RecentProject {
  id: string;
  title: string;
  logline: string;
  aspect: "16:9" | "9:16";
  updatedAt: string;
  hasActor: boolean;
  readyShots: number;
  totalShots: number;
  hasFilm: boolean;
}

type Step = 1 | 2 | 3;

async function api<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `请求失败（HTTP ${res.status}）`);
  return data;
}

/** 客户端压缩参考图，控制上传体积 */
async function fileToImageDataUrl(file: File, maxDim = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

const STATUS_BADGE: Record<Shot["status"], { text: string; cls: string }> = {
  pending: { text: "待拍摄", cls: "bg-neutral-800 text-neutral-400" },
  generating: { text: "生成中…", cls: "bg-amber-500/15 text-amber-400 animate-pulse" },
  ready: { text: "已完成", cls: "bg-emerald-500/15 text-emerald-400" },
  failed: { text: "失败", cls: "bg-red-500/15 text-red-400" },
};

export default function Studio() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "storyboard" | "character" | "shot" | "film">("");

  // 第 1 步：剧本
  const [logline, setLogline] = useState("");
  const [styleId, setStyleId] = useState<string>(STYLE_PRESETS[0].id);
  const [customStyle, setCustomStyle] = useState("");
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");

  // 第 2 步：选角
  const [actorName, setActorName] = useState("");
  const [actorDesc, setActorDesc] = useState("");
  const [refDataUrl, setRefDataUrl] = useState<string | null>(null);

  // 第 3 步：片场
  const [bgmDataUrl, setBgmDataUrl] = useState<string | null>(null);
  const [filmInfo, setFilmInfo] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  const fetchRecents = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { projects: RecentProject[] };
      setRecentProjects(data.projects ?? []);
    } catch {
      /* 忽略 */
    }
  }, []);

  async function openRecent(id: string) {
    setError(null);
    try {
      const data = await api<{ project: Project }>(`/api/project/${id}`, undefined, "GET");
      setProject(data.project);
      setStep(data.project.actor ? 3 : 1);
      setNotice(`已恢复项目：${data.project.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
    void fetchRecents();
    // 深链接：/?p=<项目ID> 直接恢复项目（也便于分享/录制）
    const pid = new URLSearchParams(window.location.search).get("p");
    if (pid) void openRecent(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProject = useCallback(async (id: string) => {
    try {
      const data = await api<{ project: Project }>(`/api/project/${id}`, undefined, "GET");
      setProject(data.project);
    } catch {
      /* 轮询失败忽略，下一轮再试 */
    }
  }, []);

  // 有镜头正在生成时轮询进度
  useEffect(() => {
    if (!project || !project.shots.some((s) => s.status === "generating")) return;
    const timer = setInterval(() => void refreshProject(project.id), 3000);
    return () => clearInterval(timer);
  }, [project, refreshProject]);

  const styleText =
    customStyle.trim() || STYLE_PRESETS.find((p) => p.id === styleId)?.look || "cinematic film still";

  async function createStoryboard() {
    setBusy("storyboard");
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ project: Project; usedLlm: boolean }>("/api/storyboard", {
        logline,
        style: styleText,
        aspect,
      });
      setProject(data.project);
      setNotice(data.usedLlm ? "分镜已生成（LLM）" : "分镜已生成（内置模板：未配置 LLM_API_KEY）");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function updateShotLocal(shotId: string, fields: Partial<Shot>) {
    setProject((p) =>
      p ? { ...p, shots: p.shots.map((s) => (s.id === shotId ? { ...s, ...fields } : s)) } : p,
    );
  }

  function patchShot(shotId: string, fields: Partial<Shot>) {
    if (!project) return;
    updateShotLocal(shotId, fields);
    void api<{ project: Project }>(`/api/project/${project.id}`, { shot: { id: shotId, ...fields } }, "PATCH").catch(
      () => {},
    );
  }

  async function generateCharacter() {
    if (!project) return;
    setBusy("character");
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ project: Project; warnings?: string[] }>("/api/character", {
        projectId: project.id,
        name: actorName,
        description: actorDesc,
        refImage: refDataUrl ?? undefined,
      });
      setProject(data.project);
      if (data.warnings?.length) setNotice(data.warnings.join("；"));
      else setNotice("演员卡已生成，该角色将注入每个镜头保证连戏");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function generateShot(shot: Shot) {
    if (!project) return;
    setBusy("shot");
    setError(null);
    try {
      await api(`/api/shot`, { projectId: project.id, shotId: shot.id });
      await refreshProject(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const anyGenerating = project?.shots.some((s) => s.status === "generating") ?? false;

  async function generateAllShots() {
    if (!project) return;
    // 逐镜头等待完成再拍下一个（服务端另有串行队列兜底）
    for (const shot of project.shots) {
      if (shot.status === "ready" || shot.status === "generating") continue;
      await generateShot(shot);
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const res = await fetch(`/api/project/${project.id}`, { cache: "no-store" });
          const data = (await res.json()) as { project?: Project };
          if (!data.project) continue;
          setProject(data.project);
          const cur = data.project.shots.find((s) => s.id === shot.id);
          if (cur && (cur.status === "ready" || cur.status === "failed")) break;
        } catch {
          /* 轮询失败继续等 */
        }
      }
    }
  }

  async function assembleFilm() {
    if (!project) return;
    setBusy("film");
    setError(null);
    setFilmInfo(null);
    try {
      const data = await api<{ project: Project; durationSec: number; subtitlesBurned: boolean; bgmMixed: boolean }>(
        "/api/film",
        { projectId: project.id, bgmDataUrl: bgmDataUrl ?? undefined },
      );
      setProject(data.project);
      setFilmInfo(
        `成片 ${data.durationSec.toFixed(1)} 秒 · ${data.subtitlesBurned ? "已烧录台词字幕" : "无台词字幕"} · ${
          data.bgmMixed ? "已混入 BGM" : "无 BGM"
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function restart() {
    setProject(null);
    setStep(1);
    setRefDataUrl(null);
    setBgmDataUrl(null);
    setFilmInfo(null);
    setNotice(null);
    setError(null);
    void fetchRecents();
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-amber-500/60";
  const btnCls =
    "rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40";
  const btnGhost =
    "rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500 disabled:opacity-40";

  const steps: { n: Step; label: string; enabled: boolean }[] = [
    { n: 1, label: "① 剧本分镜", enabled: true },
    { n: 2, label: "② 选角", enabled: !!project },
    { n: 3, label: "③ 片场成片", enabled: !!project?.actor },
  ];

  const readyCount = project?.shots.filter((s) => s.status === "ready").length ?? 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Open<span className="text-amber-500">Reel</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            一句话梗概 → 分镜 → 选角 → 连戏短片 · 开源版 AI 电影工作流（Open Source Higgsfield 竞赛作品）
          </p>
        </div>
        <div className="text-right text-xs">
          {config && (
            <span
              className={`inline-block rounded-full px-3 py-1 ${
                config.mockMode ? "bg-neutral-800 text-neutral-400" : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {config.mockMode
                ? "演示模式 · 未配置本地 ComfyUI / COMFY_API_KEY，生成占位画面"
                : config.backend === "local"
                  ? "真实生成 · 本地 ComfyUI（开源权重，零 credits）"
                  : `真实生成 · 云端 ${config.imageModel} / ${config.videoModel}`}
            </span>
          )}
          {project && (
            <div className="mt-2">
              <button className={btnGhost} onClick={restart}>
                开新项目
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="mb-6 flex gap-2">
        {steps.map((s) => (
          <button
            key={s.n}
            disabled={!s.enabled}
            onClick={() => setStep(s.n)}
            className={`rounded-lg px-4 py-2 text-sm transition ${
              step === s.n
                ? "bg-amber-500 font-medium text-black"
                : s.enabled
                  ? "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                  : "cursor-not-allowed bg-neutral-900 text-neutral-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
          {notice}
        </div>
      )}

      {/* ============ 第 1 步：剧本分镜 ============ */}
      {step === 1 && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
            <label className="mb-2 block text-sm font-medium">故事梗概（一句话到一段话都行）</label>
            <textarea
              className={`${inputCls} min-h-24`}
              data-testid="logline"
              placeholder="例：深夜便利店，一位失眠的店员发现每瓶饮料里都封存着一位陌生人的记忆。"
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">画风预设</label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setStyleId(p.id);
                        setCustomStyle("");
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs transition ${
                        styleId === p.id && !customStyle
                          ? "bg-amber-500 font-medium text-black"
                          : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  className={`${inputCls} mt-3`}
                  placeholder="或自定义画风（英文效果更好），如：1970s Hong Kong action film"
                  value={customStyle}
                  onChange={(e) => setCustomStyle(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">画幅</label>
                <div className="flex gap-2">
                  {(["16:9", "9:16"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAspect(a)}
                      className={`rounded-lg px-4 py-2 text-sm transition ${
                        aspect === a
                          ? "bg-amber-500 font-medium text-black"
                          : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {a === "16:9" ? "16:9 横屏" : "9:16 竖屏"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button className={`${btnCls} mt-5`} data-testid="generate-storyboard" disabled={busy !== "" || logline.trim().length < 4} onClick={createStoryboard}>
              {busy === "storyboard" ? "分镜生成中…" : "生成分镜（8 镜头）"}
            </button>
          </div>

          {!project && recentProjects.length > 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
              <h2 className="mb-3 text-sm font-medium text-neutral-300">最近项目（刷新页面后可从这里恢复）</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {recentProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openRecent(p.id)}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-left transition hover:border-amber-500/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.title || "未命名短片"}</span>
                      <span className="shrink-0 text-[11px] text-neutral-500">
                        {p.hasFilm ? "已成片" : `${p.readyShots}/${p.totalShots} 镜头`}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-500">{p.logline}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {project && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">
                分镜表 · {project.title}
                <span className="ml-3 text-xs font-normal text-neutral-500">
                  可直接编辑，失焦即保存；改完记得回来看效果
                </span>
              </h2>
              {project.shots.map((shot) => (
                <div key={shot.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-xs text-neutral-500">#{shot.index + 1}</span>
                    <input
                      className="flex-1 bg-transparent text-sm font-medium outline-none"
                      value={shot.title}
                      onChange={(e) => updateShotLocal(shot.id, { title: e.target.value })}
                      onBlur={(e) => patchShot(shot.id, { title: e.target.value })}
                    />
                    <span className="text-xs text-neutral-500">{shot.durationSec}s</span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <textarea
                      className={`${inputCls} min-h-16 text-xs`}
                      value={shot.description}
                      onChange={(e) => updateShotLocal(shot.id, { description: e.target.value })}
                      onBlur={(e) => patchShot(shot.id, { description: e.target.value })}
                      placeholder="画面内容"
                    />
                    <textarea
                      className={`${inputCls} min-h-16 text-xs`}
                      value={shot.motion}
                      onChange={(e) => updateShotLocal(shot.id, { motion: e.target.value })}
                      onBlur={(e) => patchShot(shot.id, { motion: e.target.value })}
                      placeholder="运镜与动作"
                    />
                  </div>
                  <input
                    className={`${inputCls} mt-2 text-xs`}
                    value={shot.dialogue ?? ""}
                    onChange={(e) => updateShotLocal(shot.id, { dialogue: e.target.value })}
                    onBlur={(e) => patchShot(shot.id, { dialogue: e.target.value })}
                    placeholder="台词 / 旁白（将作为字幕烧录）"
                  />
                </div>
              ))}
              <button className={btnCls} data-testid="goto-cast" onClick={() => setStep(2)}>
                下一步：选角 →
              </button>
            </div>
          )}
        </section>
      )}

      {/* ============ 第 2 步：选角 ============ */}
      {step === 2 && project && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
            <h2 className="mb-1 text-lg font-semibold">选角 · 创建你的 AI 演员</h2>
            <p className="mb-4 text-xs text-neutral-500">
              角色描述会注入每个镜头的生成 prompt，第一张定妆照会作为后续姿势的锚定参考图（开源版 Soul ID）。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <input
                  className={inputCls}
                  data-testid="actor-name"
                  placeholder="角色名，如：林小雨"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                />
                <textarea
                  className={`${inputCls} min-h-28`}
                  data-testid="actor-desc"
                  placeholder="外貌固定描述（越具体连戏越稳）：如：25 岁中国女性，齐肩黑发，左眉有一颗小痣，穿米色风衣，气质安静。"
                  value={actorDesc}
                  onChange={(e) => setActorDesc(e.target.value)}
                />
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">可选：上传参考图（一张即可）</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="text-xs text-neutral-400"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setRefDataUrl(await fileToImageDataUrl(f));
                    }}
                  />
                  {refDataUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={refDataUrl} alt="参考图" className="h-16 rounded-lg object-cover" />
                      <button className={btnGhost} onClick={() => setRefDataUrl(null)}>
                        移除
                      </button>
                    </div>
                  )}
                </div>
                <button className={btnCls} data-testid="generate-character" disabled={busy !== "" || actorDesc.trim().length < 4} onClick={generateCharacter}>
                  {busy === "character" ? "演员卡生成中…" : "生成演员卡（4 张定妆照）"}
                </button>
              </div>
              <div>
                {project.actor ? (
                  <div className="grid grid-cols-2 gap-2">
                    {project.actor.sheetImages.map((src) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img key={src} src={src} alt="定妆照" className="aspect-video w-full rounded-lg object-cover" />
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full min-h-40 place-items-center rounded-xl border border-dashed border-neutral-800 text-sm text-neutral-600">
                    定妆照将显示在这里
                  </div>
                )}
              </div>
            </div>
          </div>
          {project.actor && (
            <button className={btnCls} data-testid="goto-set" onClick={() => setStep(3)}>
              下一步：开拍 →
            </button>
          )}
        </section>
      )}

      {/* ============ 第 3 步：片场成片 ============ */}
      {step === 3 && project && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              片场 · {project.title}
              <span className="ml-3 text-xs font-normal text-neutral-500">
                {readyCount}/{project.shots.length} 镜头完成
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-neutral-400">
                BGM（可选）：
                <input
                  type="file"
                  accept="audio/*"
                  className="ml-1 text-xs text-neutral-400"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setBgmDataUrl(await fileToDataUrl(f));
                  }}
                />
              </label>
              <button className={btnGhost} data-testid="shoot-all" disabled={busy !== "" || anyGenerating} onClick={generateAllShots}>
                一键拍摄全部
              </button>
              <button
                className={btnCls}
                data-testid="assemble"
                disabled={busy !== "" || anyGenerating || readyCount < 2}
                onClick={assembleFilm}
              >
                {busy === "film" ? "成片拼装中…" : "一键成片"}
              </button>
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              project.aspect === "9:16" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-2"
            }`}
          >
            {project.shots.map((shot) => {
              const badge = STATUS_BADGE[shot.status];
              return (
                <div key={shot.id} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      #{shot.index + 1} {shot.title}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${badge.cls}`}>{badge.text}</span>
                  </div>
                  {shot.status === "ready" && shot.videoPath ? (
                    <video
                      src={shot.videoPath}
                      poster={shot.keyframePath}
                      controls
                      loop
                      muted
                      playsInline
                      className={`w-full rounded-lg bg-black object-cover ${
                        project.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video"
                      }`}
                    />
                  ) : shot.keyframePath ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={shot.keyframePath}
                      alt={`镜头 ${shot.index + 1} 关键帧`}
                      className={`w-full rounded-lg object-cover ${
                        project.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video"
                      }`}
                    />
                  ) : (
                    <div
                      className={`grid w-full place-items-center rounded-lg border border-dashed border-neutral-800 text-xs text-neutral-600 ${
                        project.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video"
                      }`}
                    >
                      {shot.status === "generating" ? "正在生成画面…" : "尚未拍摄"}
                    </div>
                  )}
                  {shot.error && <p className="mt-2 text-xs text-red-400">{shot.error}</p>}
                  <button
                    className={`${btnGhost} mt-2 w-full`}
                    disabled={busy === "shot" || anyGenerating}
                    onClick={() => generateShot(shot)}
                  >
                    {shot.status === "ready" ? "重拍这个镜头" : shot.status === "failed" ? "重试" : "拍摄"}
                  </button>
                </div>
              );
            })}
          </div>

          {project.filmPath && (
            <div className="rounded-2xl border border-amber-900/50 bg-neutral-900/60 p-6">
              <h3 className="mb-2 text-lg font-semibold">成片 · {project.title}</h3>
              {filmInfo && <p className="mb-3 text-xs text-neutral-400">{filmInfo}</p>}
              <video
                data-testid="film-player"
                src={project.filmPath}
                controls
                autoPlay
                className={`w-full rounded-lg bg-black ${project.aspect === "9:16" ? "mx-auto max-w-xs aspect-[9/16]" : "aspect-video"}`}
              />
              <a
                className={`${btnCls} mt-4 inline-block`}
                href={project.filmPath}
                download={`${project.title || "openreel"}.mp4`}
              >
                下载成片
              </a>
            </div>
          )}
        </section>
      )}

      <footer className="mt-16 border-t border-neutral-900 pt-6 text-xs text-neutral-600">
        OpenReel · MIT License · 为「Open Source Higgsfield · Comfy」竞赛构建 · 生成管线基于 Comfy Router API
        （FLUX 3 关键帧 + MiniMax H3 视频）
      </footer>
    </main>
  );
}
