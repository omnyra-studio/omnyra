import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FALLBACK_VOICES = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',   preview_url: '', labels: { gender: 'female', accent: 'American',     use_case: 'narration',      description: 'Warm, smooth' } },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',    preview_url: '', labels: { gender: 'female', accent: 'American',     use_case: 'social media',   description: 'Soft, gentle' } },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',     preview_url: '', labels: { gender: 'female', accent: 'American',     use_case: 'narration',      description: 'Bold, confident' } },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',     preview_url: '', labels: { gender: 'female', accent: 'American',     use_case: 'conversational', description: 'Emotive, young' } },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',     preview_url: '', labels: { gender: 'male',   accent: 'American',     use_case: 'narration',      description: 'Deep, authoritative' } },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',   preview_url: '', labels: { gender: 'male',   accent: 'American',     use_case: 'narration',      description: 'Crisp, formal' } },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',     preview_url: '', labels: { gender: 'male',   accent: 'American',     use_case: 'narration',      description: 'Deep, calm' } },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',      preview_url: '', labels: { gender: 'male',   accent: 'American',     use_case: 'conversational', description: 'Raspy, natural' } },
  { voice_id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas',   preview_url: '', labels: { gender: 'male',   accent: 'American',     use_case: 'narration',      description: 'Calm, neutral' } },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', preview_url: '', labels: { gender: 'female', accent: 'English (UK)', use_case: 'social media',   description: 'Seductive, British' } },
  { voice_id: 'Yko7PKHZNXotIFUBG7I9', name: 'Dorothy',  preview_url: '', labels: { gender: 'female', accent: 'English (UK)', use_case: 'narration',      description: 'Pleasant, approachable' } },
  { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',   preview_url: '', labels: { gender: 'male',   accent: 'English (UK)', use_case: 'news',           description: 'Deep, authoritative' } },
];

export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ voices: FALLBACK_VOICES });

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ voices: FALLBACK_VOICES });
    const data = await res.json() as { voices?: unknown[] };
    const voices = (data.voices ?? []).length > 0 ? data.voices : FALLBACK_VOICES;
    return NextResponse.json({ voices });
  } catch {
    return NextResponse.json({ voices: FALLBACK_VOICES });
  }
}
