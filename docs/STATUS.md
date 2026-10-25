# OpenReel 进度报告

> 更新时间：10/25 深夜 · 状态：**✅ 全链路完成——第一部全本地、全开源的真实短片已产出**

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

## 你回来后要做的（只剩发布动作）

1. **看成片**：首页"最近项目"打开《未命名短片》（或深链接 `/?p=bcc1b28e`），播放 41.5 秒真实短片；
2. **不满意就重拍**：片场视图每个镜头有"重拍"按钮（本地生成零成本）；
3. **GitHub**：建公开仓库 → `git remote add origin ...` → `git push`（本地已有提交）;
4. **上传视频**：`demo/openreel-demo.webm`（34 秒，<2 分钟达标）传 YouTube/Bilibili，链接填入表单；
5. **填表提交**：逐题答案在 `docs/SUBMISSION.md`，**10/31 00:00（北京时间）前**；
6. （可选）发一条带 #OpenSourceHiggsfield 的社交帖。

## 已知边界

- 本地单镜头约 11 分钟：挂机跑即可，"一键拍摄全部"是串行的；
- H3 本地输出 960×544：评审足够，盘里有 upscale 模型可后续放大；
- 云端路线余额 0 时 402——预期行为，不影响本地；
- 本地生成需要本地 ComfyUI 在跑（`http://127.0.0.1:8188`），关机后下次开机需重新启动 ComfyUI。

## 历史过程记录（squash 前可留档）

- 第一轮：Next.js 骨架、云端 Router 客户端（按官方 schema 核对 `bfl/flux-3-image` / `minimax/minimax-h3`）、
  三步向导 UI、ffmpeg 拼装管线、mock 演示模式、并发覆盖 bug 修复、提交表单逐题答案稿；
- 第二轮：连戏锚定回退（无参考图时用第一张定妆照）、占位画面标签、深链接、错误路径验证；
- 第三轮：本地路线侦察（模型库盘点 + ComfyUI 启动 + 节点验证）→ 本地适配层实现 → 真实生成全链路验证。
