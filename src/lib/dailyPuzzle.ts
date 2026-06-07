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

// Day-zero anchor. Every date <= EPOCH starts a fresh cycle (no exclusions).
// The recursive walk forward from EPOCH bottoms out here, so total work per
// cold request is O((today − EPOCH) × COUNT).
const EPOCH = '2026-01-01';
const COUNT = 8;

// Bump SEED_VERSION to reroll every date's pick. Each version produces a
// different (still full-cycle) traversal of the seed pool.
const SEED_VERSION = 'v3';

// Shuffle the pool with the date-seeded RNG and take the first `count`
// entries that aren't in `excluded`. Order (shuffle, then filter exclusion)
// makes the result deterministic given (date, excluded).
function pickFromShuffle(date: string, count: number, excluded: Set<string>): SeedLocation[] {
  const seeded = xmur3(`rgg:${SEED_VERSION}:${date}`);
  const rand = mulberry32(seeded());
  const shuffled = [...seedLocations];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out: SeedLocation[] = [];
  for (const s of shuffled) {
    if (out.length >= count) break;
    if (excluded.has(s.name)) continue;
    out.push(s);
  }
  // Safety net: if `excluded` somehow ate the entire pool (shouldn't happen
  // because we reset the cycle before that), fall back to plain shuffle.
  if (out.length < count) {
    for (const s of shuffled) {
      if (out.length >= count) break;
      if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

// Per-date state: today's picks AND the cumulative set of every landmark
// already shown in the current cycle (including today's picks). A "cycle"
// is one complete pass through the seed pool — when the remaining pool drops
// below COUNT, the next date starts a fresh cycle with an empty shown set.
//
// Guarantees: no landmark repeats until every entry in seedLocations has
// appeared at least once in the current cycle.
type DayState = { picks: SeedLocation[]; shown: Set<string> };
const dayCache = new Map<string, DayState>();

function dayState(date: string): DayState {
  const cached = dayCache.get(date);
  if (cached) return cached;

  if (date <= EPOCH) {
    const picks = pickFromShuffle(date, COUNT, new Set());
    const state: DayState = { picks, shown: new Set(picks.map(p => p.name)) };
    dayCache.set(date, state);
    return state;
  }

  const prev = dayState(offsetDate(date, -1));

  // If yesterday's cumulative `shown` leaves fewer than COUNT unseen entries,
  // this date kicks off a fresh cycle.
  const remaining = seedLocations.length - prev.shown.size;
  const startFresh = remaining < COUNT;

  const exclude = startFresh ? new Set<string>() : prev.shown;
  const picks = pickFromShuffle(date, COUNT, exclude);
  const shown = new Set(startFresh ? [] : prev.shown);
  for (const p of picks) shown.add(p.name);

  const state: DayState = { picks, shown };
  dayCache.set(date, state);
  return state;
}

// Pick COUNT distinct seed locations for the given date. Across consecutive
// dates, no landmark repeats until every entry in seedLocations has appeared
// at least once; after that the picker resets and starts a fresh cycle.
export function pickDailySeeds(date: string, count = COUNT): SeedLocation[] {
  const picks = dayState(date).picks;
  return count === COUNT ? picks : picks.slice(0, count);
}
