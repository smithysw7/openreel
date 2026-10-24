export const STYLE_PRESETS = [
  {
    id: "cyberpunk",
    label: "赛博朋克夜城",
    look: "neon-lit cyberpunk megacity at night, rain-slicked streets, holographic signs, cinematic sci-fi film still, anamorphic lens flare, teal and magenta palette",
  },
  {
    id: "noir",
    label: "黑白文艺片",
    look: "black and white arthouse film still, high contrast chiaroscuro lighting, 35mm grain, melancholic atmosphere, French New Wave composition",
  },
  {
    id: "wuxia",
    label: "东方武侠",
    look: "Chinese wuxia film still, misty bamboo forest, flowing robes, golden hour backlight, sweeping epic cinematography, Zhang Yimou color palette",
  },
  {
    id: "anime",
    label: "治愈手绘动画",
    look: "hand-drawn anime film still, Studio Ghibli inspired, soft watercolor backgrounds, warm afternoon light, gentle and healing atmosphere",
  },
] as const;

export const DEFAULT_STYLE_BLOCK =
  "cinematic film still, 35mm photography, shallow depth of field, dramatic lighting, film grain, professional color grading";
