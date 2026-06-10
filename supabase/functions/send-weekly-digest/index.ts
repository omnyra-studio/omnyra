// Supabase Edge Function: send-weekly-digest
// Triggered by pg_cron every Monday 9 AM UTC.
// Sends branded weekly recap email via Resend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4";

const resend  = new Resend(Deno.env.get("RESEND_API_KEY")!);
const APP_URL = "https://omnyra.studio";

serve(async (req: Request) => {
  try {
    const { userId } = await req.json() as { userId: string };
    if (!userId) return new Response("Missing userId", { status: 400 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch user profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("email, first_name")
      .eq("id", userId)
      .single();

    if (profileErr || !profile?.email) {
      return new Response("User not found", { status: 404 });
    }

    // Fetch top render this week (most recent)
    const { data: renders } = await supabase
      .from("renders")
      .select("script, template, completed_at")
      .eq("user_id", userId)
      .gte("completed_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order("completed_at", { ascending: false })
      .limit(5);

    const topVideo = renders?.[0];
    const videoCount = renders?.length ?? 0;

    // Fetch brand memory for personalized tip
    const { data: brand } = await supabase
      .from("brand_brain")
      .select("brand_name, visual_style, tone_keywords")
      .eq("user_id", userId)
      .single();

    const suggestion = brand?.tone_keywords?.length
      ? `Your audience connects most with ${brand.tone_keywords[0]} content. Try leaning further into that next week.`
      : "Keep experimenting with emotional arcs and golden hour lighting.";

    const firstName = profile.first_name ?? "Creator";
    const brandName = brand?.brand_name;
    const topTitle  = topVideo?.template ? `${topVideo.template} video` : "your latest video";

    await resend.emails.send({
      from:    "Gem <gem@omnyra.studio>",
      to:      profile.email,
      subject: `Your Omnyra Weekly Recap — ${videoCount} video${videoCount === 1 ? "" : "s"} created this week`,
      html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0D0010;color:#E8DEFF;padding:32px;max-width:560px;margin:0 auto">
  <div style="margin-bottom:24px">
    <span style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#E8B84B);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Omnyra</span>
    ${brandName ? `<span style="font-size:12px;color:#8A7D92;margin-left:8px">· ${brandName}</span>` : ""}
  </div>
  <h2 style="font-size:20px;margin:0 0 16px;color:#fff">Hey ${firstName},</h2>
  <p style="color:#BBA8C8;margin:0 0 20px">Here's how your week went:</p>
  <div style="background:rgba(75,30,130,0.5);border:1px solid rgba(207,164,47,0.25);border-radius:16px;padding:20px;margin-bottom:20px">
    <p style="margin:0 0 12px;font-size:32px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#F7D96B);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${videoCount}</p>
    <p style="margin:0 0 10px;color:#BBA8C8">videos created${topVideo ? ` · Latest: <span style="color:#fff">${topTitle}</span>` : ""}</p>
    <p style="margin:0;font-size:13px;color:#E879F9"><strong>Gem's tip</strong>: ${suggestion}</p>
  </div>
  <div style="text-align:center;margin:24px 0">
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:linear-gradient(105deg,#5A3400,#CFA42F,#E8C84A,#CFA42F,#5A3400);color:#0D0010;padding:12px 24px;border-radius:10px;font-weight:700;text-decoration:none;margin-right:12px">View All Videos</a>
    <a href="${APP_URL}/create" style="display:inline-block;background:rgba(75,30,130,0.6);border:1px solid rgba(207,164,47,0.3);color:#CFA42F;padding:12px 24px;border-radius:10px;font-weight:600;text-decoration:none">Generate Next One →</a>
  </div>
  <p style="color:#8A7D92;font-size:13px;margin-top:32px">Keep creating with memory,<br><strong style="color:#BBA8C8">Gem</strong><br>Founder @ Omnyra</p>
  <p style="color:#4A4055;font-size:11px;margin-top:16px"><a href="${APP_URL}/account/notifications" style="color:#4A4055">Unsubscribe from weekly emails</a></p>
</body></html>`,
    });

    console.log(`[weekly-digest] sent to ${profile.email}`);
    return new Response("Weekly digest sent", { status: 200 });
  } catch (err) {
    console.error("[weekly-digest]", err);
    return new Response("Internal error", { status: 500 });
  }
});
