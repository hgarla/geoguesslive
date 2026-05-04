import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Polygon, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet';
import L, { type LeafletMouseEvent } from 'leaflet';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon as GJPolygon } from 'geojson';
import topology from 'world-atlas/countries-110m.json';
import { roundConfigs } from '@/lib/projection';
import { SOUTH_LIMIT, NORTH_LIMIT, WORLD_BOUNDS } from '@/lib/mapBounds';

// react-leaflet pulls in `leaflet`, which touches `window`/`document` at
// import time. The parent imports this file via next/dynamic({ ssr: false })
// so it never runs on the server.

interface MapPickerProps {
  round: number;
  target?: { lat: number; lng: number; name: string };
  click?: { lat: number; lng: number } | null;
  guessedRegion?: number | null;
  isCorrect?: boolean | null;
  reveal?: boolean;
  disabled?: boolean;
  onGuess: (lat: number, lng: number) => void;
}

// Forces Leaflet to recompute layout when the outer wrapper resizes (hover
// expand). Without this, the leaflet-container sometimes keeps rendering at
// the old size inside the larger wrapper.
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const obs = new ResizeObserver(() => {
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [map]);
  return null;
}

// On mount and on every map resize, fit world bounds and lock minZoom to the
// fitted level. Player can zoom in but never zoom out past the playable world.
function FitAndLockBounds() {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const z = map.getBoundsZoom(WORLD_BOUNDS, false);
      map.setMinZoom(z);
      map.fitBounds(WORLD_BOUNDS, { padding: [0, 0], animate: false });
    };
    update();
    map.on('resize', update);
    return () => { map.off('resize', update); };
  }, [map]);
  return null;
}

// SVG country fills + borders, projected by Leaflet (CRS handles lat/lng -> px).
type CountryFeature = Feature<GJPolygon | MultiPolygon>;

function CountriesLayer() {
  const features = useMemo<CountryFeature[]>(() => {
    const topo = topology as unknown as Topology;
    const collection = feature(topo, topo.objects.countries as GeometryCollection) as unknown as { features: CountryFeature[] };
    return collection.features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
  }, []);

  return (
    <>
      {features.map((f, i) => {
        let positions: [number, number][][] | [number, number][][][] = [];
        if (f.geometry.type === 'Polygon') {
          positions = f.geometry.coordinates.map(ring =>
            ring.map(([lng, lat]) => [lat, lng] as [number, number])
          );
        } else {
          positions = f.geometry.coordinates.map(poly =>
            poly.map(ring => ring.map(([lng, lat]) => [lat, lng] as [number, number]))
          );
        }
        return (
          <Polygon
            key={i}
            positions={positions}
            pathOptions={{
              fillColor: '#e5e7eb',
              fillOpacity: 1,
              color: '#6b7280',
              weight: 0.4,
              interactive: false,
            }}
          />
        );
      })}
    </>
  );
}

interface Cell {
  idx: number;
  bounds: [number, number][]; // 4 corners as [lat, lng]
  centerLat: number;
  centerLng: number;
}

export default function MapPicker({ round, target, click, guessedRegion, isCorrect, reveal, disabled, onGuess }: MapPickerProps) {
  const cfg = roundConfigs[round];
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const gridLines = useMemo(() => {
    if (!cfg) return [];
    const lines: { positions: [number, number][]; key: string }[] = [];
    const lngStep = 360 / cfg.cols;
    const latStep = (NORTH_LIMIT - SOUTH_LIMIT) / cfg.rows;
    for (let i = 1; i < cfg.cols; i++) {
      const lng = -180 + i * lngStep;
      lines.push({ key: `v${i}`, positions: [[SOUTH_LIMIT, lng], [NORTH_LIMIT, lng]] });
    }
    for (let i = 1; i < cfg.rows; i++) {
      const lat = NORTH_LIMIT - i * latStep;
      lines.push({ key: `h${i}`, positions: [[lat, -180], [lat, 180]] });
    }
    return lines;
  }, [cfg]);

  // Cells span the playable bounds exactly so all cells are equal in
  // equirectangular projection, with no degenerate polar slivers.
  const cells = useMemo<Cell[]>(() => {
    if (!cfg) return [];
    const out: Cell[] = [];
    const lngStep = 360 / cfg.cols;
    const latStep = (NORTH_LIMIT - SOUTH_LIMIT) / cfg.rows;
    for (let row = 0; row < cfg.rows; row++) {
      for (let col = 0; col < cfg.cols; col++) {
        const idx = row * cfg.cols + col;
        const west = -180 + col * lngStep;
        const east = west + lngStep;
        const north = NORTH_LIMIT - row * latStep;
        const south = north - latStep;
        out.push({
          idx,
          bounds: [
            [north, west],
            [north, east],
            [south, east],
            [south, west],
          ],
          centerLat: (north + south) / 2,
          centerLng: (east + west) / 2,
        });
      }
    }
    return out;
  }, [cfg]);

  const cellHandlers = (idx: number) => ({
    mouseover: () => {
      if (disabled) return;
      setHoveredIdx(idx);
    },
    mouseout: () => setHoveredIdx(prev => (prev === idx ? null : prev)),
    click: (e: LeafletMouseEvent) => {
      if (disabled) return;
      // Stop the click from also bubbling to the map's own click handler,
      // which would fire onGuess twice and skip rounds by 2.
      L.DomEvent.stopPropagation(e);
      onGuess(e.latlng.lat, e.latlng.lng);
    },
  });

  const guessedColor = isCorrect ? '#22c55e' : '#ef4444';

  return (
    <MapContainer
      crs={L.CRS.EPSG4326}
      bounds={WORLD_BOUNDS}
      boundsOptions={{ padding: [0, 0], animate: false }}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1.0}
      maxZoom={6}
      zoomSnap={0.1}
      scrollWheelZoom
      worldCopyJump={false}
      attributionControl={false}
      className="w-full h-full"
      style={{ background: '#cfe7fa' }}
    >
      <ResizeWatcher />
      <FitAndLockBounds />
      <CountriesLayer />

      {/* Cell polygons sit above country fills and below the grid lines,
          so hover tints don't obscure the dashed borders. Cells handle their
          own click; map.click is intentionally NOT bound to avoid double-fire. */}
      {cells.map(cell => {
        const isGuessed = guessedRegion === cell.idx;
        const isHovered = !disabled && hoveredIdx === cell.idx;
        let fillColor = '#000';
        let fillOpacity = 0;
        if (isGuessed) {
          fillColor = guessedColor;
          fillOpacity = 0.32;
        } else if (isHovered) {
          fillColor = '#3b82f6';
          fillOpacity = 0.18;
        }
        return (
          <Polygon
            key={cell.idx}
            positions={cell.bounds}
            pathOptions={{
              stroke: false,
              fill: true,
              fillColor,
              fillOpacity,
              interactive: !disabled,
            }}
            eventHandlers={cellHandlers(cell.idx)}
          />
        );
      })}

      {gridLines.map(line => (
        <Polyline
          key={line.key}
          positions={line.positions}
          pathOptions={{ color: '#000', weight: 1.2, dashArray: '4 4', opacity: 0.6, interactive: false }}
        />
      ))}

      {/* Subtle 1..N labels at the center of each cell. */}
      {cells.map(cell => (
        <Marker
          key={`label-${cell.idx}`}
          position={[cell.centerLat, cell.centerLng]}
          interactive={false}
          icon={L.divIcon({
            className: 'region-num-wrapper',
            html: `<span class="region-num">${cell.idx + 1}</span>`,
            iconSize: [40, 18],
            iconAnchor: [20, 9],
          })}
        />
      ))}

      {click && (
        <CircleMarker
          center={[click.lat, click.lng]}
          radius={7}
          pathOptions={{
            color: 'white',
            weight: 2,
            fillColor: isCorrect ? '#22c55e' : '#ef4444',
            fillOpacity: 1,
            interactive: false,
          }}
        />
      )}
      {reveal && target && (
        <>
          <CircleMarker
            center={[target.lat, target.lng]}
            radius={7}
            pathOptions={{ color: 'white', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }}
          />
          {click && (
            <Polyline
              positions={[[click.lat, click.lng], [target.lat, target.lng]]}
              pathOptions={{ color: '#dc2626', weight: 2, dashArray: '5 5', opacity: 0.85, interactive: false }}
            />
          )}
        </>
      )}
    </MapContainer>
  );
}
