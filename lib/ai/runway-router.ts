export type SpeedMode = "fast" | "quality";
export type RunwayModel = "gen3-turbo" | "gen3-alpha";

export interface RunwayRouting {
  model:    RunwayModel;
  provider: "runway";
  reason:   string;
}

export function chooseRunwayModel(
  _narration: string,
  _tier:      string,
  speed:      SpeedMode = "fast",
): RunwayRouting {
  const model: RunwayModel = speed === "quality" ? "gen3-alpha" : "gen3-turbo";
  return { model, provider: "runway", reason: `runway-only speed=${speed}` };
}

export async function generateWithRetry(
  prompt:    string,
  imageUrl:  string,
  duration:  number,
  speedMode: SpeedMode = "fast",
): Promise<unknown> {
  const model = speedMode === "quality" ? "gen3-alpha" : "gen3-turbo";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.runwayml.com/v1/inference", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          image:        imageUrl,
          duration,
          aspect_ratio: "9:16",
        }),
      });

      if (res.status === 429) {
        const backoff = attempt * 4000;
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Runway error: ${res.status} ${error}`);
      }

      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
