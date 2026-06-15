import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt?.trim()) {
    return Response.json({ score: 0, feedback: 'No prompt provided.', passed: false });
  }

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:
        'You are the Ghost Test scoring engine for Omnyra. ' +
        'Score prompts 0–100 based on how well they describe only physically observable details. ' +
        'Deduct points for: emotion labels (felt, overwhelmed, nervous), internal states (thought, wondered, believed), ' +
        'evaluative adjectives (beautiful, powerful, amazing). ' +
        'Award points for: specific body actions, clothing details, props, lighting, spatial relationships. ' +
        'Return ONLY valid JSON: {"score":number,"feedback":"one sentence","passed":boolean}',
      messages: [
        { role: 'user', content: `Score this prompt:\n\n${prompt}` },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ score: 50, feedback: 'Could not parse score.', passed: false });
    }
    return Response.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error('[ghost-test-score]', err);
    return Response.json({ score: 50, feedback: 'Scoring unavailable.', passed: false });
  }
}
