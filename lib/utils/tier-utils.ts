import { TIER_LIMITS, type UserTier } from '@/lib/types/tiers';

export function canAccess60s(tier: UserTier): boolean {
  return TIER_LIMITS[tier].maxDurationSeconds >= 60;
}

export function canAccess90s(tier: UserTier): boolean {
  return TIER_LIMITS[tier].maxDurationSeconds >= 90;
}

export function canUseRunway(tier: UserTier): boolean {
  return TIER_LIMITS[tier].runwayAccess;
}
