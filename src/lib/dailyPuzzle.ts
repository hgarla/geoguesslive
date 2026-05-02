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

// Pick 8 distinct seed locations deterministically for the given date.
export function pickDailySeeds(date: string, count = 8): SeedLocation[] {
  const seeded = xmur3(date);
  const rand = mulberry32(seeded());

  const pool = [...seedLocations];
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
