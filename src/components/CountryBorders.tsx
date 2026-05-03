import React, { useMemo } from 'react';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import topology from 'world-atlas/countries-110m.json';
import { geoToPixel } from '@/lib/projection';

// Renders the world's country borders as SVG paths, projected with the same
// equirectangular formula as our pin coordinates so everything aligns.
// When `fill` is set (default), this also acts as the visible map — no
// underlying bitmap is needed.

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
}> = ({ stroke = 'rgb(75,85,99)', strokeWidth = 0.4, fill = 'rgb(243,244,246)' }) => {
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
