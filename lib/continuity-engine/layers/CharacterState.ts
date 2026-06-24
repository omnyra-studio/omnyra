export type CharacterState = {
  characterId:  string;
  name:         string;
  pose:         string;
  expression:   string;
  clothing:     string;
  position:     { x: number; y: number };  // normalised 0–1 within frame
  isVisible:    boolean;
  referenceUrl: string | null;  // last-frame crop or reference image URL
};
