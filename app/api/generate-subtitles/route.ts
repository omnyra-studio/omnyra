/**
 * POST /api/generate-subtitles
 *
 * Generates an SRT subtitle file from shot narration_text + timeline timestamps.
 * No external API required — purely derived from shot plan data.
 *
 * Body:    { planId: string }
 * Returns: { success, srt: string, vtt: string, shot_count: number, total_duration: number }
 *
 * SRT timing is taken directly from shots.start_time / end_time so subtitles
 * stay in sync with the composed video even after rebalancing.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { planId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { planId } = body;
  if (!planId?.trim()) {
    return NextResponse.json({ error: "Missing required field: planId" }, { status: 400 });
  }

  // ── Verify ownership via shot_plans → projects ────────────────────────────────
  const { data: plan, error: planErr } = await supabase
    .from("shot_plans")
    .select("id, projects!inner(user_id)")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    return NextResponse.json({ error: "Shot plan not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((plan as any).projects?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Load shots ────────────────────────────────────────────────────────────────
  const { data: shots, error: shotsErr } = await supabase
    .from("shots")
    .select("shot_number, narration_text, audio_intent, start_time, end_time, duration_seconds")
    .eq("shot_plan_id", planId)
    .order("shot_number", { ascending: true });

  if (shotsErr || !shots?.length) {
    return NextResponse.json({ error: "No shots found for this plan" }, { status: 404 });
  }

  // ── Build subtitle entries ────────────────────────────────────────────────────
  interface SubEntry {
    index: number;
    startSec: number;
    endSec: number;
    text: string;
  }

  const entries: SubEntry[] = [];
  let cursor = 0; // fallback cursor if start_time/end_time are null (pre-migration shots)

  for (const shot of shots) {
    const narration = ((shot.narration_text as string | null) ?? "").trim()
      || ((shot.audio_intent as string | null) ?? "").trim();
    if (!narration) {
      // Advance cursor even for silent shots
      cursor += (shot.duration_seconds as number) ?? 5;
      continue;
    }

    const startSec = (shot.start_time as number | null) ?? cursor;
    const durationSec = (shot.duration_seconds as number) ?? 5;
    const endSec = (shot.end_time as number | null) ?? (startSec + durationSec);
    cursor = endSec;

    entries.push({
      index: entries.length + 1,
      startSec,
      endSec,
      text: narration,
    });
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No narration text found in shots. Regenerate the shot plan to add narration." },
      { status: 422 },
    );
  }

  const totalDuration = entries[entries.length - 1].endSec;

  // ── Generate SRT ──────────────────────────────────────────────────────────────
  const srt = entries.map((e) =>
    [
      String(e.index),
      `${srtTime(e.startSec)} --> ${srtTime(e.endSec)}`,
      e.text,
      "",
    ].join("\n"),
  ).join("\n");

  // ── Generate WebVTT ───────────────────────────────────────────────────────────
  const vtt = [
    "WEBVTT",
    "",
    ...entries.map((e) =>
      [
        `${vttTime(e.startSec)} --> ${vttTime(e.endSec)}`,
        e.text,
        "",
      ].join("\n"),
    ),
  ].join("\n");

  return NextResponse.json({
    success:        true,
    srt,
    vtt,
    shot_count:     entries.length,
    total_duration: totalDuration,
  });
}

// ── Time formatters ───────────────────────────────────────────────────────────

function pad2(n: number): string { return String(Math.floor(n)).padStart(2, "0"); }
function pad3(n: number): string { return String(Math.floor(n)).padStart(3, "0"); }

function srtTime(seconds: number): string {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function vttTime(seconds: number): string {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}
