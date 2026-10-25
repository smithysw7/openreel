# OpenReel 进度报告

> 更新时间：10/26 · 状态：**🏆 已完成正式提交（Final Submission Form 已提交成功）**

## 最终成果

**项目 `bcc1b28e`（《雨夜天台》，黑白文艺短片）：**
- 8 个镜头全部由本机生成：Z-Image Turbo 出关键帧（20 秒/张）→ 本地 MiniMax H3 图生视频（约 11 分钟/镜头，960×544×124 帧，带原生音频）；
- 角色连戏实测有效：同一角色（寸头、左颧骨浅疤、深灰连帽衫）贯穿 8 个镜头；
- 成片 41.5 秒，台词字幕烧录正确，AAC 音轨正常；
- 总耗时约 95 分钟（纯本地算力，零 credits 消耗）。

**参赛物料全部为真实版：**
- `demo/openreel-demo.webm`（34 秒录屏：成片播放 → 分镜 → 选角 → 片场）；
- `demo/teaser-5s.mp4`（5 秒预告片）；
- `docs/images/` 三张截图（真实模式徽标 + 真实画面）。

## 10/26 晚补充：旁白配音（回应看片反馈）

- 反馈：旁白只有字幕没有人读；高潮台词「Action。」缺铺垫。
- 修复：接入本地 OmniVoice TTS（VoiceDesignTTS，2.45GB 权重在本机）——旁白用「male, middle-aged, low pitch」，陈默用「male, young adult, moderate pitch」，6 条台词 **4 秒/条** 全部本地合成；
- 台词补写：低谷时刻新增铺垫线「没有人肯给我一个特写。那我自己来。」，高潮的「Action。」不再突兀；
- 拼装管线升级：旁白按镜头起始时间精确混入（adelay 对齐），H3 原生环境音自动压低至 45%；
- 实测：旁白位置音量 -9dB（人声清晰）vs 无台词处 -24dB（环境铺垫），成片已重新拼装并重录 demo。
- 踩坑记录：ComfyUI 音频产物键名是 audio（下载器原先只收集 videos/images，导致 TTS 跑了但文件没落盘）。

## 技术路线（已验证）

- **Open Weights Only 赛道资格达成**：生成全部在本地开源权重上完成（Z-Image Turbo + MiniMax H3），
  不经任何闭源 API；**Built with MiniMax H3 加成资格达成**（H3 为核心视频模型）；
- 应用三后端自动选择：`local → cloud → mock`（`OPENREEL_BACKEND` 可强制）；
- 本地适配层 `src/lib/comfy_local.ts`：ComfyUI Server API（/prompt → /history → /view，首帧 /upload/image）；
- 工作流模板：`workflows/z_image_t2i.json`（官方模板转换）+ `workflows/h3_i2v.json`（官方 i2v 校正版）。

## 实测性能参考（RTX 5060 Ti 16GB + 32GB RAM）

| 项目 | 耗时 |
| --- | --- |
| Z-Image Turbo 1280×720 单张 | 约 20 秒 |
| MiniMax H3 960×544×124f 单镜头（含音频） | 约 11 分钟 |
| 8 镜头全片一轮（含成片拼装） | 约 95 分钟 |
| ffmpeg 成片拼装（8 镜头 + 字幕） | 约 1 分钟 |

## API Key 事项

- Key 已配置进 `.env`（gitignore 内），云端 Router 认证验证通过；
- 云端账户余额 0（免费 credits 未发放，推测前 200 名已满），云端路线暂时不可用——**不影响任何本地功能**；
- 若之后充值或免费 credits 到账，重启应用即自动可用云端后端（用于对比或切换）。

## 提交记录（10/26）

- ✅ Final Submission Form 已提交（12 题全部填写，Typeform 确认页已显示）
- ✅ GitHub 公开仓库：https://github.com/smithysw7/openreel
- ✅ Demo 视频：https://github.com/smithysw7/openreel/raw/main/demo/openreel-demo.webm
- ✅ X 社交帖：https://x.com/ChigoQI/status/2114360365467480182
- ✅ 报名赛道：Open Weights Only + Best Overall，MiniMax H3 加成资格

## 后续时间线

- **11/6**：获奖者公布（comfy.org/hub 展示获奖作品）
- 期间可以：继续用本地管线迭代短片（零成本）、在 X 上发成片片段引流、关注 Discord 公告
