// Server-side render saver — uses supabaseAdmin directly (bypasses cookie auth).
// Called from orchestration workers that have no HTTP cookie context.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPostGenerationThankYou } from "@/lib/email";

export interface SaveRenderParams {
  userId:          string;
  videoUrl:        string;
  audioUrl?:       string | null;
  script?:         string | null;
  template?:       string | null;
  niche?:          string | null;
  thumbnail_url?:  string | null;
  sendEmail?:      boolean;
  intelligenceTip?: string | null;
}

export async function saveRenderToLibrary(params: SaveRenderParams): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await supabaseAdmin
        .from("renders")
        .insert({
          user_id:       params.userId,
          status:        "complete",
          video_url:     params.videoUrl,
          audio_url:     params.audioUrl ?? null,
          script:        params.script ?? null,
          template:      params.template ?? null,
          niche:         params.niche ?? null,
          thumbnail_url: params.thumbnail_url ?? null,
          completed_at:  new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;
      console.info(`[SAVE_RENDER] user=${params.userId} video=${params.videoUrl.substring(0, 80)} template=${params.template} render_id=${data.id} status=success`);

      if (params.sendEmail) {
        void (async () => {
          try {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("email, first_name")
              .eq("id", params.userId)
              .single();
            if (profile?.email) {
              await sendPostGenerationThankYou(profile.email, {
                firstName:      profile.first_name ?? null,
                videoUrl:       params.videoUrl,
                intelligenceTip: params.intelligenceTip ?? null,
              });
            }
          } catch (emailErr) {
            console.warn("[save-render] post-gen email failed:", emailErr instanceof Error ? emailErr.message : emailErr);
          }
        })();
      }

      return data.id as string;
    } catch (err) {
      if (attempt === 2) {
        console.warn("[save-render] failed after 2 attempts:", err instanceof Error ? err.message : err);
        return null;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return null;
}
