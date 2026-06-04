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
  // Auth check
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error("[upload/voice] Unauthorized — no user session");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch (formErr) {
    console.error("[upload/voice] formData parse error:", formErr);
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) {
    console.error("[upload/voice] received 0-byte file");
    return Response.json({ error: "Empty audio file" }, { status: 400 });
  }

  // Store under renders/${userId}/voice/ — same bucket compose-video already uses
  const voicePath = `renders/${user.id}/voice/${Date.now()}.mp3`;

  console.log(`[upload/voice] uploading ${buffer.length}bytes → ${voicePath}`);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("renders")
    .upload(voicePath, buffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadErr) {
    console.error("[upload/voice] storage upload error:", uploadErr.message);
    return Response.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(voicePath);

  if (!publicUrl) {
    console.error("[upload/voice] getPublicUrl returned empty string");
    return Response.json({ error: "Failed to get public URL" }, { status: 500 });
  }

  console.log(`[upload/voice] done user=${user.id} url=${publicUrl.substring(0, 80)}`);
  return Response.json({ url: publicUrl });
}
