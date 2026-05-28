export async function POST(req) {
  const { concept, script, niche, style } = await req.json()

  const source = script ?? concept ?? ''

  // Extract [SCENE: ...] tags from the script — these are the ground-truth visual directions
  const sceneMatches = source.match(/\[SCENE:\s*([^\]]+)\]/gi) ?? []
  const scenes = sceneMatches.map(s => s.replace(/\[SCENE:\s*/i, '').replace(']', '').trim())
  const sceneContext = scenes.length > 0 ? scenes.join('. ') : source

  const visualStyle = style ?? 'cinematic lifestyle'
  const nicheContext = niche ? `${niche} niche` : 'general'

  const enhancedPrompt = `${sceneContext}. ${visualStyle}, photorealistic, cinematic lighting, high quality, ${nicheContext}.`

  return Response.json({ prompt: enhancedPrompt })
}
