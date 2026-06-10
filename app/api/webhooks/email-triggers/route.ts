/**
 * POST /api/webhooks/email-triggers
 *
 * Internal webhook for automated email sends, triggered by Supabase pg_cron
 * or directly from API routes after generation.
 * Protected by CRON_SECRET to prevent unauthenticated abuse.
 *
 * Body: { type: string; userId: string; payload: Record<string, unknown> }
 * Types: "weekly-digest" | "low-credits" | "re-engagement" | "post-generation"
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";

export const maxDuration = 20;

const resend = new Resend(process.env.RESEND_API_KEY);
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnyra.studio";

const FOOTER = (sig = "Gem") =>
  `<p style="margin-top:40px;color:#888;font-size:13px;line-height:1.6">— <strong style="color:#BBA8C8">${sig}</strong><br>Founder @ Omnyra</p>
   <p style="margin-top:16px;font-size:11px"><a href="${APP_URL}/account/notifications" style="color:#444">Unsubscribe</a></p>`;

const LOGO =
  `<div style="margin-bottom:28px"><span style="font-size:22px;font-weight:900;background:linear-gradient(90deg,#CFA42F,#E8B84B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Omnyra</span></div>`;

const WRAPPER = (inner: string) =>
  `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">
   <div style="max-width:600px;margin:0 auto;background:#111;padding:40px;border-radius:16px;border:1px solid rgba(168,85,247,0.15)">
     ${LOGO}${inner}
   </div></body></html>`;

interface EmailPayload {
  topVideoTitle?:      string;
  views?:              number;
  avgWatchTime?:       number;
  bestStyle?:          string;
  improvement?:        number;
  suggestion?:         string;
  remainingCredits?:   number;
  estimatedVideos?:    number;
  characterName?:      string;
  daysSinceLastVideo?: number;
  videoUrl?:           string;
  intelligenceTip?:    string;
  template?:           string;
}

interface TriggerBody {
  type:     string;
  userId:   string;
  payload?: EmailPayload;
  secret?:  string;
}

function buildEmail(type: string, firstName: string, p: EmailPayload): { subject: string; html: string } | null {
  const name = firstName || "Creator";

  switch (type) {

    case "weekly-digest":
      return {
        subject: p.topVideoTitle
          ? `Your Omnyra Weekly Recap — "${p.topVideoTitle}" got ${p.views ?? 0} views`
          : `Your Omnyra Weekly Recap`,
        html: WRAPPER(`
  <h2 style="color:#a855f7;font-size:22px;margin:0 0 12px">Hey ${name},</h2>
  <p style="color:#aaa;margin:0 0 24px">Here's how your content performed this week:</p>

  <div style="background:#1a1a1a;padding:20px;border-radius:12px;margin:0 0 16px;border-left:3px solid #a855f7">
    <p style="margin:0 0 6px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.1em">Top Video</p>
    <p style="margin:0;font-size:16px;font-weight:600;color:#e5e5e5">"${p.topVideoTitle || "—"}"</p>
    <p style="margin:6px 0 0;color:#aaa;font-size:14px">${p.views ?? 0} views · ${p.avgWatchTime ?? 0}% avg watch time</p>
  </div>

  ${p.bestStyle ? `
  <div style="background:#1a1a1a;padding:16px 20px;border-radius:12px;margin:0 0 16px">
    <p style="margin:0;color:#aaa;font-size:14px"><strong style="color:#c084fc">Best Style:</strong> ${p.bestStyle}${p.improvement ? ` <span style="color:#4ade80">+${p.improvement}% above average</span>` : ""}</p>
  </div>` : ""}

  ${p.suggestion ? `
  <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);padding:16px 20px;border-radius:12px;margin:0 0 28px">
    <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Intelligence Tip</p>
    <p style="margin:0;color:#e5e5e5;line-height:1.6">${p.suggestion}</p>
  </div>` : `<div style="margin-bottom:28px"></div>`}

  <p>
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#a855f7;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View All Videos</a>
    <a href="${APP_URL}/create" style="display:inline-block;margin-left:14px;color:#c084fc;font-size:14px;text-decoration:none">Generate Next One →</a>
  </p>

  <p style="margin-top:36px;color:#888;font-size:13px;line-height:1.7">Keep creating with memory,<br><strong style="color:#bbb">Gem</strong><br>Founder @ Omnyra</p>
  <p style="margin-top:16px;font-size:11px"><a href="${APP_URL}/account/notifications" style="color:#444">Unsubscribe from weekly emails</a></p>`),
      };

    case "low-credits":
      return {
        subject: "You're running low on credits — keep creating",
        html: WRAPPER(`
  <h2 style="color:#e5e5e5;font-size:20px;margin:0 0 16px">Hi ${name},</h2>
  <p style="color:#aaa;margin:0 0 20px">You've got <strong style="color:#e5e5e5">${p.remainingCredits ?? 0} credits</strong> left.</p>
  ${(p.estimatedVideos ?? 0) > 0 ? `<p style="color:#aaa;margin:0 0 28px">That's roughly <strong style="color:#e5e5e5">${p.estimatedVideos}</strong> more videos.</p>` : `<p style="color:#aaa;margin:0 0 28px">Don't lose your story arc momentum.</p>`}

  <p style="margin:0 0 24px">
    <a href="${APP_URL}/account/billing" style="display:inline-block;background:#22c55e;color:#000;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">Buy Credit Pack</a>
    <a href="${APP_URL}/pricing" style="display:inline-block;margin-left:14px;color:#86efac;font-size:14px;text-decoration:none">Upgrade Plan →</a>
  </p>

  <p style="color:#aaa;font-size:14px;margin:0 0 4px">Need help choosing a plan? Just reply to this email.</p>
  ${FOOTER()}`),
      };

    case "re-engagement":
      return {
        subject: p.characterName ? `${p.characterName} is still waiting for you` : "Your characters miss you",
        html: WRAPPER(`
  <h2 style="color:#e5e5e5;font-size:20px;margin:0 0 16px">Hi ${name},</h2>
  <p style="color:#aaa;margin:0 0 16px">It's been ${p.daysSinceLastVideo ? `<strong style="color:#e5e5e5">${p.daysSinceLastVideo} days</strong>` : "a while"} since your last video.</p>

  <div style="background:#1a1a1a;border:1px solid rgba(232,121,249,0.2);padding:20px;border-radius:12px;margin:0 0 28px">
    <p style="margin:0;color:#e5e5e5;line-height:1.6">Your character <strong style="color:#e879f9">"${p.characterName || "your favorite character"}"</strong> is still saved — same face, same voice, same brand memory.</p>
    <p style="margin:10px 0 0;color:#aaa;font-size:13px">One click picks up exactly where you left off.</p>
  </div>

  <p style="margin:0 0 20px">
    <a href="${APP_URL}/create" style="display:inline-block;background:#a855f7;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">Continue This Story →</a>
  </p>
  ${FOOTER()}`),
      };

    case "post-generation":
      return {
        subject: "Your video is ready — Omnyra noticed something",
        html: WRAPPER(`
  <h2 style="color:#e5e5e5;font-size:20px;margin:0 0 16px">Hey ${name},</h2>
  <p style="color:#aaa;margin:0 0 20px">Your latest video is ready and saved.</p>

  ${p.intelligenceTip ? `
  <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);padding:20px;border-radius:12px;margin:0 0 28px">
    <p style="margin:0 0 8px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.12em">Creator Intelligence Insight</p>
    <p style="margin:0;color:#e5e5e5;line-height:1.7;font-size:15px">${p.intelligenceTip}</p>
  </div>` : `<div style="margin-bottom:28px"></div>`}

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px">
    ${p.videoUrl ? `<a href="${p.videoUrl}" style="display:inline-block;background:#a855f7;color:white;padding:11px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Video</a>` : ""}
    <a href="${APP_URL}/create" style="display:inline-block;background:#1a1a1a;border:1px solid rgba(168,85,247,0.3);color:#c084fc;padding:11px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Continue This Story</a>
    <a href="${APP_URL}/create?remix=brand" style="display:inline-block;background:#1a1a1a;border:1px solid rgba(168,85,247,0.3);color:#c084fc;padding:11px 22px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Remix with Brand</a>
  </div>

  <p style="color:#888;font-size:13px;margin:0 0 4px;line-height:1.6">Thank you for creating with memory.<br>Your consistency is building something real.</p>
  ${FOOTER()}`),
      };

    case "welcome":
      return {
        subject: "Welcome to Omnyra — Your AI Video Operating System",
        html: WRAPPER(`
  <h2 style="color:#a855f7;font-size:22px;margin:0 0 12px">Welcome aboard, ${name}!</h2>
  <p style="color:#aaa;margin:0 0 24px;line-height:1.6">You now have a powerful tool that <strong style="color:#e5e5e5">remembers your brand and characters</strong> — every video you create makes the next one better.</p>

  <p style="color:#e5e5e5;font-size:15px;font-weight:600;margin:0 0 12px">Quick Start:</p>
  <ol style="color:#aaa;line-height:2;padding-left:20px;margin:0 0 28px">
    <li>Go to <a href="${APP_URL}/create" style="color:#c084fc">Create New Video</a></li>
    <li>Enable "Use Brand Memory" and add a character</li>
    <li>Generate your first video — about 60 seconds</li>
  </ol>

  <p style="margin:0 0 24px">
    <a href="${APP_URL}/create" style="display:inline-block;background:#a855f7;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">Start Creating →</a>
  </p>
  <p style="color:#aaa;font-size:13px;margin:0 0 4px">Reply anytime if you need help. I read every reply.</p>
  ${FOOTER("Gem")}`),
      };

    default:
      return null;
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");

  let body: TriggerBody;
  try { body = await req.json() as TriggerBody; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (CRON_SECRET) {
    const incomingSecret = body.secret ?? authHeader?.replace("Bearer ", "");
    if (incomingSecret !== CRON_SECRET) {
      console.warn("[email-triggers] Unauthorized attempt");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { type, userId, payload = {} } = body;
  if (!type || !userId) {
    return Response.json({ error: "Missing type or userId" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("[email-triggers] RESEND_API_KEY not set — skipping send");
    return Response.json({ error: "Email not configured" }, { status: 503 });
  }

  // Fetch user profile
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name")
    .eq("id", userId)
    .single();

  if (!user?.email) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const content = buildEmail(type, user.first_name ?? "", payload);
  if (!content) {
    return Response.json({ error: `Unknown trigger type: ${type}` }, { status: 400 });
  }

  try {
    const result = await resend.emails.send({
      from:    "Gem <gem@omnyra.studio>",
      to:      user.email,
      subject: content.subject,
      html:    content.html,
    });

    console.log(`[email-triggers] sent type=${type} userId=${userId} id=${result.data?.id}`);
    return Response.json({ success: true, type, emailId: result.data?.id });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Email send failed";
    console.error("[email-triggers]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
