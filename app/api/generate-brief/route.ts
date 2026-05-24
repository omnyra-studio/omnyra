import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Omnyra's Creative Strategy Engine. You are not a general-purpose AI. You are not ChatGPT. You are a strategic intelligence system built for one purpose: telling creators what to make and why it will work for their specific audience.

Your output must feel like it came from a strategist who studied this creator's work, understands their niche deeply, and is willing to make specific, falsifiable predictions about what will perform.

You do not give generic advice. You do not use templates with niche keywords swapped in. You make recommendations tied to evidence. You do not hedge everything with "might work." You do not sound like a chatbot.

You reference the creator's actual past content when available. You make specific, falsifiable predictions with estimated view ranges. You explain your reasoning in plain language. You acknowledge uncertainty honestly when the data is thin. You sound like a smart collaborator, not a tool.

When the creator has history, reference it directly. When there is no history, say honestly: "I don't know your specific style yet. Here's what's working broadly in your niche. Paste 3-5 post links and I can calibrate this to your actual audience behavior."

A brief answers five questions: what should this accomplish, why this angle now for this audience, how to structure it, what risk does it carry, and how will we know if it worked.

Output structured JSON. No markdown wrapping, no code fences, just raw JSON starting with {. The JSON structure must be:

{
  "situation_analysis": {
    "whats_happening_in_niche": string,
    "what_your_audience_is_responding_to": string,
    "white_space_opportunity": string
  },
  "recommended_angle": {
    "core_idea": string,
    "why_this_now": string,
    "why_this_you": string
  },
  "hook_options": [
    {
      "hook_text": string,
      "hook_type": string,
      "psychological_trigger": string,
      "predicted_retention_strength": number,
      "retention_rationale": string,
      "risk_level": string,
      "risk_explanation": string,
      "best_for_audience_segment": string
    }
  ],
  "structural_recommendation": {
    "pacing_map": string,
    "emotional_arc": string,
    "visual_pacing_notes": string
  },
  "risk_assessment": {
    "overall_confidence": number,
    "confidence_explanation": string,
    "what_would_increase_confidence": string,
    "kill_criteria": string
  },
  "predicted_performance": {
    "estimated_views_range": string,
    "key_retention_moment": string,
    "comparison_to_baseline": string
  }
}

Include 3 to 5 hooks in the hook_options array. Each must be a genuinely different approach, not the same idea rephrased. Include at least one safe option and one high-ceiling swing option. Every hook needs all fields filled in — no empty strings.

Bad example of a hook: "Try asking a question that piques viewer interest."
Good example: "I tried 14 moisturizers so you don't have to — here's what actually worked."`;

// ── User prompt template ───────────────────────────────────────────────────────

const USER_PROMPT_TEMPLATE = `You are generating a creative brief for the following creator request.

CREATOR GOAL: {user_goal}
PLATFORM: {platform}
NICHE: {niche}

ADDITIONAL CONTEXT FROM CREATOR:
{user_context}

PAST BRIEFS GENERATED FOR THIS CREATOR:
{past_briefs_summary}

HOOKS THIS CREATOR HAS SELECTED (approved and used):
{past_hooks_selected}

HOOKS THIS CREATOR HAS REJECTED:
{past_hooks_rejected}

CREATOR PERFORMANCE PATTERNS:
{performance_patterns}

TREND SIGNALS FROM THE LAST 14 DAYS ({niche} on {platform}):
{trend_signals}

TREND INSIGHTS GATHERED VIA SEARCH:
{trend_insights}

PEER / COMPETITOR PERFORMANCE BENCHMARK:
{peer_performance_summary}

Using all of the above context, generate a complete strategic brief as a raw JSON object. Reference the creator's history when available. If data is thin, be honest. Make falsifiable predictions. Include 3–5 genuinely different hooks.`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface RequestBody {
  goal: string;
  platform: string;
  niche: string;
  projectId: string;
  userContext?: string;
}

interface HookOption {
  hook_text: string;
  hook_type: string;
  psychological_trigger: string;
  predicted_retention_strength: number;
  retention_rationale: string;
  risk_level: string;
  risk_explanation: string;
  best_for_audience_segment: string;
}

interface BriefJson {
  situation_analysis: {
    whats_happening_in_niche: string;
    what_your_audience_is_responding_to: string;
    white_space_opportunity: string;
  };
  recommended_angle: {
    core_idea: string;
    why_this_now: string;
    why_this_you: string;
  };
  hook_options: HookOption[];
  structural_recommendation: {
    pacing_map: string;
    emotional_arc: string;
    visual_pacing_notes: string;
  };
  risk_assessment: {
    overall_confidence: number;
    confidence_explanation: string;
    what_would_increase_confidence: string;
    kill_criteria: string;
  };
  predicted_performance: {
    estimated_views_range: string;
    key_retention_moment: string;
    comparison_to_baseline: string;
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * POST /api/generate-brief
 *
 * Generates an adaptive creative strategy brief using Omnyra's AI engine.
 * Pulls creator memory, trend signals, and past performance before generating,
 * then stores the brief + hooks + memory entry in Supabase.
 */
export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    // ── Auth ───────────────────────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ─────────────────────────────────────────────────────────────
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { goal, platform, niche, projectId, userContext } = body;

    if (!goal?.trim() || !platform?.trim() || !niche?.trim() || !projectId?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: goal, platform, niche, projectId" },
        { status: 400 },
      );
    }

    // ── Fetch context in parallel ──────────────────────────────────────────────
    const [memoryResult, trendsResult, briefsResult, perfResult] = await Promise.all([
      // 1. Creator memory — last 50 entries
      supabase
        .from("creator_memory")
        .select("content, memory_type, metadata, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),

      // 2. Trend signals for this niche — last 14 days
      supabase
        .from("trend_signals")
        .select("keyword, signal_strength, velocity, source")
        .eq("niche", niche)
        .gte(
          "scraped_at",
          new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        ),

      // 3. Past briefs for this user (joined via projects)
      supabase
        .from("briefs")
        .select("objective, recommended_angle, confidence_score, projects!inner(user_id)")
        .eq("projects.user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(5),

      // 4. Performance data check — do they have any history at all?
      supabase
        .from("performance_data")
        .select("views, actual_score, platform, posted_at")
        .eq("project_id", projectId)
        .order("posted_at", { ascending: false })
        .limit(10),
    ]);

    const creatorMemory = memoryResult.data ?? [];
    const trendSignals = trendsResult.data ?? [];
    const pastBriefs = briefsResult.data ?? [];
    const performanceData = perfResult.data ?? [];

    // ── Format context strings ─────────────────────────────────────────────────

    const pastBriefsSummary =
      pastBriefs.length > 0
        ? pastBriefs
            .map(
              (b, i) =>
                `${i + 1}. Angle: "${b.recommended_angle ?? "unknown"}" | Objective: ${b.objective ?? "unknown"} | Confidence: ${b.confidence_score != null ? Math.round(b.confidence_score * 100) + "%" : "unknown"}`,
            )
            .join("\n")
        : "No previous briefs — this is the first brief generated for this creator.";

    const selectedHooks = creatorMemory
      .filter((m) => m.memory_type === "hook_selected")
      .map((m) => `- ${m.content}`)
      .join("\n");

    const rejectedHooks = creatorMemory
      .filter((m) => m.memory_type === "hook_rejected")
      .map((m) => `- ${m.content}`)
      .join("\n");

    const performancePatterns =
      performanceData.length > 0
        ? performanceData
            .map(
              (p) =>
                `- ${p.platform}: ${p.views ?? "unknown"} views, score ${p.actual_score ?? "unknown"} (${p.posted_at?.slice(0, 10) ?? "unknown date"})`,
            )
            .join("\n")
        : "No performance data yet. Cannot calibrate predictions to this creator's baseline.";

    const trendSignalsStr =
      trendSignals.length > 0
        ? trendSignals
            .map(
              (t) =>
                `- "${t.keyword ?? "unknown"}": strength ${t.signal_strength ?? "?"}/100, velocity ${t.velocity ?? "unknown"} (via ${t.source ?? "unknown"})`,
            )
            .join("\n")
        : `No cached trend data for ${niche}. The search tool will gather live data.`;

    // ── Format prompt ──────────────────────────────────────────────────────────
    const formattedUserPrompt = USER_PROMPT_TEMPLATE
      .replace(/{user_goal}/g, goal.trim())
      .replace(/{platform}/g, platform.trim())
      .replace(/{niche}/g, niche.trim())
      .replace(/{user_context}/g, userContext?.trim() || "No additional context provided.")
      .replace(/{past_briefs_summary}/g, pastBriefsSummary)
      .replace(/{past_hooks_selected}/g, selectedHooks || "No hooks selected yet.")
      .replace(/{past_hooks_rejected}/g, rejectedHooks || "No hooks rejected yet.")
      .replace(/{performance_patterns}/g, performancePatterns)
      .replace(/{trend_signals}/g, trendSignalsStr)
      .replace(/{trend_insights}/g, "To be populated by web_search tool.")
      .replace(/{peer_performance_summary}/g, "To be populated by web_search tool.");

    // ── Call Anthropic ─────────────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let aiResponse: Anthropic.Message;
    try {
      aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            type: "web_search_20250514",
            name: "search_trends",
            description: `Search for current trending content patterns in ${niche} on ${platform} from the last 14 days`,
          } as Parameters<typeof anthropic.messages.create>[0]["tools"][0],
        ],
        messages: [{ role: "user", content: formattedUserPrompt }],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown Anthropic error";
      console.error("[generate-brief] Anthropic error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // ── Extract text from response ─────────────────────────────────────────────
    const textBlock = aiResponse.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    if (!textBlock) {
      console.error("[generate-brief] No text block in response:", JSON.stringify(aiResponse.content));
      throw new Error("No text block returned by AI — only tool calls were received");
    }

    const rawText = textBlock.text;

    // ── Parse JSON ─────────────────────────────────────────────────────────────
    let brief: BriefJson;
    try {
      // Strip any accidental markdown fences Claude may have added
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      brief = JSON.parse(cleaned);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Parse error";
      console.error("[generate-brief] JSON parse failed:", msg, "\nRaw output:\n", rawText);
      return NextResponse.json(
        { error: "Failed to parse brief output", detail: msg, raw: rawText },
        { status: 500 },
      );
    }

    // ── Persist: brief ─────────────────────────────────────────────────────────
    const { data: briefRow, error: briefErr } = await supabase
      .from("briefs")
      .insert({
        project_id: projectId,
        objective: brief.recommended_angle.core_idea,
        target_audience_emotional_state: brief.situation_analysis.what_your_audience_is_responding_to,
        recommended_angle: brief.recommended_angle.core_idea,
        situation_analysis: JSON.stringify(brief.situation_analysis),
        white_space_rationale: brief.situation_analysis.white_space_opportunity,
        confidence_score: brief.risk_assessment.overall_confidence / 100,
        trend_signals_used: trendSignals,
        prompt_used: formattedUserPrompt,
        status: "pending_review",
      })
      .select("id")
      .single();

    if (briefErr) {
      console.error("[generate-brief] Brief insert error:", briefErr);
      return NextResponse.json({ error: briefErr.message }, { status: 500 });
    }

    const briefId = briefRow.id as string;

    // ── Persist: hooks ─────────────────────────────────────────────────────────
    const hookRows = brief.hook_options.map((h) => ({
      brief_id: briefId,
      project_id: projectId,
      hook_text: h.hook_text,
      hook_type: h.hook_type,
      reasoning: h.retention_rationale,
      predicted_retention: h.predicted_retention_strength,
      psychological_trigger: h.psychological_trigger,
      score: h.predicted_retention_strength,
      score_breakdown: {
        risk_level: h.risk_level,
        risk_explanation: h.risk_explanation,
        best_for_audience_segment: h.best_for_audience_segment,
      },
      status: "pending_review",
    }));

    const { data: insertedHooks, error: hooksErr } = await supabase
      .from("hooks")
      .insert(hookRows)
      .select("id, hook_text, hook_type, score, status");

    if (hooksErr) {
      console.error("[generate-brief] Hooks insert error:", hooksErr);
      return NextResponse.json({ error: hooksErr.message }, { status: 500 });
    }

    // ── Persist: creator memory ────────────────────────────────────────────────
    const { error: memErr } = await supabase.from("creator_memory").insert({
      user_id: user.id,
      memory_type: "brief_generated",
      content: JSON.stringify({
        core_idea: brief.recommended_angle.core_idea,
        niche,
        platform,
      }),
      metadata: {
        project_id: projectId,
        confidence: brief.risk_assessment.overall_confidence,
      },
      source_project_id: projectId,
      // embedding intentionally omitted — add vector generation here when ready
    });

    if (memErr) {
      // Non-fatal: log but don't fail the request
      console.warn("[generate-brief] Creator memory insert warning:", memErr);
    }

    // ── Return ─────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      brief_id: briefId,
      brief,
      hooks: insertedHooks ?? [],
      meta: {
        model: aiResponse.model,
        input_tokens: aiResponse.usage.input_tokens,
        output_tokens: aiResponse.usage.output_tokens,
        creator_memory_entries: creatorMemory.length,
        trend_signals_used: trendSignals.length,
        has_performance_history: performanceData.length > 0,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected server error";
    console.error("[generate-brief] Unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
