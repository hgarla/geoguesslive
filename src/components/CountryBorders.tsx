import React, { useMemo } from 'react';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import topology from 'world-atlas/countries-110m.json';
import { geoToPixel } from '@/lib/projection';

// Render the world's country borders as SVG paths over the equirectangular
// map. Coordinates are projected with the same geoToPixel used by pins, so
// borders align pixel-for-pixel with the existing map.

type CountryFeature = Feature<Polygon | MultiPolygon>;

const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

function ringToPath(ring: number[][]): string {
  let s = '';
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const { x, y } = geoToPixel(lat, lng);
    s += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return s + 'Z';
}

function featureToPath(f: CountryFeature): string {
  const g = f.geometry;
  if (g.type === 'Polygon') {
    return g.coordinates.map(ringToPath).join('');
  }
  if (g.type === 'MultiPolygon') {
    return g.coordinates
      .map(poly => poly.map(ringToPath).join(''))
      .join('');
  }
  return '';
}

export const CountryBorders: React.FC<{
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}> = ({ stroke = 'rgba(31,41,55,0.55)', strokeWidth = 0.4, fill = 'transparent' }) => {
  const paths = useMemo(() => {
    const topo = topology as unknown as Topology;
    const geom = topo.objects.countries as GeometryCollection;
    const collection = feature(topo, geom) as unknown as { features: CountryFeature[] };
    return collection.features
      .filter(f => POLYGON_TYPES.has(f.geometry.type))
      .map(f => featureToPath(f));
  }, []);

  return (
    <g pointerEvents="none">
      {paths.map((d, i) => (
        <path key={i} d={d} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />
      ))}
    </g>
  );
};
