// app/api/generate/route.js
// Omnyra AI — Multi-API Orchestration Layer
// Claude writes · Pika/Kling animates · ElevenLabs voices · D-ID avatars

import { getUserAndPlan } from '../../../lib/auth'
import { getBrandProfile, getBrandSystemPrompt } from '../../../lib/brand'
import { checkCache, saveCache, logUsageEvent } from '../../../lib/cache'

const MODE_CONTEXTS = {
  viral:      "VIRAL MODE: Write for maximum engagement, FYP hooks, emotional triggers. Short punchy sentences. Open loops. Power words.",
  strategist: "STRATEGIST MODE: Think in systems and growth frameworks. Be structured, data-aware and actionable.",
  research:   "RESEARCH MODE: Be thorough and analytical. Surface non-obvious insights. Use clear structured sections.",
  creator:    "CREATOR MODE: Be creative and full of fresh unexpected angles. Be the spark that ignites great content.",
  truth:      "TRUTH MODE: Be factual, balanced and precise. No exaggeration. Evidence-based.",
  edu:        "EDUCATIONAL MODE: Explain simply. Step by step. Real-world examples. No jargon.",
  genius:     "GENIUS MODE: World-class expert analysis. Insider knowledge. Top 1% insights. Real examples and data."
};

const TONE_CONTEXTS = {
  emotional:     "Tone: deeply emotional, personal, vulnerable — make people feel something",
  funny:         "Tone: genuinely funny, unexpected humour, comedic timing, light energy",
  dramatic:      "Tone: high stakes, intense, cinematic drama — every word matters",
  inspirational: "Tone: uplifting, motivational, belief-building — make people want to act",
  luxury:        "Tone: sophisticated, premium, exclusive — aspirational and polished",
  cinematic:     "Tone: visual storytelling, scene-based, movie-like pacing and atmosphere",
  meme:          "Tone: internet-native, self-aware, chaotic good, perfectly timed reactions",
  educational:   "Tone: clear, warm, accessible — like a great teacher explaining simply"
};

const FORMAT_RULES = `
FORMATTING:
- Clear section headers in CAPITALS
- Blank line between each section
- Short paragraphs max 3 sentences
- Numbered lists for sequences
- Easy to read on a phone`;

// ============================================================
// SCRIPT STUDIO — 5 Directions
// ============================================================
function scriptDirectionsPrompt(mode, tone, platform, length) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}
${TONE_CONTEXTS[tone] || ""}

You are Omnyra Script Studio — generating 5 completely different creative script directions for a ${platform} video (target length: ${length}).

Respond with ONLY valid JSON. No text outside the JSON.

{
  "directions": [
    {
      "id": 1,
      "angle": "2-3 word direction name",
      "icon": "single emoji",
      "tone": "one word describing the emotional energy",
      "hook": "The opening line — first 3 seconds of the video",
      "premise": "One sentence — what this version is actually about"
    },
    { "id": 2, "angle": "...", "icon": "...", "tone": "...", "hook": "...", "premise": "..." },
    { "id": 3, "angle": "...", "icon": "...", "tone": "...", "hook": "...", "premise": "..." },
    { "id": 4, "angle": "...", "icon": "...", "tone": "...", "hook": "...", "premise": "..." },
    { "id": 5, "angle": "...", "icon": "...", "tone": "...", "hook": "...", "premise": "..." }
  ]
}

Make each direction genuinely different. Think: Emotional, Viral/Funny, Documentary, Inspirational, Controversial.`;
}

// ============================================================
// SCRIPT STUDIO — Expand direction into full voice-ready script
// ============================================================
function scriptExpandPrompt(mode, tone, platform, length, direction) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}
${TONE_CONTEXTS[tone] || ""}

You are Omnyra Script Studio. Expand the "${direction.angle}" direction into a FULL VOICE-READY script for ${platform} (target: ${length}).

CRITICAL: Format for ElevenLabs voice narration and avatar lip-sync.
Use [PAUSE] for natural breathing pauses.
Use CAPS for emphasis words.
Use ... for dramatic effect.

Respond with ONLY valid JSON. No text outside the JSON.

{
  "hook": "First 3 seconds — the scroll-stopper. One punchy line.",
  "script": "Full voice-ready script with [PAUSE] markers and CAPS emphasis. Natural spoken rhythm. Scene breaks marked as [SCENE 2], [SCENE 3] etc.",
  "scenePlan": "Scene-by-scene visual breakdown. 3-5 scenes numbered.",
  "audioMood": "Music vibe and sound design notes",
  "retentionNotes": "2-3 specific retention tips e.g. 'Add visual change at 0:07'",
  "voiceStyle": "Recommended delivery style for ElevenLabs / narration",
  "caption": "Social media caption max 160 chars",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8"],
  "cta": "Call to action — final line of the video"
}`;
}

// ============================================================
// SCRIPT STUDIO — Regenerate one section
// ============================================================
function scriptRegenPrompt(mode, tone, section, context) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}
${TONE_CONTEXTS[tone] || ""}

Regenerate ONLY the "${section}" section for this video script.
Context: ${context}
Return ONLY the new content for that section. No labels. No JSON. Just the content.`;
}

// ============================================================
// ONE-CLICK — 5 Creative Directions
// ============================================================
function oneClickDirectionsPrompt(mode, tone, platform, style) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}
${TONE_CONTEXTS[tone] || ""}

You are Omnyra's AI Creative Director. Generate 5 completely different creative directions for a ${platform} video in ${style} style.

ORCHESTRATION STACK: Claude writes → Pika/Kling animates → ElevenLabs voices → D-ID avatars → Omnyra combines.

Respond with ONLY valid JSON. No text outside the JSON.

{
  "directions": [
    {
      "id": 1,
      "angle": "2-3 word name",
      "icon": "emoji",
      "vibe": "One sentence describing the energy and tone",
      "hook": "The opening line — first 3 seconds",
      "apiPlan": "Which APIs will power this direction e.g. Claude + ElevenLabs + Pika"
    },
    { "id": 2, "angle": "...", "icon": "...", "vibe": "...", "hook": "...", "apiPlan": "..." },
    { "id": 3, "angle": "...", "icon": "...", "vibe": "...", "hook": "...", "apiPlan": "..." },
    { "id": 4, "angle": "...", "icon": "...", "vibe": "...", "hook": "...", "apiPlan": "..." },
    { "id": 5, "angle": "...", "icon": "...", "vibe": "...", "hook": "...", "apiPlan": "..." }
  ]
}

Make each direction genuinely different in tone, audience psychology and creative approach.`;
}

// ============================================================
// ONE-CLICK — Expand into full production package
// ============================================================
function oneClickExpandPrompt(mode, tone, platform, style, direction) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}
${TONE_CONTEXTS[tone] || ""}

You are Omnyra's AI Creative Director. Build the complete "${direction.angle}" production package for ${platform} in ${style} style.
Direction vibe: ${direction.vibe}
Hook: ${direction.hook}
API plan: ${direction.apiPlan}

This is the orchestration workflow:
- Claude (you) writes the script and strategy
- Pika Labs / Kling AI will animate the visuals
- ElevenLabs will voice the narration
- D-ID will generate the avatar presenter

Respond with ONLY valid JSON. No text outside the JSON.

{
  "hook": "Perfect scroll-stopping opening line",
  "script": "Full voice-ready script with [PAUSE] markers and CAPS emphasis for ElevenLabs. Mark scene breaks as [SCENE 2] etc.",
  "scenePlan": "3-4 numbered scenes with visual descriptions for Pika/Kling",
  "voiceStyle": "ElevenLabs voice recommendation and delivery style",
  "avatarStyle": "D-ID avatar recommendation for this content style",
  "audioMood": "Music and sound design direction",
  "caption": "Social media caption max 160 chars",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8"],
  "thumbnailIdea": "Perfect thumbnail description in one sentence",
  "cta": "Strong call to action — final line"
}`;
}

// ============================================================
// CAPTION TOOL — 5 options
// ============================================================
function captionPrompt(mode) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}

Generate EXACTLY 5 caption options. Each has a max 160-char caption + exactly 5 hashtags.
Respond with ONLY valid JSON. No other text.

{
  "options": [
    { "caption": "max 160 chars", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"] },
    { "caption": "max 160 chars", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"] },
    { "caption": "max 160 chars", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"] },
    { "caption": "max 160 chars", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"] },
    { "caption": "max 160 chars", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"] }
  ]
}

Each caption must be different in tone and angle. Make them compelling and platform-ready.`;
}

// ============================================================
// RESEARCH STUDIO
// ============================================================
function researchPrompt(mode) {
  return `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}

You are Research Studio — a powerful AI research and study assistant inside Omnyra AI.
Explain, research, summarise, study, compare, analyse anything.
Format with clear headers, spacing and short paragraphs.
No character limit — give as complete an answer as the question deserves.`;
}

// ============================================================
// MAIN API ROUTE
// ============================================================
export async function POST(request) {
  try {
    const { user } = await getUserAndPlan(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json();
    const { tool, prompt, mode, phase, platform, style, tone, length, direction, section, context } = body;

    let brandCtx = "";
    try {
      const brand = await getBrandProfile(user.id);
      brandCtx = getBrandSystemPrompt(brand);
    } catch { /* brand injection is optional */ }

    const cacheInput = JSON.stringify({ tool, prompt, mode, phase, platform, style, tone, length, direction: direction?.id ?? null, section });
    const cached = await checkCache(user.id, "generate", cacheInput);
    if (cached) {
      try { return Response.json({ ...JSON.parse(cached), cached: true }); } catch { /* regenerate */ }
    }

    if (!prompt && !direction && phase !== "regenerate") {
      return Response.json({ error: "Please enter a topic or idea first." }, { status: 400 });
    }

    let systemPrompt = "";
    let userMessage  = prompt || "";
    let maxTokens    = 800;
    let expectJSON   = false;

    // ─── SCRIPT STUDIO ───
    if (tool === "script" && phase === "directions") {
      systemPrompt = scriptDirectionsPrompt(mode, tone, platform || "TikTok", length || "1 min") + brandCtx;
      userMessage  = `Creator's idea: ${prompt}`;
      maxTokens    = 1200;
      expectJSON   = true;

    } else if (tool === "script" && phase === "expand") {
      systemPrompt = scriptExpandPrompt(mode, tone, platform || "TikTok", length || "1 min", direction) + brandCtx;
      userMessage  = `Original idea: ${prompt}`;
      maxTokens    = 2000;
      expectJSON   = true;

    } else if (tool === "script" && phase === "regenerate") {
      systemPrompt = scriptRegenPrompt(mode, tone, section, context || prompt) + brandCtx;
      userMessage  = `Regenerate the ${section} section`;
      maxTokens    = 500;

    // ─── ONE-CLICK POST ───
    } else if (tool === "oneclick" && phase === "directions") {
      systemPrompt = oneClickDirectionsPrompt(mode, tone, platform || "TikTok", style || "Cinematic") + brandCtx;
      userMessage  = `Creator's idea: ${prompt}`;
      maxTokens    = 1200;
      expectJSON   = true;

    } else if (tool === "oneclick" && phase === "expand") {
      systemPrompt = oneClickExpandPrompt(mode, tone, platform || "TikTok", style || "Cinematic", direction) + brandCtx;
      userMessage  = `Original idea: ${prompt}`;
      maxTokens    = 2000;
      expectJSON   = true;

    } else if (tool === "oneclick" && phase === "regenerate") {
      systemPrompt = `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}\n${TONE_CONTEXTS[tone] || ""}\nRegenerate ONLY the "${section}" for a ${platform} video in ${style} style.\nContext: ${context || prompt}\nReturn ONLY the new content. No labels. No JSON.${brandCtx}`;
      userMessage  = `Regenerate: ${section}`;
      maxTokens    = 500;

    // ─── CAPTION TOOL ───
    } else if (tool === "caption") {
      systemPrompt = captionPrompt(mode) + brandCtx;
      userMessage  = `Topic/description: ${prompt}`;
      maxTokens    = 1200;
      expectJSON   = true;

    // ─── RESEARCH STUDIO ───
    } else if (tool === "prompt") {
      systemPrompt = researchPrompt(mode) + brandCtx;
      userMessage  = prompt;
      maxTokens    = 2000;

    // ─── GENERIC (fallback) ───
    } else {
      const seeds = ["Lead with an unexpected angle.", "Start with controversy or surprise.", "Open with a question that creates discomfort.", "Use a specific detail or number.", "Start with a short story.", "Lead with the opposite of what people expect."];
      const seed  = seeds[Math.floor(Math.random() * seeds.length)];
      systemPrompt = `${MODE_CONTEXTS[mode] || MODE_CONTEXTS.creator}\n${TONE_CONTEXTS[tone] || ""}\nGive a clear structured response.\n${FORMAT_RULES}${brandCtx}`;
      userMessage  = `Topic: ${prompt}\n\nInstruction: ${seed}`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await response.json();
    if (data.error) return Response.json({ error: data.error.message }, { status: 500 });

    const rawText = data.content?.[0]?.text || "";

    logUsageEvent(user.id, "generate", tool ?? "generic", 2, { tool, phase, platform });

    if (expectJSON) {
      try {
        const clean  = rawText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        const payload = { result: rawText, parsed };
        saveCache(user.id, "generate", cacheInput, JSON.stringify(payload));
        return Response.json(payload);
      } catch {
        return Response.json({ result: rawText });
      }
    }

    saveCache(user.id, "generate", cacheInput, JSON.stringify({ result: rawText }));
    return Response.json({ result: rawText });

  } catch (error) {
    console.error("Omnyra generation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// WATERMARK UTILITY — Ready for when APIs connect
// ============================================================
// To use with Sharp (images):
// npm install sharp
//
// import sharp from 'sharp';
// import { readFileSync } from 'fs';
// import { join } from 'path';
//
// export async function applyImageWatermark(imageBuffer) {
//   const watermark = readFileSync(join(process.cwd(), 'public', 'watermark.png'));
//   const base = sharp(imageBuffer);
//   const { width, height } = await base.metadata();
//
//   const wm = await sharp(watermark)
//     .resize(Math.round(width * 0.35)) // 35% of image width
//     .toBuffer();
//
//   return base.composite([{
//     input: wm,
//     gravity: 'south',     // centre bottom
//     blend: 'over'
//   }]).toBuffer();
// }
//
// ============================================================
// To use with FFmpeg (video):
// npm install fluent-ffmpeg
//
// import ffmpeg from 'fluent-ffmpeg';
//
// export function applyVideoWatermark(inputPath, outputPath) {
//   return new Promise((resolve, reject) => {
//     ffmpeg(inputPath)
//       .input('public/watermark.png')
//       .complexFilter([
//         '[1:v]scale=iw*0.25:-1[wm]',
//         '[0:v][wm]overlay=(W-w)/2:H-h-20'  // centre bottom, 20px from edge
//       ])
//       .output(outputPath)
//       .on('end', resolve)
//       .on('error', reject)
//       .run();
//   });
// }
//
// ============================================================
// USAGE in generation pipeline:
//
// const isFree = userPlan === 'free';
//
// if (isFree && generatedImageBuffer) {
//   const watermarked = await applyImageWatermark(generatedImageBuffer);
//   return watermarked; // send watermarked version to user
// }
//
// if (isFree && generatedVideoPath) {
//   await applyVideoWatermark(generatedVideoPath, watermarkedOutputPath);
//   return watermarkedOutputPath;
// }
// ============================================================
