import { type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

// POST /api/upload/voice
// Accepts: multipart/form-data with field "file" (audio blob)
// Returns: { url: string } — public URL from the renders bucket
//
// Uses the renders bucket (confirmed public, service-role accessible) rather
// than user-uploads to avoid RLS/bucket-permission edge cases on a fresh bucket.
export async function POST(req: NextRequest) {
  console.log("[UPLOAD_VOICE] received request");

  // Auth check
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error("[UPLOAD_VOICE] Unauthorized — no user session");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[UPLOAD_VOICE] auth ok user=" + user.id);

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = (form.get("audio") ?? form.get("file")) as File | null;
  } catch (formErr) {
    console.error("[UPLOAD_VOICE] formData parse error:", formErr);
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  console.log("[UPLOAD_VOICE] formData parsed, size=", buffer.length);
  if (!buffer.length) {
    console.error("[UPLOAD_VOICE] received 0-byte file");
    return Response.json({ error: "Empty audio file" }, { status: 400 });
  }

  // Store under renders/${userId}/voice/ — same bucket compose-video already uses
  const voicePath = `renders/${user.id}/voice/${Date.now()}.mp3`;
  console.log("[UPLOAD_VOICE] uploading to renders bucket path=", voicePath);

  const uploadResult = await supabaseAdmin.storage
    .from("renders")
    .upload(voicePath, buffer, { contentType: "audio/mpeg", upsert: true });

  console.log("[UPLOAD_VOICE] upload result=", JSON.stringify({ error: uploadResult.error?.message ?? null, path: uploadResult.data?.path ?? null }));

  if (uploadResult.error) {
    console.error("[UPLOAD_VOICE] storage upload error:", uploadResult.error.message);
    return Response.json({ error: uploadResult.error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(voicePath);
  console.log("[UPLOAD_VOICE] returning url=", publicUrl?.substring(0, 100) ?? "EMPTY");

  if (!publicUrl) {
    console.error("[UPLOAD_VOICE] getPublicUrl returned empty string");
    return Response.json({ error: "Failed to get public URL" }, { status: 500 });
  }

  return Response.json({ url: publicUrl });
}
