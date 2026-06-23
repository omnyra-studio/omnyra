import type { NarrativeRole } from "@omnyra/continuity-engine";

export interface StoryProgression {
  sceneIndex:    number;
  role:          NarrativeRole;
  clipUrl:       string | null;
  emotion:       string;
  completedAt:   number;
}

export interface StoryStore {
  projectId:       string;
  arc:             string;
  progression:     StoryProgression[];
  currentEmotion:  string;
  currentTension:  number;
  location:        string;
  lightingVector:  string;
  cameraVector:    string;
}

export function createStoryStore(
  projectId: string,
  arc:       string,
  location:  string,
): StoryStore {
  return {
    projectId,
    arc,
    progression:    [],
    currentEmotion: "neutral",
    currentTension: 0.3,
    location,
    lightingVector: "golden hour, 45° left",
    cameraVector:   "35mm, slow push-in",
  };
}

export function advanceStory(
  store:    StoryStore,
  scene:    { sceneIndex: number; role: NarrativeRole; emotion: string; tension: number },
  clipUrl:  string | null,
): StoryStore {
  return {
    ...store,
    currentEmotion: scene.emotion,
    currentTension: scene.tension,
    progression: [
      ...store.progression,
      { sceneIndex: scene.sceneIndex, role: scene.role, clipUrl, emotion: scene.emotion, completedAt: Date.now() },
    ],
  };
}

/** Build a short context string (<200 chars) injected into Kling prompts */
export function buildStoryContext(store: StoryStore): string {
  const last = store.progression[store.progression.length - 1];
  if (!last) return "";
  return `[Story: ${last.role} → tension ${Math.round(store.currentTension * 100)}%, emotion: ${store.currentEmotion}] `;
}
