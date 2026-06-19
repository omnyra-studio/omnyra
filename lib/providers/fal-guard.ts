/**
 * Cost-protection guards — fail fast when provider/model routing is inconsistent.
 */

export type FalProvider = "seedance" | "luma" | "kling";

export interface FalRequestLog {
  provider:     FalProvider;
  model:        string;
  endpoint:     string;
  sceneNumber?: number;
  duration?:    number | string;
}

/** Reject cross-provider model selection before any paid FAL call. */
export function assertProviderModel(provider: FalProvider, model: string): void {
  const m = model.toLowerCase();

  if (provider === "seedance" && (m.includes("luma") || m.includes("ray-2"))) {
    throw new Error("Invalid routing: Seedance selected but Luma model requested.");
  }

  if (provider === "luma" && (m.includes("seedance") || m.includes("bytedance"))) {
    throw new Error("Invalid routing: Luma selected but Seedance model requested.");
  }
}

/** Log every FAL request with routing context for audit trails. */
export function logFalRequest(params: FalRequestLog): void {
  console.log("[FAL_REQUEST]", params);
}