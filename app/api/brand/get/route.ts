import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
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

  const [brand, oauthRow] = await Promise.all([
    getBrandProfile(user.id),
    supabaseAdmin
      .from("brand_profiles")
      .select("youtube_oauth")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const ytOauth = oauthRow.data?.youtube_oauth as { channel_title?: string } | null;

  // Return brand profile with YouTube connection status (never expose tokens to client)
  return Response.json({
    ...(brand ?? {}),
    youtube_oauth_connected: !!ytOauth?.channel_title,
    youtube_channel_title:   ytOauth?.channel_title ?? null,
  });
}
