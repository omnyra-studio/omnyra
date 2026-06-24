export type StoryState = {
  sceneIndex:       number;
  emotion:          string;
  tension:          number;  // 0.0–1.0
  arcPosition:      number;  // 0.0–1.0 (progress through the arc)
  location:         string;
  activeBeat:       string;
  activeCharacters: string[];
  nextIntent:       string;
};
