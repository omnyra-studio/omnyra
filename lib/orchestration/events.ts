import type { ShotPacket } from "@/lib/types/shot";

// Minimal script shape surfaced in events — avoids importing the full DB row type
export interface ScriptSummary {
  id: string;
  content: string;
  platform: string;
  estimated_duration_seconds: number | null;
}

export type OrchestrationEvent =
  | { type: "SCRIPT_CREATED";    payload: ScriptSummary }
  | { type: "SHOT_PLAN_CREATED"; payload: ShotPacket[] }
  | { type: "VOICEOVER_STARTED" }
  | { type: "VOICEOVER_READY";   url: string }
  | { type: "SHOT_RENDERED";     shotId: string; clipUrl: string }
  | { type: "SHOT_FAILED";       shotId: string; error: string }
  | { type: "COMPOSITION_STARTED" }
  | { type: "PROJECT_COMPLETED"; url: string };

/** Encode one OrchestrationEvent as a complete SSE `data:` frame. */
export function sseEncode(event: OrchestrationEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Parse the raw string from an EventSource `message` event. Returns null on failure. */
export function sseParse(raw: string): OrchestrationEvent | null {
  try {
    return JSON.parse(raw) as OrchestrationEvent;
  } catch {
    return null;
  }
}

/** Typed terminal events — once one of these arrives the pipeline is done. */
export const TERMINAL_EVENTS: OrchestrationEvent["type"][] = [
  "PROJECT_COMPLETED",
];
