import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt?.trim()) {
    return Response.json({ score: 0, feedback: 'No prompt provided.', passed: false, enhancedPrompt: prompt });
  }

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:
        'You are the Ghost Test enforcer for Omnyra, an AI video studio. ' +
        'Your job is to score a prompt AND rewrite it to be Ghost Test compliant. ' +
        'Ghost Test rule: describe ONLY what a camera can capture — physical actions, ' +
        'body language, micro-behaviours, object interactions, clothing, props, ' +
        'environment, lighting, camera angle. ' +
        'REMOVE all emotion labels (felt, nervous, sad, happy, overwhelmed), ' +
        'internal states (thought, wondered, believed, realised), ' +
        'and evaluative adjectives (beautiful, powerful, amazing, incredible). ' +
        'Return ONLY valid JSON: ' +
        '{"score":number,"feedback":"one sentence","passed":boolean,"enhancedPrompt":"rewritten physical-action-only description"}',
      messages: [
        { role: 'user', content: `Score and rewrite this prompt to be Ghost Test compliant:\n\n${prompt}` },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ score: 50, feedback: 'Could not parse score.', passed: false, enhancedPrompt: prompt });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.enhancedPrompt) parsed.enhancedPrompt = prompt;
    return Response.json(parsed);
  } catch (err) {
    console.error('[ghost-test-score]', err);
    return Response.json({ score: 50, feedback: 'Scoring unavailable.', passed: false, enhancedPrompt: prompt });
  }
}
