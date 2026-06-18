/** Split a multi-scene prompt into clip-sized segments for cinematic sequence generation. */
export function splitPromptIntoClips(prompt: string, clipCount = 3): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return [];

  const timestampBlocks = trimmed.match(/\[\d{2}:\d{2}-\d{2}:\d{2}\][^\[]*/gi);
  if (timestampBlocks && timestampBlocks.length > 0) {
    return timestampBlocks.map(b => b.trim()).slice(0, clipCount);
  }

  const sceneBlocks = trimmed
    .split(/\n{2,}|(?=Scene\s+\d+:)/i)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  if (sceneBlocks.length >= 2) {
    return sceneBlocks.slice(0, clipCount);
  }

  if (clipCount === 1) return [trimmed];

  return [
    `${trimmed}. Opening scene, wide establishing shot, subjects actively performing the described action, camera slowly pushing in`,
    `${trimmed}. Mid scene, action continues with genuine motion, medium shot, fluid natural movement`,
    `${trimmed}. Closing beat, action resolving, close detail shot, camera gently pulling back`,
  ].slice(0, clipCount);
}