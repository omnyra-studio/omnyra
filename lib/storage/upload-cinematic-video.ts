/**
 * Download a video from a URL and upload to Supabase `renders` storage.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function uploadVideoToRenders(
  userId: string,
  sourceUrl: string,
  suffix = "mp4",
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(sourceUrl, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`video fetch HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error("video fetch returned 0 bytes");

    const path = `${userId}/${Date.now()}.${suffix}`;
    const { data, error } = await supabaseAdmin.storage
      .from("renders")
      .upload(path, buffer, { contentType: "video/mp4", upsert: true });

    if (error) throw new Error(`Supabase upload failed: ${error.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(data.path);
    return publicUrl;
  } finally {
    clearTimeout(timer);
  }
}