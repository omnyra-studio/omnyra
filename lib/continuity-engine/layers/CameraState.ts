export type CameraMovement = "tracking" | "static" | "dolly" | "push-in" | "pull-back" | "orbit" | "handheld";

export type CameraState = {
  type:     CameraMovement;
  position: { x: number; y: number; z: number };
  lens:     "24mm" | "35mm" | "50mm" | "85mm";
  movement: string;   // human-readable description for prompt injection
};
