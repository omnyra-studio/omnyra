export { ContinuityEngine }              from "./core/ContinuityEngine";
export type { ContinuitySnapshot }       from "./core/Snapshot";
export type { ContinuityResult, SnapshotVersion, IMMUTABILITY_RULES } from "./types";
export type { DriftReport }              from "./validation/ContinuityValidator";

export { deepFreeze, freezeSnapshot, detectMutationViolation, IMMUTABILITY_RULES as ImmutabilityRules } from "./immutability";
export { SceneGraphCompiler }            from "./scene-graph";
export type { SceneNode, SceneNodeStatus, GraphRenderOrder } from "./scene-graph";
export { ContinuityObservatory }         from "./observatory";
export type { ObservationEntry, DriftTrend } from "./observatory";
export { RenderLedger }                  from "./render-ledger";
export type { RenderLedgerEntry }        from "./render-ledger";

export type { BrandMemory }              from "./layers/BrandMemory";
export type { StoryState }               from "./layers/StoryState";
export type { CameraState, CameraMovement } from "./layers/CameraState";
export type { CharacterState }           from "./layers/CharacterState";
export type { ObjectState }              from "./layers/ObjectState";
export type { EnvironmentState }         from "./layers/EnvironmentState";
export type { FirstFrameAnchor }         from "./layers/FirstFrameAnchor";
