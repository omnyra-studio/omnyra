/**
 * @deprecated Seedance removed — all video generation routes through Luma Ray 2 via fal.ai.
 * This file re-exports Luma for backward-compatible imports.
 */

export {
  falLumaGenerate,
  falSeedanceFastGenerate,
  callSeedance,
  LUMA_DREAM_MACHINE_MODEL,
  LUMA_DREAM_MACHINE_T2V,
  LUMA_DREAM_MACHINE_I2V,
  LUMA_RAY2_MODEL,
  LUMA_RAY2_T2V,
  LUMA_RAY2_I2V,
  SEEDANCE_FAL_FAST_MODEL,
  SEEDANCE_T2V_MODEL,
  SEEDANCE_I2V_MODEL,
  type FalLumaParams,
  type FalLumaResult,
  type FalSeedanceFastParams,
  type FalSeedanceFastResult,
  type SeedanceGenerateInput,
  type SeedanceGenerateResult,
} from "./luma";