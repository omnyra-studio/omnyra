/**
 * POST /api/scene/:id/render
 *
 * Triggers a single scene render directly (bypass queue — useful for rerenders,
 * drift repair, or dev testing of individual scenes).
 *
 * Body: { project_id, image_url, video_prompt, negative_prompt, duration_secs, aspect_ratio }
 * Returns: { video_url } when complete (long-poll, up to 5 minutes)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const maxDuration = 300;

interface RenderBody {
  project_id:      string;
  image_url:       string;
  video_prompt:    string;
  negative_prompt: string;
  duration_secs?:  number;
  aspect_ratio?:   string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sceneId = params.id;

  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as RenderBody;
  const {
    project_id,
    image_url,
    video_prompt,
    negative_prompt,
    duration_secs = 10,
    aspect_ratio  = "9:16",
  } = body;

  if (!project_id || !image_url || !video_prompt) {
    return NextResponse.json({ error: "project_id, image_url, video_prompt are required" }, { status: 400 });
  }

  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "KLING_API_KEY not configured" }, { status: 500 });

  const t0 = Date.now();

  // Mark rendering
  await supabase.from("scenes").update({ render_status: "rendering" })
    .eq("project_id", project_id)
    .eq("scene_id", sceneId)
    .eq("user_id", user.id);

  try {
    // Start Kling render
    const startRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
      method:  "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name:      "kling-v2-1",
        mode:            "pro",
        image_url,
        prompt:          video_prompt,
        negative_prompt,
        duration:        String(duration_secs),
        aspect_ratio,
        cfg_scale:       0.5,
      }),
    });

    const startData = await startRes.json() as { data?: { task_id?: string }; code?: number; message?: string };
    if (startData.code !== 0 || !startData.data?.task_id) {
      throw new Error(`Kling start failed: ${startData.message ?? "unknown"}`);
    }

    const taskId = startData.data.task_id;
    let videoUrl: string | null = null;

    // Poll
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(r => setTimeout(r, 5000));

      const pollRes  = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const pollData = await pollRes.json() as {
        data?: { task_status?: string; task_result?: { videos?: Array<{ url: string }> } };
      };

      const status = pollData.data?.task_status;
      if (status === "succeed") {
        videoUrl = pollData.data?.task_result?.videos?.[0]?.url ?? null;
        break;
      }
      if (status === "failed") throw new Error("Kling render failed");
    }

    if (!videoUrl) throw new Error("Kling render timed out");

    const renderMs = Date.now() - t0;

    // Persist result
    await supabase.from("scenes").update({
      video_url:     videoUrl,
      render_status: "complete",
      model_used:    "kling",
      render_ms:     renderMs,
    }).eq("project_id", project_id)
      .eq("scene_id", sceneId)
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true, scene_id: sceneId, video_url: videoUrl, render_ms: renderMs });
  } catch (err) {
    const message = String(err);

    await supabase.from("scenes").update({
      render_status: "failed",
      error_message: message,
    }).eq("project_id", project_id)
      .eq("scene_id", sceneId)
      .eq("user_id", user.id);

    console.error(`[/api/scene/:id/render] scene=${sceneId}:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
