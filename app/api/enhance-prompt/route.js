import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req) {
  const { concept, script, template, niche, style, platforms } = await req.json()

  if (!concept?.trim()) {
    return Response.json({ error: 'concept required' }, { status: 400 })
  }

  const fullContext = script ? `${concept}\n\nFULL SCRIPT:\n${script}` : concept

  const prompt = `You are a cinematographer. Generate an image generation prompt that EXACTLY matches this video script.

SCRIPT SCENES: ${fullContext}
NICHE: ${niche ?? 'lifestyle'}
VISUAL STYLE: ${style ?? 'lifestyle'}

CRITICAL RULES:
- Extract the EXACT setting from the script scenes — if script says "beach at dawn" generate a beach at dawn image
- Extract the EXACT subject — if script says "girl kneeling by water" show a girl kneeling by water
- Extract the EXACT mood — if script says "tears glistening" show an emotional tearful moment
- NEVER substitute a different location, time of day, or subject
- The image must look like a still frame FROM this exact video

FORMAT:
- Describe the exact scene from the script
- Add cinematic quality: specific lighting matching the script, camera angle, color grade
- Maximum 80 words
- Return ONLY the image prompt, nothing else`

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const result = response.choices[0].message.content?.trim() ?? concept

  return Response.json({ prompt: result })
}
