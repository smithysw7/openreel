#!/usr/bin/env node
/**
 * 一键生成一个完整的演示项目：分镜 → 选角 → 8 个镜头全部拍摄（带台词字幕）→ 成片。
 * 用法：先启动服务，然后 node scripts/demo-seed.mjs [baseUrl]
 * 演示模式下全程使用占位画面，不消耗任何 API 额度。
 */
const base = process.argv[2] ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const { project } = await api("/api/storyboard", {
  logline: "雨夜天台，一个替身演员决定为自己演一次主角",
  style: "black and white arthouse film still, high contrast chiaroscuro lighting, 35mm grain, melancholic atmosphere",
  aspect: "16:9",
});
console.log(`[1] 分镜: ${project.id} · ${project.title}`);

const DIALOGUES = {
  "shot-1": "旁白：这是这座城市最安静的地方，三百米高空。",
  "shot-2": "陈默：我演了十年别人，今晚换我自己。",
  "shot-4": "旁白：风很大，但没有退路。",
  "shot-7": "陈默：Action。",
  "shot-8": "旁白：这一次，镜头属于他自己。",
};
for (const [shotId, dialogue] of Object.entries(DIALOGUES)) {
  await api(`/api/project/${project.id}`, { shot: { id: shotId, dialogue } }, "PATCH");
}

await api("/api/character", {
  projectId: project.id,
  name: "陈默",
  description: "32 岁中国男性，寸头，左颧骨有一道浅疤，穿深灰色连帽衫，眼神疲惫而倔强",
});
console.log("[2] 选角完成");

for (const shot of project.shots) {
  await api("/api/shot", { projectId: project.id, shotId: shot.id });
  for (;;) {
    await sleep(1500);
    const { project: p } = await api(`/api/project/${project.id}`, undefined, "GET");
    const cur = p.shots.find((s) => s.id === shot.id);
    if (cur.status === "ready") {
      console.log(`[3] ${shot.id} 完成 (${cur.durationSec}s)`);
      break;
    }
    if (cur.status === "failed") throw new Error(`${shot.id} 失败: ${cur.error}`);
  }
}

const film = await api("/api/film", { projectId: project.id });
console.log(
  `[4] 成片: ${film.project.filmPath} | ${film.durationSec.toFixed(1)}s | 字幕=${film.subtitlesBurned} BGM=${film.bgmMixed}`,
);
console.log(`\n项目 ID: ${project.id}（在首页"最近项目"里打开即可查看）`);
