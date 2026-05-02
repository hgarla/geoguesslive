// Equirectangular projection: linear lat/lng -> pixel.
// REQUIREMENT: /images/world-map.jpeg must be an equirectangular world map
// (Plate Carrée), full -180..180 lng and -90..90 lat with no cropping.
// If the map is Mercator/Robinson/etc., pins will be off — swap the file.
// A known-good source: https://commons.wikimedia.org/wiki/File:Equirectangular_projection_SW.jpg

export const MAP_VIEWBOX = { width: 800, height: 400 } as const;

export function geoToPixel(lat: number, lng: number, w = MAP_VIEWBOX.width, h = MAP_VIEWBOX.height) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

export function pixelToGeo(x: number, y: number, w = MAP_VIEWBOX.width, h = MAP_VIEWBOX.height) {
  const lng = (x / w) * 360 - 180;
  const lat = 90 - (y / h) * 180;
  return { lat, lng };
}

// Round configs — round 1 is two halves split at the prime meridian;
// rounds 2-8 split the map with N vertical and M horizontal interior lines,
// producing (N+1) x (M+1) cells.
export type RoundConfig =
  | { round: 1; cols: 2; rows: 1 }
  | { round: number; cols: number; rows: number };

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

// Returns the region index (row-major) that contains the given lat/lng for a given round.
export function regionForCoord(round: number, lat: number, lng: number): number {
  const cfg = roundConfigs[round];
  if (!cfg) return 0;
  const { x, y } = geoToPixel(lat, lng);
  const cellW = MAP_VIEWBOX.width / cfg.cols;
  const cellH = MAP_VIEWBOX.height / cfg.rows;
  const col = Math.min(cfg.cols - 1, Math.max(0, Math.floor(x / cellW)));
  const row = Math.min(cfg.rows - 1, Math.max(0, Math.floor(y / cellH)));
  return row * cfg.cols + col;
}
