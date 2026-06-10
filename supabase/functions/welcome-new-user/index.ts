// Supabase Edge Function: welcome-new-user
// Triggered on auth.users INSERT via Supabase webhook or pg trigger.

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
      .select("email, first_name, plan, credits")
      .eq("id", userId)
      .single();

    if (!profile?.email) return new Response("User not found", { status: 404 });

    const firstName = profile.first_name ?? "Creator";
    const credits   = profile.credits ?? 30;

    await resend.emails.send({
      from:    "Gem <gem@omnyra.studio>",
      to:      profile.email,
      subject: "Welcome to Omnyra — Your AI Video Operating System",
      html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">
<div style="max-width:600px;margin:0 auto;background:#111;padding:40px;border-radius:16px;border:1px solid rgba(168,85,247,0.15)">
  <div style="margin-bottom:28px"><span style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#E8B84B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Omnyra</span></div>

  <h2 style="color:#a855f7;font-size:22px;margin:0 0 12px">Welcome aboard, ${firstName}!</h2>
  <p style="color:#aaa;margin:0 0 24px;line-height:1.6">You now have a powerful tool that <strong style="color:#e5e5e5">remembers your brand and characters</strong> — every video you create makes the next one better.</p>

  <div style="background:#1a1a1a;padding:20px;border-radius:12px;margin:0 0 24px;border-left:3px solid #a855f7">
    <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.1em">Your Starting Credits</p>
    <p style="margin:0;font-size:40px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#F7D96B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${credits}</p>
    <p style="margin:4px 0 0;color:#888;font-size:13px">Enough for ${Math.floor(credits / 10)}+ videos</p>
  </div>

  <p style="color:#e5e5e5;font-size:15px;font-weight:600;margin:0 0 12px">Quick Start:</p>
  <ol style="color:#aaa;line-height:2;padding-left:20px;margin:0 0 28px">
    <li>Go to <a href="${APP_URL}/create" style="color:#c084fc">Create New Video</a></li>
    <li>Enable "Use Brand Memory" and optionally add a character</li>
    <li>Generate your first video — it takes about 60 seconds</li>
  </ol>

  <p style="margin:0 0 24px">
    <a href="${APP_URL}/create" style="display:inline-block;background:#a855f7;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">Start Creating →</a>
  </p>

  <p style="color:#aaa;font-size:13px;margin:0 0 4px;line-height:1.6">Reply to this email anytime if you need help.<br>I read every reply personally.</p>
  <p style="margin-top:32px;color:#888;font-size:13px;line-height:1.6">Excited to see what you create,<br><strong style="color:#bbb">Gem</strong><br>Founder @ Omnyra</p>
  <p style="margin-top:16px;font-size:11px"><a href="${APP_URL}/account/notifications" style="color:#444">Manage email preferences</a></p>
</div>
</body></html>`,
    });

    console.log(`[welcome-new-user] sent to ${profile.email}`);
    return new Response("Welcome email sent", { status: 200 });
  } catch (err) {
    console.error("[welcome-new-user]", err);
    return new Response("Internal error", { status: 500 });
  }
});
