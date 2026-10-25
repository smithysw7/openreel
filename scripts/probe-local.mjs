#!/usr/bin/env node
/**
 * 本地 ComfyUI 管线探测：
 *   node scripts/probe-local.mjs          → 提交 Z-Image 出图 + H3 图生视频，等待完成并下载产物到 .data/probe/
 * 用途：验证本地工作流模板能跑通，并实测单次生成耗时。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:8188";
const OUT = path.resolve(".data/probe");
fs.mkdirSync(OUT, { recursive: true });

function fill(template, vars) {
  // 深度遍历替换：整值占位符返回原始类型（数字保持数字），避免字符串替换破坏 JSON
  const walk = (v) => {
    if (typeof v === "string") {
      const whole = /^\{\{([A-Z_]+)\}\}$/.exec(v);
      if (whole && vars[whole[1]] !== undefined) return vars[whole[1]];
      return v.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k2, v2]) => [k2, walk(v2)]));
    return v;
  };
  return walk(template);
}

async function submit(workflow) {
  const res = await fetch(`${BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`提交失败 ${res.status}: ${JSON.stringify(body).slice(0, 800)}`);
  return body.prompt_id;
}

async function waitDone(id, label, timeoutMs = 40 * 60_000) {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label} 超时`);
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${BASE}/history/${id}`);
    const hist = (await res.json().catch(() => ({})))[id];
    if (!hist) continue;
    const status = hist.status ?? {};
    if (status.status_str === "error" || status.completed === true) {
      if (status.status_str === "error") {
        const msgs = (status.messages ?? []).filter((m) => m[0] === "execution_error").map((m) => JSON.stringify(m[1]).slice(0, 400));
        throw new Error(`${label} 执行出错: ${msgs.join("; ") || JSON.stringify(status).slice(0, 400)}`);
      }
      return { hist, elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
    }
    process.stdout.write(`  ${label} 运行中 ${((Date.now() - t0) / 1000 / 60).toFixed(1)}min\r`);
  }
}

async function download(hist, label, outBase) {
  let n = 0;
  for (const nodeOut of Object.values(hist.outputs ?? {})) {
    for (const key of ["images", "videos", "gifs", "video"]) {
      for (const item of nodeOut[key] ?? []) {
        const params = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder ?? "", type: item.type ?? "output" });
        const res = await fetch(`${BASE}/view?${params}`);
        if (!res.ok) throw new Error(`下载失败 ${res.status}: ${item.filename}`);
        const ext = item.filename.includes(".") ? item.filename.split(".").pop() : "bin";
        const dest = path.join(OUT, `${outBase}-${n++}.${ext}`);
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        console.log(`  ${label} 产物: ${dest} (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
      }
    }
  }
  return n;
}

// ---- 1) Z-Image 出图 ----
console.log("[1] 提交 Z-Image Turbo 出图…");
const zTpl = JSON.parse(fs.readFileSync("workflows/z_image_t2i.json", "utf8"));
const zWf = fill(zTpl, {
  PROMPT: "a lone stuntman in a dark hooded jacket standing on a rainy rooftop at night, city lights bokeh behind him, cinematic film still, 35mm, high contrast",
  SEED: Math.floor(Math.random() * 1e9),
});
const zId = await submit(zWf);
console.log("  prompt_id:", zId);
const zDone = await waitDone(zId, "Z-Image");
console.log(`  Z-Image 完成，耗时 ${zDone.elapsed}s`);
await download(zDone.hist, "Z-Image", "zimage");

// ---- 2) H3 图生视频（用刚出的图当首帧）----
console.log("[2] 上传关键帧并提交 MiniMax H3 图生视频（首次需加载 19.5GB 模型，请耐心）…");
const keyframe = fs.readdirSync(OUT).find((f) => f.startsWith("zimage-"));
if (!keyframe) throw new Error("Z-Image 没有产出关键帧，无法继续 i2v");

// 上传首帧到 ComfyUI input 目录
const upForm = new FormData();
upForm.append("image", new Blob([fs.readFileSync(path.join(OUT, keyframe))], { type: "image/png" }), keyframe);
upForm.append("type", "input");
const upRes = await fetch(`${BASE}/upload/image`, { method: "POST", body: upForm });
if (!upRes.ok) throw new Error(`上传失败 ${upRes.status}: ${(await upRes.text()).slice(0, 300)}`);
const upInfo = await upRes.json();
console.log("  已上传:", upInfo.name);

const h3Tpl = JSON.parse(fs.readFileSync("workflows/h3_i2v.json", "utf8"));
const h3Wf = fill(h3Tpl, {
  PROMPT: "the man turns his head slowly toward the camera, rain falling, cinematic, subtle camera push-in",
  WIDTH: 960,
  HEIGHT: 544,
  LENGTH: 124,
  SEED: Math.floor(Math.random() * 1e9),
  SHOT: "probe",
});
h3Wf["16"] = { class_type: "LoadImage", inputs: { image: upInfo.name } };
h3Wf["6"].inputs.first_frame = ["16", 0];

const h3Id = await submit(h3Wf);
console.log("  prompt_id:", h3Id);
const h3Done = await waitDone(h3Id, "H3");
console.log(`  H3 完成，耗时 ${h3Done.elapsed}s`);
const files = await download(h3Done.hist, "H3", "h3");

console.log(`\n全部完成 ✅ 共 ${1 + files} 个产物在 ${OUT}`);
console.log("请人工查看 .data/probe/ 里的图片和视频质量。");
