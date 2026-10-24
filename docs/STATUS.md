# OpenReel 夜间进度报告

> 生成时间：2026-10-25 凌晨 · 状态：**可运行，等待配置真实 API Key**

## 昨晚完成了什么

1. **按官方 schema 修正了生成客户端**（最重要）
   - 查到了 Comfy Router 上两个模型的官方入参 schema 并逐字段核对：
     - 图像 `bfl/flux-3-image`：`prompt` / `aspect_ratio` / `resolution` / `images`（参考图数组）；
       该模型 schema 为 `additionalProperties: false`，之前多发的 `width/height/content` 会导致 422，已修正；
       输出图像 URL 在 `result.sample`（24h 时效）。
     - 视频 `minimax/minimax-h3`：`content`（text + `first_frame` 角色）/ `duration`（4–15 秒）/ `resolution`（`768P`/`2K`）/ `ratio`；
       之前默认发的 `720p` 不是合法值，已改为 `768P`；输出视频 URL 在 `task.content.url`（12h 时效）。
   - 也就是说：**填上 Key 后，请求体第一次发出去就是对的**，不用再踩 422 排障的坑。

2. **新增「最近项目」恢复功能**：刷新页面不再丢项目，首页可从"最近项目"一键恢复（`GET /api/projects`）。

3. **修复两个并发 bug**（昨晚 UI 实测时发现）：
   - 8 个镜头任务并发读改写项目 JSON 互相覆盖状态 → 服务端加了串行任务队列（顺带避免真实模式下触发 Router 429）；
   - 每次状态变更现在都基于最新项目快照写入。

4. **资源清理**：成片只保留最近 2 个；拼装临时目录每次清空；不会无限占盘。

5. **验证**：
   - `npm run build` 通过；
   - `scripts/smoke.mjs` 在 **16:9 与 9:16** 两个画幅下全部通过（分镜 → 选角 → 拍摄 → 成片 → 下载 200）；
   - 浏览器里完整走通三步流程（截图见 README）。

6. **竞赛物料**：
   - `docs/images/`：3 张界面截图（已嵌入 README）；
   - `demo/openreel-demo.webm`：52 秒完整操作录屏（演示模式），**竞赛 demo 视频的草稿**——配置 Key 后重录一版真实生成的即可；
   - `scripts/demo-seed.mjs`：一键生成完整演示项目（不消耗 API 额度）。

7. **仓库**：已 `git init` 并完成首次本地提交（未推送，推送前你确认 remote）。

## 你起床后要做的（按顺序）

1. **报名**：竞赛页 Typeform（前 200 名有免费 Comfy credits）→ https://comfy.org/open-source-higgsfield
2. **配置**：`cp .env.example .env`，填 `COMFY_API_KEY`（platform.comfy.org 获取）和任一 OpenAI 兼容 LLM 的 Key；
3. **验证连戏**：`npm run dev` → 随便拍一个项目 → 重点看同一角色跨镜头的脸是否稳定（这是最大技术风险）；
4. **重录 demo**：真实生成一版 40 秒短片，录屏替换 `demo/openreel-demo.webm`；
5. **推送**：建 GitHub repo → `git remote add origin ...` → `git push`；
6. **提交**：按 `docs/SETUP.md` 第 6 节清单，**10/30 9:00 AM PT（北京时间 10/31 00:00）前**。

## 已知边界（MVP 范围，非 bug）

- 演示模式的画面是 ffmpeg 占位图/测试图（产品闭环演示用）；
- 一键拍摄全部是串行的（8 镜头 ≈ 8 次真实生成时长），真实模式下需要耐心；
- Router 媒体 URL 12–24h 过期，应用会立即下载到 `.data/assets/`，不受影响。
