// Shared map bounds constants. Imported by both MapPicker (Leaflet config)
// and the parent component (container aspect ratio). Kept out of the
// Leaflet-specific module so the parent can read it without pulling in
// the dynamic-only Leaflet bundle.

export const SOUTH_LIMIT = -58;
export const NORTH_LIMIT = 70;
export const WORLD_LAT_SPAN = NORTH_LIMIT - SOUTH_LIMIT; // 128
export const WORLD_LNG_SPAN = 360;
// Equirectangular projection: aspect ratio = lng span / lat span.
// Container width:height should match this so the world fills the box
// exactly with no padding on any side.
export const WORLD_ASPECT = WORLD_LNG_SPAN / WORLD_LAT_SPAN;

export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [SOUTH_LIMIT, -180],
  [NORTH_LIMIT, 180],
];
