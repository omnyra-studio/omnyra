import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateConceptImage(description: string, falKey: string): Promise<string> {
  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method:  'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        prompt:                 description + ', cinematic film still, vertical 9:16, natural dramatic lighting, sharp focus, high detail',
        num_images:             1,
        image_size:             { width: 1080, height: 1920 },
        num_inference_steps:    4,
        enable_safety_checker:  true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[generate-concepts] fal image error:', errText.substring(0, 300));
      return '';
    }
    const data = await res.json() as { images?: { url: string }[] };
    return data.images?.[0]?.url ?? '';
  } catch (err) {
    console.error('[generate-concepts] image gen failed:', (err as Error).message);
    return '';
  }
}

export async function POST(req: Request) {
  const { prompt, toolId } = await req.json();

  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt required' }, { status: 400 });
  }

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) {
    console.error('[generate-concepts] FAL_API_KEY not configured');
    return Response.json({ error: 'Image generation not configured' }, { status: 503 });
  }

  try {
    // Step 1: Claude generates 4 Ghost Test–compliant scene concepts
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a Ghost Test enforcer for Omnyra, an AI video generation studio. ' +
        'Generate exactly 4 distinct scene concepts as a JSON array. ' +
        'Each concept MUST describe ONLY observable physical actions, body language, ' +
        'micro-behaviours, object interactions, clothing, props, lighting, environment, and camera angles. ' +
        'ZERO emotion labels. ZERO internal states. ZERO evaluative adjectives. ' +
        'Each description must be vivid enough to generate a compelling image. ' +
        'Return ONLY valid JSON: [{"title":"short evocative title","description":"2-3 sentence physical-action-only scene description","ghostScore":70-100}]',
      messages: [
        {
          role:    'user',
          content: `Tool: ${toolId}\nPrompt: ${prompt}\n\nGenerate 4 Ghost Test–compliant scene concepts for image generation.`,
        },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ concepts: [] });
    }

    const textConcepts = JSON.parse(jsonMatch[0]) as Array<{ title: string; description: string; ghostScore: number }>;
    const four = textConcepts.slice(0, 4);

    // Step 2: Generate images in parallel for all 4 concepts
    const imageUrls = await Promise.all(
      four.map(c => generateConceptImage(c.description, falKey))
    );

    const concepts = four.map((c, i) => ({
      title:      c.title,
      description:c.description,
      ghostScore: c.ghostScore,
      imageUrl:   imageUrls[i] ?? '',
    }));

    return Response.json({ concepts });
  } catch (err) {
    console.error('[generate-concepts]', err);
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
