import { createClient } from '@/lib/supabase/client';

/**
 * @deprecated — legacy client-side brand memory utils.
 * The canonical implementation lives in lib/memory/brand-memory.ts (now fixed + auto-sync to brand_brain)
 * and the improved core at artifacts/backend/core/brand-memory/unified.ts
 * This file may have column drift vs 20260615_brand_memories migration.
 * Prefer loadUnified / saveBrandProfileAndSync paths for new work.
 */

export interface BrandMemory {
  id?:                string;
  user_id?:           string;
  campaign_name:      string;
  brand_guidelines:   string;
  preferred_voice_id?: string;
  voice_favorites:    string[];
  updated_at?:        string;
}

export async function saveBrandMemory(
  userId: string,
  data: {
    campaignName?:    string;
    brandGuidelines:  string;
    preferredVoiceId?: string;
    voiceFavorites?:  string[];
  },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('brand_memories').upsert({
    user_id:           userId,
    campaign_name:     data.campaignName || 'default',
    brand_guidelines:  data.brandGuidelines,
    preferred_voice_id: data.preferredVoiceId,
    voice_favorites:   data.voiceFavorites ?? [],
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'user_id,campaign_name' });

  if (error) throw error;
}

export async function loadBrandMemory(
  userId:       string,
  campaignName: string = 'default',
): Promise<BrandMemory | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('brand_memories')
    .select('*')
    .eq('user_id', userId)
    .eq('campaign_name', campaignName)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}
