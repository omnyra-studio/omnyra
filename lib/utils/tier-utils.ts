import { TIER_LIMITS, type UserTier } from '@/lib/types/tiers';

export function canAccess60s(tier: UserTier): boolean {
  return TIER_LIMITS[tier].maxDurationSeconds >= 60;
}

export function canUseRunway(tier: UserTier): boolean {
  return TIER_LIMITS[tier].runwayAccess;
}
