// Equirectangular (plate carrée) projection helpers + region-grid math.
// All coordinates are expressed in the FULL image's logical viewBox (800x400)
// where the image is rendered from y=0 (lat 90) to y=400 (lat -90). The
// playable strip goes from y=MAP_CROP_TOP (lat NORTH_LIMIT) to y=MAP_CROP_BOTTOM
// (lat SOUTH_LIMIT). Cells, grid lines, and labels are placed inside that strip.

import { NORTH_LIMIT, SOUTH_LIMIT, WORLD_LAT_SPAN } from './mapBounds';
import { haversineKm } from './distance';

export const MAP_VIEWBOX = { width: 800, height: 400 } as const;

// Cropped y-bounds in the same coordinate space as MAP_VIEWBOX.
export const MAP_CROP_TOP = ((90 - NORTH_LIMIT) / 180) * MAP_VIEWBOX.height;
export const MAP_CROP_BOTTOM = ((90 - SOUTH_LIMIT) / 180) * MAP_VIEWBOX.height;
export const MAP_CROP_HEIGHT = MAP_CROP_BOTTOM - MAP_CROP_TOP;

export function geoToPixel(lat: number, lng: number) {
  const x = ((lng + 180) / 360) * MAP_VIEWBOX.width;
  const y = ((90 - lat) / 180) * MAP_VIEWBOX.height;
  return { x, y };
}

export function pixelToGeo(x: number, y: number) {
  const lng = (x / MAP_VIEWBOX.width) * 360 - 180;
  const lat = 90 - (y / MAP_VIEWBOX.height) * 180;
  return { lat, lng };
}

// Round configs — N cols x M rows of equal-sized cells over the playable strip.
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

// Returns the region index (row-major, 0-based) that contains the given lat/lng
// in the playable strip. Latitudes outside the strip clamp to the nearest row.
export function regionForCoord(round: number, lat: number, lng: number): number {
  const cfg = roundConfigs[round];
  if (!cfg) return 0;
  const lngFrac = (lng + 180) / 360;
  const latFrac = (NORTH_LIMIT - lat) / WORLD_LAT_SPAN;
  const col = Math.min(cfg.cols - 1, Math.max(0, Math.floor(lngFrac * cfg.cols)));
  const row = Math.min(cfg.rows - 1, Math.max(0, Math.floor(latFrac * cfg.rows)));
  return row * cfg.cols + col;
}

// True iff (a) the correct landmark sits within ~50 mi (`thresholdKm`) of the
// nearest edge of its own region cell — i.e. close enough that landing in a
// neighboring region is genuinely a "just over the border" mistake — AND (b)
// the player's guess landed in a region 8-connected-adjacent (including
// diagonals) to the correct one.
//
// This stops the orange "so close!" feedback from firing when the landmark
// sits comfortably mid-region but the player happened to click the next
// region over.
export function isNearMissGuess(
  round: number,
  correctLat: number,
  correctLng: number,
  correctRegionIdx: number,
  guessedRegionIdx: number,
  thresholdKm = 80, // ≈ 50 miles
): boolean {
  if (correctRegionIdx === guessedRegionIdx) return false;
  const cfg = roundConfigs[round];
  if (!cfg) return false;

  // (b) Adjacency check first — cheap, rejects most non-near cases.
  const cRow = Math.floor(correctRegionIdx / cfg.cols);
  const cCol = correctRegionIdx % cfg.cols;
  const gRow = Math.floor(guessedRegionIdx / cfg.cols);
  const gCol = guessedRegionIdx % cfg.cols;
  const adjacent = Math.abs(cRow - gRow) <= 1 && Math.abs(cCol - gCol) <= 1;
  if (!adjacent) return false;

  // (a) Ground-km distance from the correct landmark to each of its region's
  // four edges. We use haversine (not pixel distance) so the threshold is a
  // real-world distance regardless of latitude or cell pixel size.
  const topLat = NORTH_LIMIT - (cRow / cfg.rows) * WORLD_LAT_SPAN;
  const bottomLat = NORTH_LIMIT - ((cRow + 1) / cfg.rows) * WORLD_LAT_SPAN;
  const leftLng = -180 + (cCol / cfg.cols) * 360;
  const rightLng = -180 + ((cCol + 1) / cfg.cols) * 360;
  const dTop = haversineKm(correctLat, correctLng, topLat, correctLng);
  const dBottom = haversineKm(correctLat, correctLng, bottomLat, correctLng);
  const dLeft = haversineKm(correctLat, correctLng, correctLat, leftLng);
  const dRight = haversineKm(correctLat, correctLng, correctLat, rightLng);
  const nearestEdgeKm = Math.min(dTop, dBottom, dLeft, dRight);
  return nearestEdgeKm <= thresholdKm;
}
