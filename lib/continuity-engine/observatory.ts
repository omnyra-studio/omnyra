/**
 * Continuity Observatory — real-time drift and quality monitoring.
 *
 * "Datadog for cinematic continuity."
 * Records per-scene observations and exposes trend analysis.
 */

export type ObservationEntry = {
  sceneId:         string;
  sceneIndex:      number;
  timestamp:       number;
  snapshotVersion: number;
  cameraDrift:     number;
  faceDrift:       number;
  objectLoss:      number;
  emotionShift:    number;
  totalDriftScore: number;
  modelUsed:       "runway" | "kling";
  retryCount:      number;
};

export type DriftTrend = {
  avgDrift:     number;
  maxDrift:     number;
  worstScenes:  ObservationEntry[];
  systemFailureRisk: "low" | "medium" | "high";
};

const FAILURE_THRESHOLD  = 0.15;
const WARNING_THRESHOLD  = 0.08;

export class ContinuityObservatory {
  private readonly log: ObservationEntry[] = [];

  record(entry: Omit<ObservationEntry, "timestamp">): void {
    this.log.push({ ...entry, timestamp: Date.now() });
    this.checkForAlert(entry);
  }

  private checkForAlert(entry: Omit<ObservationEntry, "timestamp">): void {
    if (entry.cameraDrift > FAILURE_THRESHOLD) {
      console.error(
        `[OBSERVATORY] 🔴 CRITICAL drift scene=${entry.sceneIndex} cam=${entry.cameraDrift.toFixed(3)} face=${entry.faceDrift.toFixed(3)}`,
      );
    } else if (entry.cameraDrift > WARNING_THRESHOLD) {
      console.warn(
        `[OBSERVATORY] 🟡 WARNING drift scene=${entry.sceneIndex} cam=${entry.cameraDrift.toFixed(3)}`,
      );
    }
  }

  getDriftTrends(): DriftTrend {
    if (!this.log.length) {
      return { avgDrift: 0, maxDrift: 0, worstScenes: [], systemFailureRisk: "low" };
    }

    const sorted = [...this.log].sort((a, b) => b.cameraDrift - a.cameraDrift);
    const avgDrift = this.log.reduce((s, e) => s + e.cameraDrift, 0) / this.log.length;
    const maxDrift = sorted[0].cameraDrift;

    const systemFailureRisk: DriftTrend["systemFailureRisk"] =
      maxDrift > FAILURE_THRESHOLD ? "high" :
      avgDrift > WARNING_THRESHOLD ? "medium" : "low";

    return {
      avgDrift:  Math.round(avgDrift * 1000) / 1000,
      maxDrift:  Math.round(maxDrift * 1000) / 1000,
      worstScenes: sorted.slice(0, 5),
      systemFailureRisk,
    };
  }

  detectSystemFailurePattern(): ObservationEntry[] {
    return this.log.filter(e => e.cameraDrift > FAILURE_THRESHOLD);
  }

  /** Returns a summary suitable for injecting into logs or DB. */
  summary() {
    const trends = this.getDriftTrends();
    return {
      totalScenes:   this.log.length,
      avgDrift:      trends.avgDrift,
      riskLevel:     trends.systemFailureRisk,
      failures:      this.detectSystemFailurePattern().length,
      modelBreakdown: this.log.reduce<Record<string, number>>((acc, e) => {
        acc[e.modelUsed] = (acc[e.modelUsed] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }
}
