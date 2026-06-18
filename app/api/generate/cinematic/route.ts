/**
 * POST /api/generate/cinematic
 *
 * Main Seedance-via-ElevenLabs cinematic endpoint.
 * Express equivalent: router.post('/generate/cinematic', authMiddleware, generateCinematic)
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateCinematic } from "@/lib/controllers/cinematic";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";
import { DEFAULT_VOICE_ID } from "@/lib/services/elevenlabs";

export const maxDuration = 300;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json({
      success: false,
      error:   "ELEVENLABS_API_KEY not configured",
    }, { status: 500 });
  }

  let body: {
    prompt?: string;
    duration?: number;
    voiceoverText?: string;
    voiceId?: string;
  };

  try {
    body = await parseJsonWithEthnicityFix(req);
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt, duration = 30, voiceoverText, voiceId = DEFAULT_VOICE_ID } = body;

  if (!prompt?.trim()) {
    return Response.json({ success: false, error: "prompt is required" }, { status: 400 });
  }

  try {
    const result = await generateCinematic({
      userId:        user.id,
      prompt,
      duration,
      voiceoverText,
      voiceId,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SEEDANCE_ERROR]", message);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}