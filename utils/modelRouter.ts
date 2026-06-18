export type ModelRoute = {
  model:    string;
  provider: string;
  bestFor:  string;
};

const FORCE_LUMA = true;

export async function routeToModel(params: {
  selectedModel?: string;
  campaignMode?:  boolean;
}): Promise<ModelRoute> {
  void params;
  if (FORCE_LUMA) {
    return { model: "luma-fal", provider: "luma-fal", bestFor: "Cinematic Quality" };
  }

  return { model: "luma-fal", provider: "luma-fal", bestFor: "Cinematic Quality" };
}