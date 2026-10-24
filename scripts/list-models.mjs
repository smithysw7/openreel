#!/usr/bin/env node
/**
 * 模型 ID 发现工具：
 *   node scripts/list-models.mjs            列出所有可用模型（可加关键词过滤，如 npm run models -- flux）
 *   node scripts/list-models.mjs <model_id> 查看某模型的入参 schema（422 排查用）
 */
const key = process.env.COMFY_API_KEY;
if (!key) {
  console.error("请先在 .env 中配置 COMFY_API_KEY（或 export COMFY_API_KEY=...）");
  process.exit(1);
}
const base = (process.env.COMFY_API_BASE ?? "https://api.comfy.org").replace(/\/+$/, "");
const target = process.argv[2];
const headers = { "X-API-Key": key };

if (target && target.includes("/")) {
  const res = await fetch(`${base}/v2/models/${target}/openapi.json`, { headers });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const schema = await res.json();
  const bodySchema = schema?.components?.schemas?.RouterModelInput ?? schema?.paths?.[Object.keys(schema.paths ?? {})[0]];
  console.log(`# ${target} 入参 schema：`);
  console.log(JSON.stringify(bodySchema, null, 2).slice(0, 6000));
} else {
  const filter = (target ?? "").toLowerCase();
  let cursor;
  const seen = new Set();
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${base}/v2/models`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
      process.exit(1);
    }
    const data = await res.json();
    const items = data.models ?? data.data ?? data.items ?? (Array.isArray(data) ? data : []);
    for (const item of items) {
      const id = item.id ?? item.model_id ?? item.model ?? "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = item.name ?? item.display_name ?? "";
      const line = `${id}${name ? `  —  ${name}` : ""}`;
      if (!filter || line.toLowerCase().includes(filter)) console.log(line);
    }
    cursor = data.next_cursor ?? data.cursor ?? null;
    if (!cursor) break;
  }
  console.error(`\n共 ${seen.size} 个模型。查看某模型入参：node scripts/list-models.mjs <model_id>`);
}
