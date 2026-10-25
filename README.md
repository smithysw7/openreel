# OpenReel — Open-Source AI Short-Film Studio

> One logline in, a character-consistent short film out.
> Built for the [Open Source Higgsfield · Comfy](https://comfy.org/open-source-higgsfield) competition:
> Higgsfield's stack is **Soul Cast** (AI actors), **Soul ID** (character consistency) and **Soul Cinema**
> (cinematic generation) — OpenReel rebuilds all three ideas in the open, running **entirely on your own GPU**
> with open-weight models.

| Home & recent projects | Casting · AI actor card | Film set · assembled cut |
| --- | --- | --- |
| ![Home](docs/images/home.png) | ![Casting](docs/images/cast.png) | ![Film set](docs/images/set.png) |

▶ Full walkthrough: [demo/openreel-demo.webm](demo/openreel-demo.webm) (~35s, real footage).

## How it works

```
Logline ──► Storyboard (8 shots: framing / camera move / dialogue / duration, editable)
              │
              ▼
        Casting · AI actor card (open-source "Soul ID")
        fixed appearance description + unified style block + first head sheet
        as the anchor reference for every following generation
              │
              ▼
        Per shot: actor card + shot brief ──► keyframe ──► image-to-video (native audio)
              │
              ▼
        ffmpeg assembly: normalize → concat → burned subtitles → narration & BGM mix ──► final cut
```

Three layers keep the character consistent across shots — all in open code, no black boxes:

1. **Text anchoring** — the actor's appearance description is injected verbatim into every keyframe prompt;
2. **Image anchoring** — the first head sheet is used as the reference image / first frame for all following generations;
3. **Style lock** — a single style block (preset + cinematography language) is applied to the whole film.

## Three generation backends

| Backend | Image | Video | Cost |
| --- | --- | --- | --- |
| `local` (default) | Z-Image Turbo | MiniMax H3 (local open weights, native audio) | **$0** |
| `cloud` | `bfl/flux-3-image` | `minimax/minimax-h3` (Comfy Router API) | Comfy credits |
| `mock` | ffmpeg placeholder | ffmpeg placeholder | $0 |

`OPENREEL_BACKEND=auto|local|cloud|mock` — auto picks local if a ComfyUI server is reachable,
otherwise cloud if `COMFY_API_KEY` is set, otherwise mock. Narration is synthesized locally with
**OmniVoice TTS** (voice design: narrator + character voices) and mixed into the cut at per-shot offsets.

The submitted short film (*Rain Night Rooftop*, 8 shots, 41.5s, black-and-white) was generated
**100% locally on a single RTX 5060 Ti** with open weights — zero API credits.

## Quick start

Prerequisites: Node 22+, ffmpeg (+ ffprobe) on PATH.

```bash
npm install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run dev               # http://localhost:3000
```

**Zero-config demo mode**: with no keys at all, the full product loop runs end-to-end
(storyboard → casting → shots → assembled cut) using ffmpeg placeholder media — no credits, no accounts.

### Real generation

Two supported paths:

**A. Local open weights (recommended — this is the "Open Weights Only" submission path):**

1. Run a local ComfyUI server (v0.38+) on `127.0.0.1:8188`;
2. Mount your model directory via `extra_model_paths.yaml` (see [workflows/README.md](workflows/README.md));
3. Required weights: `z_image_turbo_bf16` + `qwen_3_4b` + `ae` (images), `MiniMax_H3_FL2VA` +
   `qwen3vl_32b` + H3 video/audio VAEs (video), `OmniVoice` (narration);
4. Node pack: [ComfyUI-ALLinONE-MinimaxH3](https://github.com/) (the `i2v.json` API workflow ships with it).

**B. Comfy Router API (cloud):**

1. Get an API key at [platform.comfy.org](https://platform.comfy.org) and put it in `.env`;
2. Set `OPENREEL_IMAGE_MODEL` / `OPENREEL_VIDEO_MODEL` — discover valid IDs with:

```bash
npm run models              # list all models (filter: npm run models -- flux)
npm run models <model_id>   # inspect a model's input schema (for 422 debugging)
```

Optional: any OpenAI-compatible LLM key (`LLM_API_KEY`, e.g. GLM/DeepSeek) upgrades the storyboard
from the built-in template to LLM-generated shot lists.

## Repo layout

```
src/lib/comfy_local.ts   Local ComfyUI adapter (Server API: /prompt → /history → /view, /upload/image)
src/lib/comfy.ts         Comfy Router API client (submit/poll/collect, verified against official schemas)
src/lib/backend.ts       Backend auto-selection: local → cloud → mock
src/lib/media.ts         ffmpeg pipeline: normalize → concat → burned subtitles → narration/BGM mix
src/lib/llm.ts           Storyboard LLM (OpenAI-compatible) + built-in mock storyboard
src/app/api/*            REST: storyboard / character / shot / film / project / projects / assets / config
src/components/Studio.tsx  Three-step wizard UI (script → casting → film set)
workflows/               Runtime workflow templates (Z-Image t2i, MiniMax H3 i2v) + local-route guide
scripts/list-models.mjs  Router model-ID discovery
scripts/smoke.mjs        End-to-end smoke test (16:9 and 9:16)
scripts/demo-seed.mjs    One-command full demo project (8 shots + subtitles + cut)
demo/                    Walkthrough recording + 5s teaser
docs/SETUP.md            Detailed setup & troubleshooting (Chinese)
docs/SUBMISSION.md       Competition submission cheat-sheet (Chinese)
docs/STATUS.md           Build log (Chinese)
```

## Competition mapping

| Category | How OpenReel qualifies |
| --- | --- |
| Best Overall | Full pipeline others can use: one logline → a cut of their own story |
| Open Weights Only | Default stack is 100% local open weights, no closed APIs |
| Built with MiniMax H3 | H3 (open weights) is the core video model |
| Most Viral | Casting page is made to be shared: one description → a reusable AI actor |

## Measured performance (RTX 5060 Ti 16GB + 32GB RAM)

| Step | Time |
| --- | --- |
| Z-Image Turbo, 1280×720 keyframe | ~20s |
| MiniMax H3, 960×544×124f shot (with audio) | ~11 min |
| Full 8-shot film incl. assembly | ~95 min |
| ffmpeg assembly (8 shots + subtitles + narration mix) | ~1 min |

## Known limitations (MVP)

- 8 shots × 4–6s per film; "shoot all" runs serially (~11 min per local shot — leave it running);
- Mock mode uses ffmpeg placeholder media (product-loop demo, not real generation);
- Cloud media URLs expire in 12–24h — the app downloads assets immediately, so this is transparent;
- Character drift across 8 shots is possible — re-roll any single shot for free (local route).

## License

[MIT](LICENSE)
