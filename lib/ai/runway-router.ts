import type { UserTier } from "@/lib/types/tiers";
import { canUseRunway } from "@/lib/utils/tier-utils";

export type SpeedMode = "fast" | "quality";
export type RunwayModel = "gen4_turbo" | "gen3a_turbo";

export interface RunwayRouting {
  model:    RunwayModel;
  provider: "runway" | "kling";
  reason:   string;
}

export function chooseRunwayModel(
  narration: string,
  tier:      UserTier,
  speed:     SpeedMode = "fast",
): RunwayRouting {
  if (!canUseRunway(tier)) {
    return { model: "gen4_turbo", provider: "kling", reason: `tier=${tier} has no runway access` };
  }

  const lower = narration.toLowerCase();

  // Cinematic/emotional/dramatic content always uses Gen 4 regardless of speed preference
  if (
    lower.includes("cinematic") ||
    lower.includes("emotional")  ||
    lower.includes("dramatic")
  ) {
    return { model: "gen4_turbo", provider: "runway", reason: "cinematic/emotional content — quality mode" };
  }

  // Avatar / talking head — Gen 3a Turbo is sufficient and faster
  if (lower.includes("talking") || lower.includes("avatar")) {
    return { model: "gen3a_turbo", provider: "runway", reason: "avatar/talking-head — turbo sufficient" };
  }

  // User speed preference
  const model: RunwayModel = speed === "quality" ? "gen4_turbo" : "gen3a_turbo";
  return { model, provider: "runway", reason: `speed=${speed} tier=${tier}` };
}
