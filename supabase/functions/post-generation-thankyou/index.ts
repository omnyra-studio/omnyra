// Supabase Edge Function: post-generation-thankyou
// Called after successful video generation to deliver insight + CTAs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4";

const resend  = new Resend(Deno.env.get("RESEND_API_KEY")!);
const APP_URL = "https://omnyra.studio";

serve(async (req: Request) => {
  try {
    const { userId, videoUrl, intelligenceTip } = await req.json() as {
      userId:          string;
      videoUrl?:       string;
      intelligenceTip?: string;
    };
    if (!userId) return new Response("Missing userId", { status: 400 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, first_name")
      .eq("id", userId)
      .single();

    if (!profile?.email) return new Response("User not found", { status: 404 });

    const firstName = profile.first_name ?? "Creator";
    const tip = intelligenceTip ?? "Great work — your consistent style is making your brand more recognisable.";

    await resend.emails.send({
      from:    "Gem <gem@omnyra.studio>",
      to:      profile.email,
      subject: "Your video is ready — Omnyra noticed something",
      html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">
<div style="max-width:600px;margin:0 auto;background:#111;padding:40px;border-radius:16px;border:1px solid rgba(168,85,247,0.15)">
  <div style="margin-bottom:28px"><span style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#E8B84B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Omnyra</span></div>

  <h2 style="color:#e5e5e5;font-size:20px;margin:0 0 12px">Hey ${firstName},</h2>
  <p style="color:#aaa;margin:0 0 24px">Your latest video is ready and saved to My Videos.</p>

  <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);padding:20px;border-radius:12px;margin:0 0 28px">
    <p style="margin:0 0 8px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.12em">Creator Intelligence Insight</p>
    <p style="margin:0;color:#e5e5e5;line-height:1.7;font-size:15px">${tip}</p>
  </div>

  <div style="margin-bottom:28px;display:flex;flex-wrap:wrap;gap:10px">
    ${videoUrl ? `<a href="${videoUrl}" style="display:inline-block;background:#a855f7;color:white;padding:11px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Video</a>` : ""}
    <a href="${APP_URL}/create" style="display:inline-block;background:#1a1a1a;border:1px solid rgba(168,85,247,0.3);color:#c084fc;padding:11px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Continue This Story</a>
    <a href="${APP_URL}/create?remix=brand" style="display:inline-block;background:#1a1a1a;border:1px solid rgba(168,85,247,0.3);color:#c084fc;padding:11px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Remix with Brand</a>
  </div>

  <p style="color:#888;font-size:13px;margin:0;line-height:1.7">Thank you for creating with memory.<br>Your consistency is building something real.</p>
  <p style="margin-top:32px;color:#888;font-size:13px;line-height:1.6">Best,<br><strong style="color:#bbb">Gem</strong><br>Founder @ Omnyra</p>
  <p style="margin-top:16px;font-size:11px"><a href="${APP_URL}/account/notifications" style="color:#444">Unsubscribe</a></p>
</div>
</body></html>`,
    });

    console.log(`[post-generation-thankyou] sent to ${profile.email}`);
    return new Response("Thank you email sent", { status: 200 });
  } catch (err) {
    console.error("[post-generation-thankyou]", err);
    return new Response("Internal error", { status: 500 });
  }
});
