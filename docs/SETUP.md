> Note: detailed setup & troubleshooting guide in Chinese. The README covers the English quick start.

# OpenReel 配置与排障手册

## 1. 前置要求

- **Node.js 22+**（`node --version`）
- **ffmpeg + ffprobe** 并加入 PATH（`ffmpeg -version`）。Windows 推荐用 gyan.dev 的 full build：
  下载后解压，把 `bin` 目录加入系统 PATH。字幕烧录依赖 libass（gyan full build 自带）。

## 2. 安装与启动

```bash
npm install
cp .env.example .env    # Windows PowerShell: Copy-Item .env.example .env
npm run dev
```

打开 http://localhost:3000。**不配置任何 Key 也能跑通全流程**（演示模式，占位画面），
先熟悉「剧本 → 选角 → 片场」的产品闭环，再配置真实生成。

## 3. 配置 Comfy Router API（真实生成）

1. 注册 [platform.comfy.org](https://platform.comfy.org)，创建 API Key
   （竞赛前 200 名报名可领免费 credits，先去 [报名](https://comfy.org/open-source-higgsfield)）。
2. 写入 `.env`：`COMFY_API_KEY=...`
3. 查询有效模型 ID 并按需修改：

```bash
npm run models -- flux      # 找 FLUX 3 的确切 ID
npm run models -- minimax   # 找 MiniMax H3 的确切 ID
```

把查到的 ID 填入 `OPENREEL_IMAGE_MODEL` / `OPENREEL_VIDEO_MODEL`。
竞赛加分要求：FLUX 加成需 FLUX 3 为图像核心；MiniMax H3 加成需 H3 为视频核心。

### 调用模型时的常见错误

| 现象 | 原因与处理 |
| --- | --- |
| 402 `insufficient_credits` | 账户没额度，先充值或领免费 credits |
| 422 校验错误 | 该模型入参字段与默认不同。`npm run models <model_id>` 看 openapi.json，对照修改 `src/lib/comfy.ts` 里 `generateImage` / `generateVideo` 的 body |
| 429 `concurrency_limit_exceeded` | 并发超限，稍等重试；一键拍摄全部是串行的，不会触发 |
| 生成超时 | 视频任务偶尔排队久，直接对失败镜头点"重试" |

## 4. 配置分镜 LLM（可选）

任何 OpenAI 兼容接口都可以，例如智谱：

```env
LLM_API_KEY=你的key
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4.6
```

不配置则使用内置 8 镜头模板分镜（结构完整，可用编辑功能改写）。

## 5. 数据与产物位置

- 项目状态：`.data/projects/<id>.json`
- 生成的媒体：`.data/assets/<projectId>/`（关键帧、镜头视频、成片）
- Comfy Router 返回的媒体 URL 有 12–24 小时时效，应用会**立即下载**到本地，不依赖签名 URL 长期有效。

## 6. 竞赛提交清单

- [ ] GitHub 公开仓库：代码 + MIT License + 本 README（评委要求 OSS 许可与安装说明）
- [ ] Demo 视频：真实操作录屏，展示「一句话 → 成片」全过程（不求精美，评委看重做法）
- [ ] 提交表单：竞赛页 Typeform
- [ ] **截止：10/30 9:00 AM PT（北京时间 10/31 00:00）**，别卡最后一晚

## 7. Windows 注意事项

- ffmpeg 滤镜里的 Windows 路径已做转义（`C\:/...`），成片失败时先确认 ffmpeg 可用；
- 端口占用：`npm run dev -- -p 3001`；
- `.data/` 不要提交进 git（已在 .gitignore）。
