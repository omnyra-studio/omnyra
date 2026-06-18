/**
 * artifacts/backend/core/brand-memory/index.ts
 * Public API for the fixed unified brand memory.
 */
export {
  loadUnifiedBrandMemory,
  saveBrandProfileAndSync,
  saveCampaignBrandMemory,
  loadCampaignBrandMemory,
  getBrandPromptSuffixes,
  EMPTY_MEMORY,
} from "./unified";

export type {
  UnifiedBrandMemory,
  BrandProfileInput,
  CreatorProfileInput,
  BrandBrainRow,
  CampaignBrandMemory,
  SocialPlatformEntry,
  Product,
} from "../../types/brand";
