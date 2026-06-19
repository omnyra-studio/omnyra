import { FORCE_LUMA, FORCE_SEEDANCE, DEFAULT_VIDEO_MODEL } from "@/lib/video-provider";

export type ModelRoute = {
  model:    string;
  provider: string;
  bestFor:  string;
};

export async function routeToModel(params: {
  selectedModel?: string;
  campaignMode?:  boolean;
}): Promise<ModelRoute> {
  void params;

  if (FORCE_LUMA) {
    return { model: "luma-fal", provider: "luma-fal", bestFor: "Cinematic Quality" };
  }

  if (FORCE_SEEDANCE) {
    return { model: "seedance-fal", provider: "seedance-fal", bestFor: "Fast Cinematic" };
  }

  return { model: DEFAULT_VIDEO_MODEL, provider: DEFAULT_VIDEO_MODEL, bestFor: "Cinematic Quality" };
}