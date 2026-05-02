// Haversine great-circle distance in kilometers.
const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// Score 0-100 based on great-circle distance. 0 km -> 100, >=2000 km -> 0.
export function scoreFromDistance(km: number, maxKm = 2000): number {
  if (km <= 0) return 100;
  if (km >= maxKm) return 0;
  return Math.round(100 * (1 - km / maxKm));
}
