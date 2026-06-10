/**
 * POST /api/continue-story
 *
 * Loads the user's most recent completed render + character_registry entry +
 * brand memory, then asks Claude to generate a full continuation script with
 * 3 hook options.  Returns everything the frontend needs to pre-fill the
 * create form and track the episode series.
 *
 * Body (all optional):
 *   { characterId?: string }   — override which character to use
 *
 * Returns:
 *   {
 *     hookOptions:     string[],   // 3 short hook choices for this episode
 *     script:          string,     // full continuation script
 *     seriesId:        string,     // UUID (existing or newly minted)
 *     episodeNumber:   number,     // next episode index
 *     parentRenderId:  string,     // id of the render being continued
 *     characterId:     string | null,
 *     characterName:   string | null,
 *     parentSummary:   string,     // short summary of the parent render's script
 *   }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadBrandMemory } from "@/lib/memory/brand-memory";
import { loadCharacterMemory } from "@/lib/memory/character-memory";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

export const maxDuration = 60;

const anthropic = new Anthropic();

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { characterId?: string } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const userId = user.id;

  // ── Load most recent completed render ───────────────────────────────────────
  const { data: parentRender } = await supabaseAdmin
    .from("renders")
    .select("id, script, template, series_id, episode_number, completed_at")
    .eq("user_id", userId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!parentRender) {
    return Response.json({ error: "No completed renders found. Generate your first video before continuing a story." }, { status: 404 });
  }

  // ── Resolve series tracking ──────────────────────────────────────────────────
  const seriesId      = (parentRender.series_id as string | null) ?? randomUUID();
  const episodeNumber = ((parentRender.episode_number as number | null) ?? 1) + 1;

  // ── Load character memory (optional) ────────────────────────────────────────
  // Prefer explicitly passed characterId; fall back to most recent character used
  let characterId    = body.characterId ?? null;
  let characterName: string | null = null;
  let characterContext = "";

  if (!characterId) {
    // Try to find the most recently used character for this user
    const { data: recentChar } = await supabaseAdmin
      .from("character_registry")
      .select("id, name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentChar) characterId = recentChar.id;
  }

  if (characterId) {
    const charMem = await loadCharacterMemory(characterId, userId);
    if (charMem) {
      characterName = charMem.name;
      characterContext = [
        `Character: ${charMem.name}`,
        charMem.core_prompt      ? `Identity: ${charMem.core_prompt}`       : "",
        charMem.visual_signature ? `Visual signature: ${charMem.visual_signature}` : "",
      ].filter(Boolean).join("\n");
    }
  }

  // ── Load brand memory ────────────────────────────────────────────────────────
  const brand = await loadBrandMemory(userId);
  const brandContext = [
    brand.brandName      ? `Brand: ${brand.brandName}`                        : "",
    brand.toneKeywords.length ? `Tone: ${brand.toneKeywords.join(", ")}`      : "",
    brand.tagline        ? `Tagline: "${brand.tagline}"`                       : "",
    brand.visualStyle    ? `Visual style: ${brand.visualStyle}`               : "",
    brand.preferredHooks.length ? `Hook style: ${brand.preferredHooks.slice(0, 2).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  // ── Collect recent scripts for emotional arc ─────────────────────────────────
  const { data: recentRenders } = await supabaseAdmin
    .from("renders")
    .select("script, episode_number")
    .eq("user_id", userId)
    .eq("status", "complete")
    .not("script", "is", null)
    .order("completed_at", { ascending: false })
    .limit(3);

  const parentScript = (parentRender.script as string | null) ?? "";
  const olderScripts = (recentRenders ?? [])
    .slice(1) // skip the first — that's the parent
    .map(r => r.script as string)
    .filter(Boolean)
    .join("\n\n---\n\n");

  // ── Generate continuation with Claude ───────────────────────────────────────
  const systemPrompt = `You are a creative director specialising in short-form video series for social media.
Your job is to write a continuation script (Episode ${episodeNumber}) that builds directly on the emotional arc of the previous episode while keeping complete character and brand consistency.

${characterContext ? `## Character Memory\n${characterContext}\n` : ""}
${brandContext ? `## Brand Memory\n${brandContext}\n` : ""}

## Rules
- This is Episode ${episodeNumber} — open with a brief callback to Episode ${episodeNumber - 1} so new viewers catch up instantly
- Keep the character's voice, vocabulary, and cadence IDENTICAL to previous content
- Continue or deepen the story thread — do not restart or ignore prior context
- 150–240 words; write for 30–60 seconds of spoken delivery
- Include [VISUAL] stage directions inline where they matter
- End with a strong curiosity hook that makes viewers demand Episode ${episodeNumber + 1}
- Be platform-native: Instagram Reels / TikTok / YouTube Shorts energy`;

  const userPrompt = `## Previous episode script (Episode ${episodeNumber - 1})\n${parentScript || "(no script recorded)"}

${olderScripts ? `## Earlier episodes (context only)\n${olderScripts}\n\n` : ""}
---
Write Episode ${episodeNumber}. Before the full script, output EXACTLY 3 short hook options on separate lines prefixed with HOOK_1:, HOOK_2:, HOOK_3: (each ≤ 15 words).  Then output the full script prefixed with SCRIPT:`;

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1200,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("");

  // Parse hook options
  const hookOptions: string[] = [];
  const hook1 = raw.match(/HOOK_1:\s*(.+)/);
  const hook2 = raw.match(/HOOK_2:\s*(.+)/);
  const hook3 = raw.match(/HOOK_3:\s*(.+)/);
  if (hook1) hookOptions.push(hook1[1].trim());
  if (hook2) hookOptions.push(hook2[1].trim());
  if (hook3) hookOptions.push(hook3[1].trim());

  const scriptMatch = raw.match(/SCRIPT:\s*([\s\S]+)/);
  const script = scriptMatch ? scriptMatch[1].trim() : raw.trim();

  // Short parent summary for the frontend continuation badge
  const parentSummary = parentScript
    ? parentScript.replace(/\[.*?\]/g, "").trim().slice(0, 120) + (parentScript.length > 120 ? "…" : "")
    : `Episode ${episodeNumber - 1}`;

  console.info(`[CONTINUE_STORY] user=${userId} episode=${episodeNumber} seriesId=${seriesId} parentId=${parentRender.id} character=${characterName ?? "none"}`);

  return Response.json({
    hookOptions,
    script,
    seriesId,
    episodeNumber,
    parentRenderId: parentRender.id as string,
    characterId,
    characterName,
    parentSummary,
  });
}
