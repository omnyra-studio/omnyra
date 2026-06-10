// Supabase Edge Function: low-credits-warning
// Triggered by pg_cron daily at 10 AM UTC for users with <300 credits.

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, first_name, credits, plan")
      .eq("id", userId)
      .single();

    if (!profile?.email) return new Response("User not found", { status: 404 });

    const remaining       = profile.credits ?? 0;
    const estimatedVideos = Math.max(0, Math.floor(remaining / 30));
    const firstName       = profile.first_name ?? "Creator";

    await resend.emails.send({
      from:    "Gem <gem@omnyra.studio>",
      to:      profile.email,
      subject: "You're running low on credits — keep creating",
      html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0D0010;color:#E8DEFF;padding:32px;max-width:560px;margin:0 auto">
  <div style="margin-bottom:24px">
    <span style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#E8B84B);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Omnyra</span>
  </div>
  <h2 style="font-size:20px;margin:0 0 16px;color:#fff">Hi ${firstName},</h2>
  <div style="background:rgba(75,30,130,0.5);border:1px solid rgba(201,168,76,0.3);border-radius:16px;padding:24px;margin-bottom:20px;text-align:center">
    <div style="font-size:56px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#F7D96B);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${remaining}</div>
    <div style="color:#BBA8C8;margin-top:4px">credits remaining</div>
    ${estimatedVideos > 0 ? `<div style="color:#8A7D92;font-size:12px;margin-top:4px">about ${estimatedVideos} more video${estimatedVideos === 1 ? "" : "s"}</div>` : ""}
  </div>
  <p style="color:#BBA8C8;margin:0 0 24px">Don't lose your story arc momentum.</p>
  <div style="text-align:center;margin-bottom:24px">
    <a href="${APP_URL}/account/billing" style="display:inline-block;background:linear-gradient(105deg,#5A3400,#CFA42F,#E8C84A,#CFA42F,#5A3400);color:#0D0010;padding:12px 24px;border-radius:10px;font-weight:700;text-decoration:none;margin-right:12px">Buy Credit Pack</a>
    <a href="${APP_URL}/pricing" style="display:inline-block;background:rgba(75,30,130,0.6);border:1px solid rgba(207,164,47,0.3);color:#CFA42F;padding:12px 24px;border-radius:10px;font-weight:600;text-decoration:none">Upgrade Plan →</a>
  </div>
  <p style="color:#8A7D92;font-size:13px;margin-top:32px">Cheers,<br><strong style="color:#BBA8C8">Gem</strong><br>@ Omnyra</p>
  <p style="color:#4A4055;font-size:11px;margin-top:16px"><a href="${APP_URL}/account/notifications" style="color:#4A4055">Unsubscribe</a></p>
</body></html>`,
    });

    console.log(`[low-credits-warning] sent to ${profile.email} (${remaining} credits)`);
    return new Response("Low credits warning sent", { status: 200 });
  } catch (err) {
    console.error("[low-credits-warning]", err);
    return new Response("Internal error", { status: 500 });
  }
});
