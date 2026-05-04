// Shared map bounds constants. Imported by both MapPicker (Leaflet config)
// and the parent component (container aspect ratio). Kept out of the
// Leaflet-specific module so the parent can read it without pulling in
// the dynamic-only Leaflet bundle.

export const SOUTH_LIMIT = -58;
export const NORTH_LIMIT = 70;
export const WORLD_LAT_SPAN = NORTH_LIMIT - SOUTH_LIMIT;
export const WORLD_LNG_SPAN = 360;

// Web Mercator (EPSG:3857) y-coordinate. Returns radians.
function mercatorY(latDeg: number): number {
  const latRad = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

// Mercator world aspect = (full lng span = 2π) / (mercator y span between
// our lat bounds). Setting the container's aspect-ratio to this makes the
// playable world fill the container exactly, no padding on any side.
export const WORLD_ASPECT =
  (2 * Math.PI) / (mercatorY(NORTH_LIMIT) - mercatorY(SOUTH_LIMIT));

export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [SOUTH_LIMIT, -180],
  [NORTH_LIMIT, 180],
];
