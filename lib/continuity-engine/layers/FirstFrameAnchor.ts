export type FirstFrameAnchor = {
  inheritsFromScene:    number;       // previous scene index
  freezeDurationSeconds: number;      // how long to hold the pose (Runway: 2s)
  imageUrl:             string | null; // extracted last-frame URL
  mustMatchExactly: {
    characterPoses: boolean;
    cameraState:    boolean;
    lighting:       boolean;
    environment:    boolean;
    objects:        boolean;
  };
};
