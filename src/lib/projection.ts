// Region grid math, kept in sync with mapBounds.ts so the cells the player
// sees on the map match the indexing this file produces.

import { NORTH_LIMIT, WORLD_LAT_SPAN } from './mapBounds';

// Round configs — N cols x M rows of equally-sized cells covering the
// playable world (lng [-180, 180], lat [SOUTH_LIMIT, NORTH_LIMIT]).
export const roundConfigs: Record<number, { cols: number; rows: number }> = {
  1: { cols: 2, rows: 1 },
  2: { cols: 2, rows: 2 },
  3: { cols: 3, rows: 2 },
  4: { cols: 3, rows: 3 },
  5: { cols: 4, rows: 3 },
  6: { cols: 4, rows: 4 },
  7: { cols: 5, rows: 5 },
  8: { cols: 6, rows: 6 },
};

// Returns the region index (row-major, 0-based) that contains the given
// lat/lng for the given round. Latitudes outside the play area are clamped
// to the nearest visible row.
export function regionForCoord(round: number, lat: number, lng: number): number {
  const cfg = roundConfigs[round];
  if (!cfg) return 0;
  const lngFrac = (lng + 180) / 360; // 0..1, west to east
  const latFrac = (NORTH_LIMIT - lat) / WORLD_LAT_SPAN; // 0..1, north to south
  const col = Math.min(cfg.cols - 1, Math.max(0, Math.floor(lngFrac * cfg.cols)));
  const row = Math.min(cfg.rows - 1, Math.max(0, Math.floor(latFrac * cfg.rows)));
  return row * cfg.cols + col;
}
