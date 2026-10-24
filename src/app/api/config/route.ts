import { isComfyConfigured, imageModel, videoModel } from "@/lib/comfy";
import { isLlmConfigured } from "@/lib/llm";


export async function GET() {
  return Response.json({
    comfy: isComfyConfigured(),
    llm: isLlmConfigured(),
    mockMode: !isComfyConfigured(),
    imageModel: imageModel(),
    videoModel: videoModel(),
  });
}
