import { type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

// POST /api/upload/voice
// Accepts: multipart/form-data with field "file" (audio blob)
// Returns: { url: string } — 1-hour signed URL the server can fetch
export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const voicePath = `${user.id}/voice/${Date.now()}.mp3`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("user-uploads")
    .upload(voicePath, buffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadErr) {
    console.error("[upload/voice] storage upload error:", uploadErr.message);
    return Response.json({ error: uploadErr.message }, { status: 500 });
  }

  // Signed URL valid for 1 hour — fetchable by the compose-video server route
  const { data: signedData, error: signErr } = await supabaseAdmin.storage
    .from("user-uploads")
    .createSignedUrl(voicePath, 3600);

  if (signErr || !signedData?.signedUrl) {
    console.error("[upload/voice] signed URL error:", signErr?.message);
    return Response.json({ error: "Failed to create signed URL" }, { status: 500 });
  }

  console.log(`[upload/voice] uploaded for user=${user.id} path=${voicePath}`);
  return Response.json({ url: signedData.signedUrl });
}
