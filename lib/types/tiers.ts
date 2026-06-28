export type UserTier = 'free' | 'starter' | 'creator' | 'studio';

export interface TierLimit {
  maxDurationSeconds: number;  // max targetDuration allowed per generation
  maxScenes:          number;  // max scene count
  runwayAccess:       boolean; // can use Runway as primary provider
}

export const TIER_LIMITS: Record<UserTier, TierLimit> = {
  free:    { maxDurationSeconds: 30,  maxScenes: 3, runwayAccess: false },
  starter: { maxDurationSeconds: 30,  maxScenes: 3, runwayAccess: false },
  creator: { maxDurationSeconds: 60,  maxScenes: 6, runwayAccess: true  },
  studio:  { maxDurationSeconds: 90,  maxScenes: 9, runwayAccess: true  },
};
