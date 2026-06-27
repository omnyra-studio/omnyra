import type { UserTier } from "@/lib/types/tiers";
import { canUseRunway } from "@/lib/utils/tier-utils";
import type { RunwayImageToVideoModel } from "@/lib/services/runway";

export type SpeedMode = "fast" | "quality";

export interface RunwayRouting {
  // Only valid imageToVideo models — gen3a_turbo / gen3-turbo are NOT accepted
  model:    RunwayImageToVideoModel;
  provider: "runway" | "kling";
  reason:   string;
}

export function chooseRunwayModel(
  _narration: string,
  tier:       UserTier | string,
  speed:      SpeedMode = "fast",
): RunwayRouting {
  if (!canUseRunway(tier as UserTier)) {
    return { model: "gen4_turbo", provider: "kling", reason: `tier=${tier} has no runway access` };
  }
  // gen4.5 is higher quality but slower; gen4_turbo is the default fast path
  const model: RunwayImageToVideoModel = speed === "quality" ? "gen4.5" : "gen4_turbo";
  return { model, provider: "runway", reason: `tier=${tier} speed=${speed} model=${model}` };
}
