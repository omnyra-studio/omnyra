export type EnvironmentState = {
  location:       string;
  timeOfDay:      "dawn" | "morning" | "midday" | "golden-hour" | "dusk" | "night";
  weather:        string;
  lightingVector: string;  // e.g. "golden from camera-left, rim from right"
  ambientColor:   string;  // e.g. "#F5C77E"
};
