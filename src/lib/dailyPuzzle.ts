import { seedLocations } from '@/data/seedLocations';
import type { SeedLocation } from '@/types';

// Deterministic 32-bit hash of a string (xmur3-like).
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns YYYY-MM-DD in UTC for a Date.
export function dateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function offsetDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Anchor before which the no-repeat lookback stops recursing — keeps recursion
// bounded and reproducible. Any date <= EPOCH uses raw shuffle (no exclusion).
const EPOCH = '2026-01-01';
const RECENT_DAYS = 7;

// Memoize per-date picks so the recursive lookback computes each date once.
const dailyCache = new Map<string, SeedLocation[]>();

function pickFromShuffle(date: string, count: number, excluded: Set<string>): SeedLocation[] {
  const seeded = xmur3('rgg:' + date);
  const rand = mulberry32(seeded());
  const pool = seedLocations.filter(s => !excluded.has(s.name));

  // Edge case: not enough non-excluded seeds — fall back to allowing repeats
  // from oldest excluded entries, deterministically.
  if (pool.length < count) {
    const fallback = seedLocations.filter(s => excluded.has(s.name));
    const seeded2 = xmur3('rgg-fb:' + date);
    const rand2 = mulberry32(seeded2());
    for (let i = fallback.length - 1; i > 0; i--) {
      const j = Math.floor(rand2() * (i + 1));
      [fallback[i], fallback[j]] = [fallback[j], fallback[i]];
    }
    const combined = [...pool, ...fallback];
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined.slice(0, count);
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// Pick 8 distinct seed locations deterministically for the given date,
// excluding any that appeared in the previous RECENT_DAYS days.
//
// Result is cached per-date in module scope. Recursion is bounded by EPOCH:
// dates at or before EPOCH use a raw shuffle with no exclusion, so a
// dependency chain from today bottoms out at EPOCH. With memoization, total
// work per request is O((today - EPOCH) × seedCount), <2ms in practice.
export function pickDailySeeds(date: string, count = 8): SeedLocation[] {
  const cached = dailyCache.get(date);
  if (cached) return cached;

  if (date <= EPOCH) {
    const result = pickFromShuffle(date, count, new Set());
    dailyCache.set(date, result);
    return result;
  }

  const excluded = new Set<string>();
  for (let d = 1; d <= RECENT_DAYS; d++) {
    const prev = offsetDate(date, -d);
    for (const s of pickDailySeeds(prev, count)) excluded.add(s.name);
  }

  const result = pickFromShuffle(date, count, excluded);
  dailyCache.set(date, result);
  return result;
}
