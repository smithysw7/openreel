# 竞赛提交材料清单（Final Submission Form 逐题答案稿）

> 表单：<https://form.typeform.com/to/V1dSQrkS> · 截止 10/30 9:00 AM PT（北京时间 10/31 00:00）
> 标 ⚠️ 的必须由你本人完成；其余可直接复制粘贴。表单共 12 题，约 2 分钟填完。

## 官方要求（已核实，来自竞赛页与提交表单原文）

- **演示视频**：URL 形式提交，**2 分钟以内**，"show us your build in action and how you built it"；
  冲 Most Innovative 的话视频里要说明为什么有创新性。官方明确"不评审视频剪辑水平"。
- **没有"5 秒演示"要求**——竞赛页顶部的 "00:05" 是截止倒计时（剩 5 天），不是视频时长。
- **GitHub 仓库**：必须公开、含开源许可证与安装说明（我们的 README/LICENSE 已满足）。
- **Live link**（可选但强烈建议）：评审会用它跑 5–10 次。
- **社交帖**：带 #OpenSourceHiggsfield 标签（X / IG / Reddit / TikTok 等）。

## 逐题答案稿

**Q1 Tell us about yourself** ⚠️
- Name: 你的名字
- Comfy app Email: 你注册 platform.comfy.org 用的邮箱
- Country: China（或你所在地区）

**Q2 Share your username(s)** ⚠️（选填，不影响评审）
- Social handles / Discord / Reddit：你的账号，没有就留空

**Q3 How familiar were you with ComfyUI before this challenge?** ⚠️（如实选）

**Q4 Tell us about your project**
- Project name/title: `OpenReel — 开源 AI 短片工作室`
- One-line description (≤100 字符):
  `One logline in, a character-consistent short film out — storyboard, casting, shots, cut. On Comfy.`（98 字符）

**Q5 Submission links**
- GitHub repo URL ⚠️：建好 GitHub 公开仓库推送后填
  （推送步骤：`git remote add origin git@github.com:<你>/openreel.git && git push -u origin master`）
- Demo video URL ⚠️：上传 `demo/openreel-demo.webm`（53 秒，已达标 <2 分钟）到 YouTube/Bilibili 后填链接；
  **配了 API Key 之后建议重录一版真实生成的**（见下方脚本提纲）
- Live link（可选）：如需提供，跑 `npm run start` 后用隧道工具（如 `npx localtunnel --port 3000`）生成公网地址
- Social post link ⚠️：发一条带 #OpenSourceHiggsfield 的帖文后填

**Q6 Which parts of ComfyUI did you use?**
```
Comfy Router API (api.comfy.org) as the generation backend — deployed-model endpoints called
from a Next.js app. Also ships ComfyUI API-format workflow templates (workflows/) for a fully
local, open-weights route (FLUX 3 + Wan image-to-video) runnable in the ComfyUI desktop app.
```

**Q7 List all generative models used?**
```
bfl/flux-3-image (keyframes + character reference sheets), minimax/minimax-h3 (image-to-video,
first-frame conditioned). Optional local route: FLUX 3 + Wan 2.1 i2v (open weights). Storyboard
LLM: any OpenAI-compatible chat model (e.g. GLM).
```

**Q8 Other tools or techniques used**
```
Character consistency without closed platforms: text anchoring (fixed appearance block injected
into every shot prompt) + image anchoring (first character sheet as reference image for all
keyframes) + locked style block. ffmpeg pipeline: per-clip normalize → concat → burned dialogue
subtitles → BGM mix. Next.js 16 app, file-based project store, MIT licensed.
```

**Q9 Which category or categories does your submission best fit?**
```
Best Overall; Built with FLUX (FLUX 3 core); Built with MiniMax H3 (H3 core video model).
```

**Q10 Is your stack fully open?**
```
Partially. The app, prompt/reference-anchoring pipeline and workflow templates are MIT open
source. The default generation stack uses hosted partner models (FLUX 3, MiniMax H3). A fully
open-weights configuration (local ComfyUI + FLUX/Wan) is included under workflows/ and can be
swapped in without changing the product layer.
```

**Q11 Agreements** ⚠️：勾选

**Q12 Anything else you want the judges to know?**
```
Higgsfield's stack is Soul Cast + Soul ID + Soul Cinema; OpenReel rebuilds all three ideas in
the open: a casting page that turns one description into a reusable AI actor card, an
anchor-and-reference consistency mechanism instead of a closed identity model, and a full
script-to-screen pipeline (logline → storyboard → cast → shots → subtitled, scored cut). It
runs end-to-end with zero API keys in demo mode, so judges can try the complete flow before
spending any credits.
```

## 真实版 Demo 视频录制提纲（配好 Key 后，<2 分钟）

1. （0:00–0:15）开场一句话 + 粘贴梗概，点"生成分镜"，展示 8 镜头分镜表
2. （0:15–0:40）选角：填描述 → 生成演员卡，强调"第一张定妆照会成为所有镜头的锚定参考图"
3. （0:40–1:10）片场：一键拍摄全部，挑 2 个镜头展示重拍；贴出同一角色跨镜头对比
4. （1:10–1:30）一键成片，播放最终短片（字幕 + BGM）
5. （1:30–2:00）收尾：代码结构一屏（lib/comfy.ts + workflows/）+ 一句"为什么创新"（锚定机制开源、零黑盒）
   - 录屏方式：`demo/` 里的录制流程已验证；或用 OBS 手动录
