export type ModelRoute = {
  model:    string;
  provider: string;
  bestFor:  string;
};

export async function routeToModel(params: {
  selectedModel?: string;
  campaignMode?:  boolean;
}): Promise<ModelRoute> {
  const { selectedModel, campaignMode = false } = params;

  if (selectedModel === 'hedra') {
    return { model: 'hedra',        provider: 'hedra',   bestFor: 'Avatar / Talking Head' };
  }

  if (campaignMode) {
    return { model: 'kling-3.0',    provider: 'kling',   bestFor: 'Cinematic Quality' };
  }

  switch (selectedModel) {
    case 'kling':
      return { model: 'kling-3.0',    provider: 'kling',   bestFor: 'Cinematic Quality' };
    case 'pika':
      return { model: 'pika-2.5',     provider: 'pika',    bestFor: 'Creative Effects' };
    case 'runway':
      return { model: 'runway-gen4',  provider: 'runway',  bestFor: 'Creative Control' };
    case 'fal':
      return { model: 'multi-model',  provider: 'fal',     bestFor: 'Fast Multi-Model' };
    case 'getimg':
      return { model: 'getimg-video', provider: 'getimg',  bestFor: 'All-in-One' };
    default:
      return { model: 'kling-3.0',    provider: 'kling',   bestFor: 'Cinematic Quality' };
  }
}
