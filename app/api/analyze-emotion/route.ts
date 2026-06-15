import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt?.trim()) {
    return Response.json({ arc: 'neutral', emotions: [], intensity: 0 });
  }

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:
        'You are an emotional arc detector for video scripts. ' +
        'Analyse the prompt and detect the dominant emotional arc. ' +
        'Return ONLY valid JSON: {"arc":"string","emotions":["string"],"intensity":1-10} ' +
        'Arc must be one of: rising-tension, falling-tension, cathartic-release, melancholic-hope, ' +
        'triumphant, neutral, comedic, dramatic, heartfelt-journey.',
      messages: [
        { role: 'user', content: `Detect emotional arc:\n\n${prompt}` },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ arc: 'neutral', emotions: [], intensity: 5 });
    }
    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error('[analyze-emotion]', err);
    return Response.json({ arc: 'neutral', emotions: [], intensity: 5 });
  }
}
