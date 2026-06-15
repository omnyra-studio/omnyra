import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { prompt, toolId } = await req.json();

  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt required' }, { status: 400 });
  }

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a Ghost Test enforcer for Omnyra, an AI video generation studio. ' +
        'Generate 5 distinct scene concepts as a JSON array. ' +
        'Each concept MUST describe ONLY observable physical actions, body language, ' +
        'object interactions, clothing, props, lighting, and environment. ' +
        'ZERO emotion labels. ZERO internal states. ZERO adjectives like "powerful" or "beautiful". ' +
        'Return ONLY valid JSON: [{"title":"...","description":"...","ghostScore":0-100}]',
      messages: [
        {
          role:    'user',
          content: `Tool: ${toolId}\nPrompt: ${prompt}\n\nGenerate 5 Ghost Test–compliant scene concepts.`,
        },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ concepts: [] });
    }
    const concepts = JSON.parse(jsonMatch[0]);
    return Response.json({ concepts });
  } catch (err) {
    console.error('[generate-concepts]', err);
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
