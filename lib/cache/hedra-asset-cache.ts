// Hedra image_asset_id cache.
//
// Hedra requires uploading a character image before every generation call.
// This cache stores the image_asset_id per character so we skip 2 API calls
// (POST /assets + POST /assets/{id}/upload) on repeat generations.
//
// Storage: character_hedra_assets table (Supabase).
// TTL: 7 days (Hedra assets expire; confirmed safe window from hedra.ts).
//
// This file DOES NOT import or modify lib/providers/hedra.ts.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHash }    from "crypto";

const ASSET_TTL_HOURS = 168; // 7 days

export interface HedraAssetEntry {
  image_asset_id: string;
  expires_at:     string; // ISO-8601
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

export async function getCachedHedraAsset(
  characterId: string,
  imageUrl:    string,
): Promise<HedraAssetEntry | null> {
  const imageHash = hashUrl(imageUrl);

  const { data, error } = await supabaseAdmin
    .from("character_hedra_assets")
    .select("image_asset_id, expires_at")
    .eq("character_id", characterId)
    .eq("image_hash", imageHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.warn("[hedra-asset-cache] lookup error:", error.message);
    return null;
  }

  return data as HedraAssetEntry | null;
}

export async function setCachedHedraAsset(
  characterId:    string,
  imageUrl:       string,
  imageAssetId:   string,
): Promise<void> {
  const imageHash = hashUrl(imageUrl);
  const expiresAt = new Date(Date.now() + ASSET_TTL_HOURS * 3_600_000).toISOString();

  const { error } = await supabaseAdmin
    .from("character_hedra_assets")
    .upsert(
      { character_id: characterId, image_hash: imageHash, image_asset_id: imageAssetId, expires_at: expiresAt },
      { onConflict: "character_id,image_hash" },
    );

  if (error) {
    console.warn("[hedra-asset-cache] upsert error:", error.message);
  }
}

export async function invalidateCachedHedraAssets(characterId: string): Promise<void> {
  await supabaseAdmin
    .from("character_hedra_assets")
    .delete()
    .eq("character_id", characterId);
}
