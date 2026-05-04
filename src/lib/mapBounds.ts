// Trim the polar caps from the playable area. The map image is full
// equirectangular (-90..90 lat) but we crop the visible region via SVG
// viewBox so Antarctica + the very top of Greenland aren't shown — they
// have no landmarks in the seed list anyway.

export const SOUTH_LIMIT = -58;
export const NORTH_LIMIT = 70;
export const WORLD_LAT_SPAN = NORTH_LIMIT - SOUTH_LIMIT; // 128
export const WORLD_LNG_SPAN = 360;

// Equirectangular aspect ratio of the cropped playable area.
// width:height = 360°:128° ≈ 2.8125
export const WORLD_ASPECT = WORLD_LNG_SPAN / WORLD_LAT_SPAN;
