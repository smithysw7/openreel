import { isComfyConfigured, imageModel, videoModel } from "@/lib/comfy";
import { isLlmConfigured } from "@/lib/llm";
import { pickBackend, backendLabel } from "@/lib/backend";
import { isLocalReachable } from "@/lib/comfy_local";

export const dynamic = "force-dynamic";

export async function GET() {
  const backend = await pickBackend();
  return Response.json({
    comfy: isComfyConfigured(),
    llm: isLlmConfigured(),
    local: await isLocalReachable(),
    mockMode: backend === "mock",
    backend,
    backendLabel: backendLabel(backend),
    imageModel: imageModel(),
    videoModel: videoModel(),
  });
}
