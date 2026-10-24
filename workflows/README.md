# Workflows 模板（Open Weights 路线）

这两个文件是**起点模板**，用于本地 / 自托管 ComfyUI 路线（即竞赛的 "Open Weights Only" 方向）。
应用默认走 Comfy Router API（云端、按量计费）；如果你想全开源权重运行，按下面步骤替换：

1. 在本地 ComfyUI（前端）里打开本目录的 JSON 作为参考（`{{XXX}}` 是占位符，需替换）。
2. 把模型文件名换成你实际下载的权重（FLUX 3 / Wan 2.1 / Wan 2.2 等）。
3. 按自己的节点组合调整后，在前端菜单 **Workflow → Export (API)** 导出 API 格式 JSON。
4. 两种接法任选：
   - 把导出的 JSON 交给 [API Proxy](https://docs.comfy.org/development/comfyui-server/api-proxy.md) 或直接用
     ComfyUI Server API（`POST /prompt` + 轮询 `/history/{prompt_id}`）替换 `src/lib/comfy.ts` 的实现；
   - 或在 Comfy Developer Platform 把 workflow 部署成 endpoint，改 `COMFY_API_BASE` 指向它。

## 文件说明

| 文件 | 用途 | 关键节点 |
| --- | --- | --- |
| `character-sheet.flux3.json` | 角色定妆照（文生图，FLUX） | UNETLoader + FluxGuidance + KSampler |
| `shot.i2v.wan.json` | 关键帧 → 视频（图生视频，Wan） | WanImageToVideo + CLIPVisionEncode |

> Wan 2.2 双 UNet（high/low noise 两段采样）效果更好但图更复杂；模板给的是结构最简单的
> Wan 2.1 i2v 单段采样，方便先跑通再升级。
