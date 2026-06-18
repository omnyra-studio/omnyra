import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");

  let brand: any = null;

  if (brandId) {
    const { data } = await supabaseAdmin
      .from("brand_profiles")
      .select("*")
      .eq("id", brandId)
      .eq("user_id", user.id)
      .maybeSingle();
    brand = data;
  } else {
    brand = await getBrandProfile(user.id);
  }

  const oauthRow = await supabaseAdmin
    .from("brand_profiles")
    .select("youtube_oauth")
    .eq("user_id", user.id)
    .maybeSingle();

  const ytOauth = oauthRow.data?.youtube_oauth as { channel_title?: string } | null;

  // Return brand profile with YouTube connection status (never expose tokens to client)
  // When brandId provided, this supports the multi-brand system.
  return Response.json({
    ...(brand ?? {}),
    youtube_oauth_connected: !!ytOauth?.channel_title,
    youtube_channel_title:   ytOauth?.channel_title ?? null,
    _multiBrandSupported: true, // signal to clients (no UI change required)
  });
}
