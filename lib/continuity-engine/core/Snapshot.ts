import type { BrandMemory }      from "../layers/BrandMemory";
import type { StoryState }       from "../layers/StoryState";
import type { CharacterState }   from "../layers/CharacterState";
import type { CameraState }      from "../layers/CameraState";
import type { ObjectState }      from "../layers/ObjectState";
import type { EnvironmentState } from "../layers/EnvironmentState";
import type { FirstFrameAnchor } from "../layers/FirstFrameAnchor";

export type ContinuitySnapshot = {
  projectId:   string;
  sceneIndex:  number;

  brand:       BrandMemory;
  story:       StoryState;

  characters:  Record<string, CharacterState>;
  camera:      CameraState;
  objects:     Record<string, ObjectState>;
  environment: EnvironmentState;
  firstFrame:  FirstFrameAnchor;

  createdAt:   number;
};
