export type ModelRoute = {
  model:    string;
  provider: string;
  bestFor:  string;
};

// FORCE SEEDANCE - DISABLE KLING COMPLETELY
const FORCE_SEEDANCE = true;

export async function routeToModel(params: {
  selectedModel?: string;
  campaignMode?:  boolean;
}): Promise<ModelRoute> {
  void params;
  if (FORCE_SEEDANCE) {
    return { model: "seedance-elevenlabs", provider: "seedance-elevenlabs", bestFor: "Cinematic Quality" };
  }

  if (params.selectedModel === "hedra") {
    return { model: "hedra", provider: "hedra", bestFor: "Avatar / Talking Head" };
  }

  return { model: "seedance-elevenlabs", provider: "seedance-elevenlabs", bestFor: "Cinematic Quality" };
}