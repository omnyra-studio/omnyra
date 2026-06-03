// Caching — multi-layer cache abstraction.
// Layer 1: Prompt cache (scene_hash + brand_state_version + prompt_version)
// Layer 2: Generation cache (hash of prompt + seed + model_version)
// Layer 3: Validation cache (identical frame hash + scene context)

import { createHash } from "crypto";

// ── Generic cache interface ───────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class InMemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }

  delete(key: string): void { this.store.delete(key); }

  size(): number { return this.store.size; }
}

// ── Prompt cache ──────────────────────────────────────────────────────────────

const promptCache = new InMemoryCache<string>();

export function hashPromptKey(
  scenePrompt: string,
  brandStateVersion: string,
  promptVersion: string,
): string {
  return createHash("sha256")
    .update(`${scenePrompt}::${brandStateVersion}::${promptVersion}`)
    .digest("hex")
    .slice(0, 16);
}

const PROMPT_CACHE_TTL = 30 * 60 * 1000; // 30 min

export function getCachedPrompt(key: string): string | null {
  return promptCache.get(key);
}

export function cachePrompt(key: string, compiledPrompt: string): void {
  promptCache.set(key, compiledPrompt, PROMPT_CACHE_TTL);
}

// ── Generation cache ──────────────────────────────────────────────────────────

const generationCache = new InMemoryCache<string>(); // key → output URL

export function hashGenerationKey(prompt: string, model: string, seed?: number): string {
  return createHash("sha256")
    .update(`${prompt}::${model}::${seed ?? 0}`)
    .digest("hex")
    .slice(0, 16);
}

const GENERATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function getCachedGeneration(key: string): string | null {
  return generationCache.get(key);
}

export function cacheGeneration(key: string, outputUrl: string): void {
  generationCache.set(key, outputUrl, GENERATION_CACHE_TTL);
}

// ── Validation cache ──────────────────────────────────────────────────────────

interface ValidationSnapshot {
  characterScore: number;
  environmentScore: number;
  objectScore: number;
  overall: number;
}

const validationCache = new InMemoryCache<ValidationSnapshot>();

export function hashValidationKey(frameAUrl: string, frameBUrl: string): string {
  return createHash("sha256")
    .update(`${frameAUrl}::${frameBUrl}`)
    .digest("hex")
    .slice(0, 16);
}

const VALIDATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedValidation(key: string): ValidationSnapshot | null {
  return validationCache.get(key);
}

export function cacheValidation(key: string, snapshot: ValidationSnapshot): void {
  validationCache.set(key, snapshot, VALIDATION_CACHE_TTL);
}
