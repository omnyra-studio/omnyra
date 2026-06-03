// Scene Language Primitives — structured vocabulary for cinematic intent.
// Composition rules + motion logic + continuity structures → scene AST nodes.

// ── Primitives ────────────────────────────────────────────────────────────────

export type ShotType =
  | "extreme_close_up"
  | "close_up"
  | "medium_close_up"
  | "medium"
  | "medium_wide"
  | "wide"
  | "extreme_wide"
  | "overhead"
  | "dutch_angle";

export type CameraMove =
  | "static"
  | "pan_left"
  | "pan_right"
  | "tilt_up"
  | "tilt_down"
  | "dolly_in"
  | "dolly_out"
  | "truck_left"
  | "truck_right"
  | "crane_up"
  | "crane_down"
  | "handheld"
  | "orbit";

export type LightingSetup =
  | "natural_daylight"
  | "golden_hour"
  | "blue_hour"
  | "studio_key"
  | "rembrandt"
  | "rim_backlight"
  | "overhead_harsh"
  | "softbox_fill"
  | "practical_ambient"
  | "low_key_dramatic";

export type TransitionType =
  | "hard_cut"
  | "dissolve"
  | "smash_cut"
  | "match_cut"
  | "j_cut"
  | "l_cut"
  | "whip_pan"
  | "fade_black";

// ── Scene Node ────────────────────────────────────────────────────────────────

export interface SceneNode {
  id: string;
  index: number;
  description: string;
  shotType: ShotType;
  cameraMove: CameraMove;
  lightingSetup: LightingSetup;
  duration: number; // seconds
  emotionalBeat: string;
  subjectFocus: string | null;
  motionIntensity: number; // 0-100
  transitionIn: TransitionType;
  transitionOut: TransitionType;
  constraints: string[];
}

// ── Composition Rules ─────────────────────────────────────────────────────────

export interface CompositionDirective {
  framing: "thirds" | "center" | "negative_space" | "depth" | "symmetry";
  subjectPlacement: "left_third" | "right_third" | "center" | "lower_third" | "upper_third";
  backgroundDepth: "shallow_bokeh" | "mid_focus" | "deep_focus";
  leadingLines: boolean;
}

export function buildCompositionDirective(
  shotType: ShotType,
  emotionalBeat: string,
): CompositionDirective {
  const beat = emotionalBeat.toLowerCase();

  if (shotType === "extreme_close_up" || shotType === "close_up") {
    return { framing: "center", subjectPlacement: "center", backgroundDepth: "shallow_bokeh", leadingLines: false };
  }
  if (beat.includes("tension") || beat.includes("conflict")) {
    return { framing: "thirds", subjectPlacement: "left_third", backgroundDepth: "mid_focus", leadingLines: true };
  }
  if (beat.includes("inspiration") || beat.includes("breakthrough")) {
    return { framing: "negative_space", subjectPlacement: "lower_third", backgroundDepth: "deep_focus", leadingLines: true };
  }

  return { framing: "thirds", subjectPlacement: "right_third", backgroundDepth: "mid_focus", leadingLines: false };
}

// ── Motion Logic ──────────────────────────────────────────────────────────────

export interface MotionDirective {
  primaryMove: CameraMove;
  intensity: number; // 0-100
  speedProfile: "constant" | "ease_in" | "ease_out" | "ease_in_out" | "accelerating";
  stabilization: "locked_off" | "fluid_head" | "handheld_natural" | "gimbal_smooth";
}

export function resolveMotionDirective(
  emotionalBeat: string,
  motionIntensity: number,
): MotionDirective {
  const beat = emotionalBeat.toLowerCase();

  if (motionIntensity > 80) {
    return { primaryMove: "handheld", intensity: motionIntensity, speedProfile: "accelerating", stabilization: "handheld_natural" };
  }
  if (beat.includes("calm") || beat.includes("peace")) {
    return { primaryMove: "static", intensity: 20, speedProfile: "constant", stabilization: "locked_off" };
  }
  if (beat.includes("reveal") || beat.includes("discovery")) {
    return { primaryMove: "dolly_in", intensity: 40, speedProfile: "ease_in_out", stabilization: "gimbal_smooth" };
  }
  if (beat.includes("departure") || beat.includes("isolation")) {
    return { primaryMove: "dolly_out", intensity: 50, speedProfile: "ease_out", stabilization: "fluid_head" };
  }

  return { primaryMove: "pan_right", intensity: motionIntensity, speedProfile: "ease_in_out", stabilization: "gimbal_smooth" };
}

// ── Continuity Structures ─────────────────────────────────────────────────────

export interface ContinuityLock {
  subjectIdentity: string[];
  environmentAnchors: string[];
  lightingAnchors: string[];
  colorConsistency: boolean;
  matchCutCandidates: string[];
}

export function buildContinuityLock(scenes: SceneNode[]): ContinuityLock {
  const subjectMentions = new Set<string>();
  const envMentions = new Set<string>();
  const lightingStyles = new Set<string>();
  const matchCuts: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    if (scene.subjectFocus) subjectMentions.add(scene.subjectFocus);
    lightingStyles.add(scene.lightingSetup);

    // Adjacent same-shot-type pairs are match-cut candidates
    const next = scenes[i + 1];
    if (next && next.shotType === scene.shotType) {
      matchCuts.push(`scene_${i}_to_${i + 1}`);
    }
  }

  return {
    subjectIdentity: Array.from(subjectMentions),
    environmentAnchors: Array.from(envMentions),
    lightingAnchors: Array.from(lightingStyles),
    colorConsistency: lightingStyles.size <= 2,
    matchCutCandidates: matchCuts,
  };
}

// ── Scene Sequence Builder ────────────────────────────────────────────────────

export function buildSceneSequence(
  descriptions: string[],
  emotionalBeats: string[],
): SceneNode[] {
  const transitions: TransitionType[] = ["hard_cut", "dissolve", "match_cut", "j_cut", "l_cut", "smash_cut"];

  return descriptions.map((desc, i) => {
    const beat = emotionalBeats[i] ?? "neutral";
    const intensity = i === 0 ? 85 : i === descriptions.length - 1 ? 70 : 60;

    return {
      id: `scene_${i}`,
      index: i,
      description: desc,
      shotType: i === 0 ? "medium_close_up" : i % 3 === 0 ? "wide" : "medium",
      cameraMove: i === 0 ? "dolly_in" : i === descriptions.length - 1 ? "dolly_out" : "pan_right",
      lightingSetup: "natural_daylight",
      duration: 4,
      emotionalBeat: beat,
      subjectFocus: null,
      motionIntensity: intensity,
      transitionIn: i === 0 ? "hard_cut" : (transitions[i % transitions.length] ?? "hard_cut"),
      transitionOut: i === descriptions.length - 1 ? "fade_black" : "hard_cut",
      constraints: [],
    };
  });
}

// ── Serializer ────────────────────────────────────────────────────────────────

export function serializeSceneNode(node: SceneNode): string {
  const parts = [
    node.description,
    `SHOT: ${node.shotType.replace(/_/g, " ")}`,
    `MOVE: ${node.cameraMove.replace(/_/g, " ")}`,
    `LIGHT: ${node.lightingSetup.replace(/_/g, " ")}`,
    `BEAT: ${node.emotionalBeat}`,
  ];
  if (node.subjectFocus) parts.push(`SUBJECT: ${node.subjectFocus}`);
  if (node.constraints.length) parts.push(`LOCK: ${node.constraints.join(", ")}`);
  return parts.join(", ");
}
