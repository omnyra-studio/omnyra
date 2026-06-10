// Supabase Edge Function: re-engagement
// Triggered by pg_cron daily at 11 AM UTC for users inactive 14+ days.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4";

const resend  = new Resend(Deno.env.get("RESEND_API_KEY")!);
const APP_URL = "https://omnyra.studio";

serve(async (req: Request) => {
  try {
    const { userId, characterName: passedName } = await req.json() as {
      userId: string;
      characterName?: string;
    };
    if (!userId) return new Response("Missing userId", { status: 400 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, first_name, last_active")
      .eq("id", userId)
      .single();

    if (!profile?.email) return new Response("User not found", { status: 404 });

    // Look up most recent character if name not passed
    let characterName = passedName;
    if (!characterName) {
      const { data: char } = await supabase
        .from("characters")
        .select("name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      characterName = char?.name;
    }

    const firstName = profile.first_name ?? "Creator";
    const daysSince = profile.last_active
      ? Math.floor((Date.now() - new Date(profile.last_active).getTime()) / 86400000)
      : null;

    await resend.emails.send({
      from:    "Gem <gem@omnyra.studio>",
      to:      profile.email,
      subject: characterName ? `${characterName} is still waiting for you` : "Your characters miss you",
      html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0D0010;color:#E8DEFF;padding:32px;max-width:560px;margin:0 auto">
  <div style="margin-bottom:24px">
    <span style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#E8B84B);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Omnyra</span>
  </div>
  <h2 style="font-size:20px;margin:0 0 16px;color:#fff">Hi ${firstName},</h2>
  <p style="color:#BBA8C8;margin:0 0 16px">
    It's been ${daysSince ? `${daysSince} days` : "a while"} since your last video.
  </p>
  <div style="background:rgba(75,30,130,0.5);border:1px solid rgba(232,121,249,0.25);border-radius:16px;padding:20px;margin-bottom:24px">
    <p style="margin:0;color:#fff">
      Your character <strong style="color:#E879F9">"${characterName ?? "your favorite character"}"</strong> is still saved — same face, same voice, same brand memory.
    </p>
    <p style="margin:12px 0 0;color:#8A7D92;font-size:13px">One click picks up exactly where you left off.</p>
  </div>
  <div style="text-align:center">
    <a href="${APP_URL}/create" style="display:inline-block;background:linear-gradient(105deg,#5A3400,#CFA42F,#E8C84A,#CFA42F,#5A3400);color:#0D0010;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">Continue This Story →</a>
  </div>
  <p style="color:#8A7D92;font-size:13px;margin-top:32px">We're here when you're ready.<br><strong style="color:#BBA8C8">Gem</strong><br>@ Omnyra</p>
  <p style="color:#4A4055;font-size:11px;margin-top:16px"><a href="${APP_URL}/account/notifications" style="color:#4A4055">Unsubscribe</a></p>
</body></html>`,
    });

    console.log(`[re-engagement] sent to ${profile.email}`);
    return new Response("Re-engagement sent", { status: 200 });
  } catch (err) {
    console.error("[re-engagement]", err);
    return new Response("Internal error", { status: 500 });
  }
});
