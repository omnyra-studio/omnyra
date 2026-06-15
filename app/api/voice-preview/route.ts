import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 503 });
  }

  try {
    const { voiceId, text } = await req.json();

    if (!voiceId || !text) {
      return NextResponse.json({ error: 'voiceId and text are required' }, { status: 400 });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method:  'POST',
      headers: {
        'xi-api-key':    process.env.ELEVENLABS_API_KEY!,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        text:     (text as string).slice(0, 200),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability:       0.75,
          similarity_boost: 0.85,
          style:           0.6,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[voice-preview] ElevenLabs error:', errorText);
      throw new Error('Failed to generate voice preview');
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type':        'audio/mpeg',
        'Content-Disposition': 'inline; filename="preview.mp3"',
      },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Voice preview failed';
    console.error('[voice-preview] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
