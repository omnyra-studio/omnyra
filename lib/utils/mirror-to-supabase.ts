/**
 * Mirror fal.media / fal.run URLs to Supabase storage.
 * Runway rejects fal.media CDN URLs directly — they must be mirrored first.
 * Non-fatal: returns original URL on any failure.
 */

import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function mirrorToSupabase(
  url:    string,
  userId: string,
  index:  number,
): Promise<string> {
  if (!url) return url;
  const isFalUrl = url.includes("fal.media") || url.includes("fal.run");
  if (!isFalUrl) return url;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return url;

    const buf = Buffer.from(await res.arrayBuffer());
    const ext = url.endsWith(".png") ? "png" : "jpg";
    const storagePath = `${userId}/scene-images/${Date.now()}-s${index}.${ext}`;

    const supabase = getAdmin();
    const { error } = await supabase.storage
      .from("renders")
      .upload(storagePath, buf, { contentType: `image/${ext}`, upsert: true });

    if (error) {
      console.warn(`[MIRROR] upload failed scene=${index + 1}: ${error.message}`);
      return url;
    }

    const { data } = supabase.storage.from("renders").getPublicUrl(storagePath);
    const mirrored = data.publicUrl;
    console.log(`[MIRROR] scene=${index + 1} -> ${mirrored.slice(0, 70)}`);
    return mirrored ?? url;
  } catch (err) {
    console.warn(`[MIRROR] failed scene=${index + 1}:`, err instanceof Error ? err.message : err);
    return url;
  }
}
