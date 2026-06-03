import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  createSessionPreferences,
  recordSessionSelection,
  type SessionPreferences,
} from "@/packages/selection-feedback";
import type { PsychologicalStrategy } from "@/packages/viral-strategy";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let sessionId: string, selectedStrategy: PsychologicalStrategy;
  let currentPrefs: SessionPreferences | undefined;

  try {
    const body = await req.json() as {
      sessionId?: string;
      selectedStrategy?: PsychologicalStrategy;
      currentPrefs?: SessionPreferences;
    };
    sessionId = body.sessionId ?? "";
    selectedStrategy = body.selectedStrategy!;
    currentPrefs = body.currentPrefs;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!selectedStrategy) return Response.json({ error: "selectedStrategy is required" }, { status: 400 });

  const base = currentPrefs ?? createSessionPreferences();
  const updatedPrefs = recordSessionSelection(base, selectedStrategy);

  return Response.json({
    sessionId,
    sessionBias: {
      scrollHoldBias: updatedPrefs.scrollHoldBias,
      sharePotentialBias: updatedPrefs.sharePotentialBias,
      messageStrengthBias: updatedPrefs.messageStrengthBias,
    },
    updatedPrefs,
  });
}
