import nodemailer from 'nodemailer'
import { PLAN_LIMITS } from './credits.js'

const FROM = `Omnyra <${process.env.ZOHO_EMAIL || 'info@omnyra.studio'}>`
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://omnyra.studio'

function createTransporter() {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) return null
  return nodemailer.createTransport({
    host: 'smtp.zoho.com.au',
    port: 465,
    secure: true,
    auth: {
      user: process.env.ZOHO_EMAIL,
      pass: process.env.ZOHO_PASSWORD,
    },
  })
}

async function send({ to, subject, html }) {
  const transporter = createTransporter()
  if (!transporter) {
    console.log(`[email] No ZOHO credentials — skipping "${subject}" to ${to}`)
    return { success: true }
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html })
    return { success: true }
  } catch (err) {
    console.error('[email] Send failed:', err.message)
    return { success: false, error: err.message }
  }
}

function baseTemplate(content, preheader = '') {
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Omnyra</title>
</head>
<body style="margin:0;padding:0;background-color:#f0eeff;font-family:Arial,Helvetica,sans-serif">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f0eeff">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0eeff">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,0.12)">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#120d2b 0%,#1e1050 100%);padding:36px 48px;text-align:center">
              <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:0.2em;font-family:Arial,Helvetica,sans-serif">OMNYRA</div>
              <div style="font-size:11px;color:#a78bfa;letter-spacing:0.25em;text-transform:uppercase;margin-top:6px">AI Creative Studio</div>
            </td>
          </tr>

          ${content}

          <!-- Footer -->
          <tr>
            <td style="background:#f5f3ff;padding:28px 48px;text-align:center;border-top:1px solid #ede9fe">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-family:Arial,Helvetica,sans-serif">
                &copy; ${year} Omnyra &middot; <a href="${APP_URL}" style="color:#7c3aed;text-decoration:none">omnyra.studio</a>
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;font-family:Arial,Helvetica,sans-serif">
                You&rsquo;re receiving this because you have an Omnyra account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Welcome Email ─────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(to) {
  const features = [
    ['&#9997;&#65039;', 'Scripts', 'AI-powered scripts for TikTok, YouTube &amp; Reels'],
    ['&#128444;&#65039;', 'Images', 'Stunning visuals with Flux &amp; SDXL models'],
    ['&#127916;', 'Videos', 'Animate ideas with Pika, Kling &amp; Runway'],
    ['&#127897;&#65039;', 'Voice', 'Studio-quality voiceovers with ElevenLabs'],
  ]

  const content = `
  <tr>
    <td style="padding:48px 48px 40px">
      <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#1e1b4b;line-height:1.3;font-family:Arial,Helvetica,sans-serif">
        Welcome to Omnyra &#128075;
      </h1>
      <p style="margin:0 0 28px;font-size:16px;color:#4b5563;line-height:1.65;font-family:Arial,Helvetica,sans-serif">
        Your AI creative studio is ready. Turn ideas into scripts, images, videos, and voice &mdash; all in one place.
      </p>

      <!-- Free credits callout -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#ede9fe,#f5f3ff);border-radius:12px;margin-bottom:32px">
        <tr>
          <td style="padding:24px 28px">
            <div style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;font-family:Arial,Helvetica,sans-serif">Free Credits to Start</div>
            <div style="font-size:48px;font-weight:900;color:#1e1b4b;line-height:1;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">50</div>
            <div style="font-size:14px;color:#6b7280;font-family:Arial,Helvetica,sans-serif">credits on your account &mdash; no card required</div>
          </td>
        </tr>
      </table>

      <!-- Feature list -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:36px">
        ${features.map(([icon, title, desc], i) => `
        <tr>
          <td style="padding:14px 0;${i < features.length - 1 ? 'border-bottom:1px solid #f3f4f6' : ''}">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="font-size:22px;width:40px;vertical-align:middle">${icon}</td>
                <td style="padding-left:14px;vertical-align:middle">
                  <div style="font-size:15px;font-weight:700;color:#1e1b4b;font-family:Arial,Helvetica,sans-serif">${title}</div>
                  <div style="font-size:13px;color:#6b7280;margin-top:2px;font-family:Arial,Helvetica,sans-serif">${desc}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
      </table>

      <!-- CTA -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.02em">
              Start Creating &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`

  return send({
    to,
    subject: 'Welcome to Omnyra — your creative AI studio is ready',
    html: baseTemplate(content, 'Your AI creative studio is ready. 50 free credits await.'),
  })
}

// ── Subscription Confirmation ─────────────────────────────────────────────────
const PLAN_META = {
  creator: { label: 'Creator', price: 'A$29/mo', badge: '#0ea5e9', features: ['200 credits/month', 'No watermark on exports', '1-minute video generation', 'Priority queue'] },
  pro:     { label: 'Pro',     price: 'A$69/mo', badge: '#8b5cf6', features: ['500 credits/month', '3-minute video generation', '4K export quality', 'Batch generation'] },
  studio:  { label: 'Studio',  price: 'A$99/mo', badge: '#f59e0b', features: ['1,500 credits/month', '5-minute video generation', 'All premium AI models', 'Commercial license'] },
}

export async function sendSubscriptionConfirmation(to, { plan, credits }) {
  const meta = PLAN_META[plan] || { label: plan.charAt(0).toUpperCase() + plan.slice(1), price: '', badge: '#7c3aed', features: [`${credits} credits/month`] }

  const content = `
  <tr>
    <td style="padding:48px 48px 40px">
      <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#1e1b4b;line-height:1.3;font-family:Arial,Helvetica,sans-serif">
        You&rsquo;re on ${meta.label} &#127881;
      </h1>
      <p style="margin:0 0 32px;font-size:16px;color:#4b5563;line-height:1.65;font-family:Arial,Helvetica,sans-serif">
        Your subscription is active and your credits are loaded. Time to create.
      </p>

      <!-- Plan card -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#120d2b,#1e1050);border-radius:14px;margin-bottom:32px">
        <tr>
          <td style="padding:30px 32px">
            <div style="display:inline-block;background:${meta.badge};color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;padding:5px 14px;border-radius:20px;margin-bottom:20px;font-family:Arial,Helvetica,sans-serif">${meta.label} Plan</div>
            <div style="font-size:48px;font-weight:900;color:#ffffff;line-height:1;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">${credits.toLocaleString()}</div>
            <div style="font-size:15px;color:#a78bfa;margin-bottom:24px;font-family:Arial,Helvetica,sans-serif">credits added to your account</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(255,255,255,0.12);padding-top:20px">
              ${meta.features.map(f => `
              <tr>
                <td style="color:#e5d4ff;font-size:13px;padding:5px 0;font-family:Arial,Helvetica,sans-serif">
                  <span style="color:#a78bfa;margin-right:8px">&#10003;</span>${f}
                </td>
              </tr>`).join('')}
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 32px;font-size:14px;color:#6b7280;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
        Credits reset monthly on your billing date. Unused credits do not roll over.
      </p>

      <!-- CTA -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">
              Go to Dashboard &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`

  return send({
    to,
    subject: `You're on Omnyra ${meta.label} — let's create something amazing`,
    html: baseTemplate(content, `${credits.toLocaleString()} credits are ready. Let's create.`),
  })
}

// ── Credit Low Warning ────────────────────────────────────────────────────────
export async function sendCreditLowWarning(to, { balance, planCredits, plan }) {
  const pct = planCredits > 0 ? Math.round((balance / planCredits) * 100) : 0
  const blocks = Math.max(Math.round(pct / 5), 0)
  const bar = '&#9608;'.repeat(blocks) + '&#9617;'.repeat(20 - blocks)
  const isFreeTier = plan === 'free'
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  const content = `
  <tr>
    <td style="padding:48px 48px 40px">
      <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#1e1b4b;line-height:1.3;font-family:Arial,Helvetica,sans-serif">
        &#9888; Credits running low
      </h1>
      <p style="margin:0 0 32px;font-size:16px;color:#4b5563;line-height:1.65;font-family:Arial,Helvetica,sans-serif">
        You&rsquo;re down to your last <strong>${balance}</strong> credits on your ${planLabel} plan. Don&rsquo;t let your creative momentum stop.
      </p>

      <!-- Balance display -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7ed;border:2px solid #fed7aa;border-radius:12px;margin-bottom:32px">
        <tr>
          <td style="padding:28px 32px">
            <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif">Current Balance</div>
            <div style="font-size:52px;font-weight:900;color:#1e1b4b;line-height:1;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">${balance}</div>
            <div style="font-size:14px;color:#6b7280;margin-bottom:18px;font-family:Arial,Helvetica,sans-serif">of ${planCredits.toLocaleString()} credits remaining</div>
            <div style="font-family:monospace;font-size:14px;color:#f59e0b;letter-spacing:1px">${bar}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:8px;font-family:Arial,Helvetica,sans-serif">${pct}% remaining</div>
          </td>
        </tr>
      </table>

      ${isFreeTier ? `
      <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
        Upgrade to unlock more credits, remove watermarks, and access premium AI models.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${APP_URL}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">
              View Plans &rarr;
            </a>
          </td>
        </tr>
      </table>` : `
      <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
        Your credits reset on your next billing date. Use them wisely &mdash; or upgrade for more creative power.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">
              Continue Creating &rarr;
            </a>
          </td>
        </tr>
      </table>`}
    </td>
  </tr>`

  return send({
    to,
    subject: `You have ${balance} Omnyra credits left`,
    html: baseTemplate(content, `Only ${balance} credits remaining. Keep your creative flow going.`),
  })
}

// ── Onboarding Welcome (from Gem, founder) ───────────────────────────────
export async function sendOnboardingWelcome(to, { firstName = null, credits = 30 } = {}) {
  const name = firstName || "there";

  const steps = [
    { n: "01", title: "Create your character", desc: "Upload a face photo and record a voice sample. Omnyra remembers both — no re-uploading ever." },
    { n: "02", title: "Set up Brand Memory",   desc: "Tell Omnyra your niche, style, and what hooks work. It injects this into every video you make." },
    { n: "03", title: "Generate your first video", desc: "Pick a template, describe your idea, and let Omnyra's production engine handle the rest." },
  ];

  const content = `
  <tr>
    <td style="padding:48px 48px 40px">
      <div style="margin-bottom:28px">
        <div style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.15em;font-family:Arial,Helvetica,sans-serif;margin-bottom:8px">From the founder</div>
        <div style="width:40px;height:3px;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:2px"></div>
      </div>

      <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#1e1b4b;line-height:1.3;font-family:Arial,Helvetica,sans-serif">
        Hey ${name}, welcome to Omnyra.
      </h1>
      <p style="margin:0 0 16px;font-size:16px;color:#4b5563;line-height:1.7;font-family:Arial,Helvetica,sans-serif">
        I&rsquo;m Gem, the founder. I built Omnyra because creators kept making content that looked great but performed inconsistently &mdash; and the reason was always the same: no memory.
      </p>
      <p style="margin:0 0 28px;font-size:16px;color:#4b5563;line-height:1.7;font-family:Arial,Helvetica,sans-serif">
        Omnyra is the only AI video platform with <strong style="color:#1e1b4b">persistent memory</strong>. Your characters remember their face, voice, and identity. Your brand voice accumulates over time. Every video you make teaches Omnyra to make the next one better.
      </p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#ede9fe,#f5f3ff);border-radius:12px;margin-bottom:32px">
        <tr>
          <td style="padding:22px 28px">
            <div style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;font-family:Arial,Helvetica,sans-serif">Your Starting Credits</div>
            <div style="font-size:48px;font-weight:900;color:#1e1b4b;line-height:1;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif">${credits}</div>
            <div style="font-size:14px;color:#6b7280;font-family:Arial,Helvetica,sans-serif">credits ready &mdash; no card required to start</div>
          </td>
        </tr>
      </table>

      <div style="font-size:13px;font-weight:700;color:#1e1b4b;margin-bottom:16px;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.1em">Quick Start</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:36px">
        ${steps.map(({ n, title, desc }, i) => `
        <tr>
          <td style="padding:14px 0;${i < steps.length - 1 ? 'border-bottom:1px solid #f3f4f6' : ''}">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="width:36px;vertical-align:top;padding-top:2px">
                  <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);text-align:center;line-height:28px;font-size:11px;font-weight:800;color:#fff;font-family:Arial,Helvetica,sans-serif">${n}</div>
                </td>
                <td style="padding-left:14px;vertical-align:top">
                  <div style="font-size:15px;font-weight:700;color:#1e1b4b;font-family:Arial,Helvetica,sans-serif;margin-bottom:4px">${title}</div>
                  <div style="font-size:13px;color:#6b7280;line-height:1.55;font-family:Arial,Helvetica,sans-serif">${desc}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:36px">
        <tr>
          <td align="center">
            <a href="${APP_URL}/create" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.02em">
              Start Your First Video &rarr;
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;font-family:Arial,Helvetica,sans-serif">
        If you ever need help or want to share feedback, just reply to this email. I read every one.
      </p>
      <p style="margin:16px 0 0;font-size:14px;color:#4b5563;font-family:Arial,Helvetica,sans-serif">
        &mdash; Gem<br>
        <span style="color:#9ca3af">Founder @ Omnyra</span>
      </p>
    </td>
  </tr>`

  return send({
    to,
    subject: 'Welcome to Omnyra — Your AI Video Operating System',
    html: baseTemplate(content, `Hey ${name}, welcome. Your AI video operating system is ready.`),
  })
}

// ── Post-Generation Thank You ─────────────────────────────────────────────
export async function sendPostGenerationThankYou(to, { firstName = null, videoUrl = null, intelligenceTip = null } = {}) {
  const name = firstName || 'Creator';

  const content = `
  <tr>
    <td style="padding:48px 48px 40px">
      <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#1e1b4b;line-height:1.3;font-family:Arial,Helvetica,sans-serif">
        Your video is ready &#10024;
      </h1>
      <p style="margin:0 0 28px;font-size:16px;color:#4b5563;line-height:1.65;font-family:Arial,Helvetica,sans-serif">
        Hey ${name}, your Omnyra video just finished rendering and has been saved to your library.
      </p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:32px">
        <tr>
          <td align="center">
            <a href="${videoUrl || `${APP_URL}/dashboard`}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">
              Watch Your Video &rarr;
            </a>
          </td>
        </tr>
      </table>

      ${intelligenceTip ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#120d2b,#1e1050);border-radius:14px;margin-bottom:32px">
        <tr>
          <td style="padding:26px 28px">
            <div style="font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif">&#128161; Creator Intelligence</div>
            <p style="margin:0;font-size:15px;color:#e5d4ff;line-height:1.65;font-family:Arial,Helvetica,sans-serif">${intelligenceTip}</p>
          </td>
        </tr>
      </table>` : ''}

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:36px">
        <tr>
          <td align="center">
            <a href="${APP_URL}/create" style="display:inline-block;background:transparent;border:1px solid #7c3aed;color:#7c3aed;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;margin-right:12px">Continue This Story</a>
            <a href="${APP_URL}/create?mode=brand" style="display:inline-block;background:transparent;border:1px solid #7c3aed;color:#7c3aed;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:Arial,Helvetica,sans-serif">Remix with Brand Memory</a>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:14px;color:#6b7280;font-family:Arial,Helvetica,sans-serif">
        Keep creating with memory,<br>
        <strong style="color:#4b5563">Gem</strong><br>
        <span style="color:#9ca3af">Founder @ Omnyra</span>
      </p>
    </td>
  </tr>`

  return send({
    to,
    subject: "Your video is ready — here’s what Omnyra noticed",
    html: baseTemplate(content, `${name}, your Omnyra video is ready. Watch it now.`),
  })
}

// ── Monthly Usage Summary ─────────────────────────────────────────────────────
export async function sendMonthlySummary(to, { plan, creditsUsed, creditsRemaining, planCredits, month, year }) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'long' })
  const pctUsed = planCredits > 0 ? Math.round((creditsUsed / planCredits) * 100) : 0
  const isFreeTier = plan === 'free'
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)
  const planCreditsFormatted = (PLAN_LIMITS[plan]?.credits ?? planCredits).toLocaleString()

  const content = `
  <tr>
    <td style="padding:48px 48px 40px">
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#1e1b4b;line-height:1.3;font-family:Arial,Helvetica,sans-serif">
        Your ${monthName} Summary
      </h1>
      <p style="margin:0 0 36px;font-size:16px;color:#6b7280;font-family:Arial,Helvetica,sans-serif">
        Here&rsquo;s how you used Omnyra in ${monthName} ${year}.
      </p>

      <!-- Stats row -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px">
        <tr>
          <td width="48%" valign="top" style="background:#f5f3ff;border-radius:12px;padding:22px 24px">
            <div style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;font-family:Arial,Helvetica,sans-serif">Credits Used</div>
            <div style="font-size:38px;font-weight:900;color:#1e1b4b;line-height:1;font-family:Arial,Helvetica,sans-serif">${creditsUsed.toLocaleString()}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:6px;font-family:Arial,Helvetica,sans-serif">${pctUsed}% of your ${planLabel} plan</div>
          </td>
          <td width="4%">&nbsp;</td>
          <td width="48%" valign="top" style="background:#f0fdf4;border-radius:12px;padding:22px 24px">
            <div style="font-size:12px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;font-family:Arial,Helvetica,sans-serif">Remaining</div>
            <div style="font-size:38px;font-weight:900;color:#1e1b4b;line-height:1;font-family:Arial,Helvetica,sans-serif">${creditsRemaining.toLocaleString()}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:6px;font-family:Arial,Helvetica,sans-serif">resets next billing date</div>
          </td>
        </tr>
      </table>

      <!-- Plan info -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#120d2b,#1e1050);border-radius:12px;margin-bottom:32px">
        <tr>
          <td style="padding:22px 28px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td>
                  <div style="font-size:13px;color:#a78bfa;font-family:Arial,Helvetica,sans-serif">Current Plan</div>
                  <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px;font-family:Arial,Helvetica,sans-serif">${planLabel}</div>
                </td>
                <td align="right">
                  <div style="font-size:13px;color:#a78bfa;font-family:Arial,Helvetica,sans-serif">Monthly Allowance</div>
                  <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px;font-family:Arial,Helvetica,sans-serif">${planCreditsFormatted} credits</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${isFreeTier ? `
      <!-- Upgrade nudge -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ede9fe;border-radius:12px;margin-bottom:32px">
        <tr>
          <td style="padding:22px 28px">
            <div style="font-size:16px;font-weight:700;color:#1e1b4b;margin-bottom:8px;font-family:Arial,Helvetica,sans-serif">Ready for more?</div>
            <div style="font-size:14px;color:#4b5563;margin-bottom:16px;font-family:Arial,Helvetica,sans-serif">Unlock more credits, no watermarks, and premium AI models.</div>
            <a href="${APP_URL}/#pricing" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 26px;border-radius:8px;font-family:Arial,Helvetica,sans-serif">
              See Plans &rarr;
            </a>
          </td>
        </tr>
      </table>` : ''}

      <!-- CTA -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:17px 44px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">
              Back to Studio &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`

  return send({
    to,
    subject: `Your Omnyra ${monthName} ${year} summary`,
    html: baseTemplate(content, `You used ${creditsUsed.toLocaleString()} credits in ${monthName}. Here's your full summary.`),
  })
}
