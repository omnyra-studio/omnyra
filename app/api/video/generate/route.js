import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { script, avatarId, voiceId } = await request.json();
    if (!script?.trim()) return NextResponse.json({ error: "Script required" }, { status: 400 });

    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: {
        "X-Api-Key": process.env.HEYGEN_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: "avatar",
            avatar_id: avatarId || "Daisy-inskirt-20220818",
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script.slice(0, 1500),
            voice_id: voiceId || "1bd001e7e50f421d891986aad5158bc8",
          },
        }],
        dimension: { width: 1280, height: 720 },
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      console.error("[video/generate] HeyGen error:", JSON.stringify(data));
      return NextResponse.json({ error: data.error?.message || "HeyGen generation failed" }, { status: 500 });
    }

    return NextResponse.json({ videoId: data.data?.video_id });
  } catch (err) {
    console.error("[video/generate] unhandled:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
