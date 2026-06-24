export interface FrameSegment {
  sceneIndex:    number;
  startMs:       number;
  endMs:         number;
  durationMs:    number;
  clipUrl:       string;
  keyframeUrl?:  string;
  provider:      'kling' | 'runway';
  driftScore:    number;
  retries:       number;
}

export class FrameTimelineEngine {
  private segments: FrameSegment[] = [];

  addSegment(seg: FrameSegment): void {
    this.segments.push(seg);
    this.segments.sort((a, b) => a.sceneIndex - b.sceneIndex);
  }

  totalDurationMs(): number {
    if (this.segments.length === 0) return 0;
    const last = this.segments[this.segments.length - 1];
    return last.startMs + last.durationMs;
  }

  getSegment(sceneIndex: number): FrameSegment | undefined {
    return this.segments.find(s => s.sceneIndex === sceneIndex);
  }

  orderedClipUrls(): string[] {
    return this.segments.map(s => s.clipUrl);
  }

  /** Recompute startMs values so segments are contiguous (no gaps/overlaps). */
  repack(): void {
    let cursor = 0;
    for (const seg of this.segments) {
      seg.startMs = cursor;
      cursor += seg.durationMs;
    }
  }

  summary(): { totalScenes: number; totalDurationMs: number; avgDrift: number; providers: Record<string, number> } {
    const totalScenes = this.segments.length;
    const totalDurationMs = this.totalDurationMs();
    const avgDrift = totalScenes > 0
      ? this.segments.reduce((s, seg) => s + seg.driftScore, 0) / totalScenes
      : 0;
    const providers: Record<string, number> = {};
    for (const seg of this.segments) {
      providers[seg.provider] = (providers[seg.provider] ?? 0) + 1;
    }
    return { totalScenes, totalDurationMs, avgDrift, providers };
  }

  toJSON(): FrameSegment[] {
    return structuredClone(this.segments);
  }
}
