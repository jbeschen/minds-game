/**
 * SeedProgress — Cross-session persistence for seed discovery state.
 *
 * Tracks per-seed statistics so the constellation can reflect how much
 * the player has explored each seed. Stored in localStorage.
 *
 * Plugin guardrail: This is a utility module. No game logic, no ECS imports.
 */

const STORAGE_KEY = 'minds_seed_progress';

export interface SeedProgressData {
  /** Number of entities discovered in this seed's world */
  discovered: number;
  /** Total observable entities in this seed's world */
  total: number;
  /** Total time spent in this seed (seconds) */
  playtime: number;
  /** Number of times this seed has been entered */
  visits: number;
  /** Timestamp of last visit */
  lastVisited: number;
}

export type AllSeedProgress = Record<string, SeedProgressData>;

/** Load all seed progress from localStorage */
export function loadSeedProgress(): AllSeedProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupted data — start fresh
  }
  return {};
}

/** Save all seed progress to localStorage */
export function saveSeedProgress(data: AllSeedProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Get progress for a single seed (returns default if not found) */
export function getSeedProgress(seedId: string): SeedProgressData {
  const all = loadSeedProgress();
  return all[seedId] ?? { discovered: 0, total: 0, playtime: 0, visits: 0, lastVisited: 0 };
}

/** Update progress for a single seed */
export function updateSeedProgress(seedId: string, update: Partial<SeedProgressData>): void {
  const all = loadSeedProgress();
  const current = all[seedId] ?? { discovered: 0, total: 0, playtime: 0, visits: 0, lastVisited: 0 };
  all[seedId] = { ...current, ...update };
  saveSeedProgress(all);
}

/** Get discovery ratio for a seed (0..1, 0 if never visited) */
export function getSeedDiscoveryRatio(seedId: string): number {
  const p = getSeedProgress(seedId);
  if (p.total === 0) return 0;
  return p.discovered / p.total;
}
