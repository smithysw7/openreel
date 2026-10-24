#!/usr/bin/env node
/**
 * 端到端冒烟测试：分镜 → 选角 → 拍摄 2 个镜头 → 成片。
 * 用法：先启动服务（npm run dev 或 npm run start），然后 node scripts/smoke.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";
const aspect = process.argv[3] === "9:16" ? "9:16" : "16:9";

async function api(path, body, method = "POST") {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${data.error ?? ""}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const config = await api("/api/config", undefined, "GET");
console.log(`[1] config: mockMode=${config.mockMode} image=${config.imageModel} video=${config.videoModel}`);

const { project, usedLlm } = await api("/api/storyboard", {
  logline: "深夜便利店，失眠的店员发现每瓶饮料里封存着陌生人的记忆",
  style: "black and white arthouse film still, high contrast",
  aspect,
});
console.log(`[2] storyboard: id=${project.id} shots=${project.shots.length} usedLlm=${usedLlm} aspect=${aspect}`);

const { project: casted, warnings } = await api("/api/character", {
  projectId: project.id,
  name: "林小雨",
  description: "25 岁中国女性，齐肩黑发，左眉有一颗小痣，穿米色风衣",
});
console.log(`[3] character: sheets=${casted.actor?.sheetImages.length} warnings=${warnings?.length ?? 0}`);

for (const shotId of ["shot-1", "shot-2"]) {
  await api("/api/shot", { projectId: project.id, shotId });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1500);
    const { project: p } = await api(`/api/project/${project.id}`, undefined, "GET");
    const shot = p.shots.find((s) => s.id === shotId);
    if (shot.status === "ready") {
      console.log(`[4] ${shotId}: ready, ${shot.durationSec}s, video=${shot.videoPath}`);
      ready = true;
      break;
    }
    if (shot.status === "failed") throw new Error(`${shotId} 生成失败: ${shot.error}`);
  }
  if (!ready) throw new Error(`${shotId} 超时未完成`);
}

const film = await api("/api/film", { projectId: project.id });
console.log(
  `[5] film: ${film.project.filmPath} | ${film.durationSec.toFixed(1)}s | subs=${film.subtitlesBurned} bgm=${film.bgmMixed}`,
);
const head = await fetch(`${base}${film.project.filmPath}`);
console.log(`[6] 成片可访问: HTTP ${head.status} ${head.headers.get("content-type")}`);
console.log("\n全部通过 ✅");
