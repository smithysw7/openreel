# Workflows（本地生成模板 + Open Weights 路线）

应用内置三种生成后端（`OPENREEL_BACKEND=auto|local|cloud|mock`，默认 auto 自动探测）：

| 后端 | 图像 | 视频 | 花费 |
| --- | --- | --- | --- |
| `local`（默认优先） | Z-Image Turbo | MiniMax H3（本地开源权重） | 零 credits |
| `cloud` | bfl/flux-3-image | minimax/minimax-h3（云端） | Comfy credits |
| `mock` | ffmpeg 占位图 | ffmpeg 占位视频 | 零 |

auto 逻辑：本地 ComfyUI（127.0.0.1:8188）可达 → local；否则配了 `COMFY_API_KEY` → cloud；否则 mock。

## 运行时模板（应用实际使用）

| 文件 | 用途 | 说明 |
| --- | --- | --- |
| `z_image_t2i.json` | 关键帧/定妆照（Z-Image Turbo，8 步采样） | 基于 ComfyUI 官方模板转换；`lumina2` 型 CLIPLoader + AuraFlow shift 3 |
| `h3_i2v.json` | 关键帧 → 视频（本地 MiniMax H3，首帧注入 + 原生音频） | 基于官方 `ALLinONE-MinimaxH3/workflows/i2v.json`，模型名已按本机权重校正 |

这两个文件在运行时被 `src/lib/comfy_local.ts` 读取并参数化（prompt / 宽高 / 帧数 / 种子 / 文件名），
通过 ComfyUI Server API（`POST /prompt` → `/history` → `/view`，首帧经 `/upload/image` 上传）执行。

## 前置条件（本机已满足）

1. ComfyUI（v0.38+）监听 `127.0.0.1:8188`（可用 `OPENREEL_LOCAL_COMFY` 改地址）；
2. 模型目录通过 `extra_model_paths.yaml` 挂载，需要以下权重（本机 D 盘模型库已齐）：
   - `diffusion_models/`：`z_image_turbo_bf16`、`MiniMax_H3_FL2VA_pruned_int8_convrot`
   - `text_encoders/`：`qwen_3_4b`（Z-Image）、`qwen3vl_32b_minimax_h3_nvfp4_awq`（H3）
   - `vae/`：`ae`（Z-Image）、`minimax_h3_video_vae_fp16`、`minimax_h3_audio_vae_fp32`
3. 节点包：`ComfyUI-ALLinONE-MinimaxH3`（H3 图生视频）。

## 实测参考（RTX 5060 Ti 16GB + 32GB RAM）

- Z-Image Turbo 1280×720 单张：约 20 秒
- MiniMax H3 960×544×124 帧（约 5.2 秒，含原生音频）：约 11 分钟（显存 15.4GB，动态换流）

## Open Weights 纯本地参赛

以上 local 路线即 "Open Weights Only" 赛道的完整实现：生成全部在本地开源权重上完成，
不经任何闭源 API。`cloud` 路线保留用于对比与 "Built with FLUX/MiniMax H3" 云端加成的备选。
