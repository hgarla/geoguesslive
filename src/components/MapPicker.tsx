import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsLiteral, LeafletMouseEvent } from 'leaflet';
import { roundConfigs } from '@/lib/projection';

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

// Locked play area. Cuts Antarctica (south of -60) and the north tip of
// Greenland / Svalbard (above 78) so Mercator distortion can't make the
// region grid look skewed at the poles.
const SOUTH_LIMIT = -60;
const NORTH_LIMIT = 78;
const WORLD_BOUNDS: LatLngBoundsLiteral = [
  [SOUTH_LIMIT, -180],
  [NORTH_LIMIT, 180],
];

// react-leaflet's MapContainer occasionally misses size changes when the
// outer wrapper transitions (e.g. our hover-expand). This child observes
// the map container and forces a Leaflet re-layout + tile fetch on every
// dimension change.
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

// On mount and on every map resize, compute the zoom that exactly fits the
// world bounds in the current container, snap minZoom to that value, and
// re-fit. Result: the player can zoom in but never zoom OUT past the
// playable world — no white margins, no Mercator polar stretch in view.
function FitAndLockBounds({ bounds }: { bounds: LatLngBoundsLiteral }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const z = map.getBoundsZoom(bounds, false);
      map.setMinZoom(z);
      map.fitBounds(bounds, { padding: [0, 0], animate: false });
    };
    update();
    map.on('resize', update);
    return () => { map.off('resize', update); };
  }, [map, bounds]);
  return null;
}

function ClickHandler({ disabled, onGuess }: { disabled: boolean; onGuess: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onGuess(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface Cell {
  idx: number;
  bounds: [number, number][]; // 4 corners as [lat, lng]
}

export default function MapPicker({ round, target, click, guessedRegion, isCorrect, reveal, disabled, onGuess }: MapPickerProps) {
  const cfg = roundConfigs[round];
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const gridLines = useMemo(() => {
    if (!cfg) return [];
    const lines: { positions: [number, number][]; key: string }[] = [];
    for (let i = 1; i < cfg.cols; i++) {
      const lng = -180 + (360 * i) / cfg.cols;
      lines.push({ key: `v${i}`, positions: [[SOUTH_LIMIT, lng], [NORTH_LIMIT, lng]] });
    }
    for (let i = 1; i < cfg.rows; i++) {
      const lat = 90 - (180 * i) / cfg.rows;
      // Skip lines outside the visible play area.
      if (lat < SOUTH_LIMIT || lat > NORTH_LIMIT) continue;
      lines.push({ key: `h${i}`, positions: [[lat, -180], [lat, 180]] });
    }
    return lines;
  }, [cfg]);

  const cells = useMemo<Cell[]>(() => {
    if (!cfg) return [];
    const out: Cell[] = [];
    const lngStep = 360 / cfg.cols;
    const latStep = 180 / cfg.rows;
    for (let row = 0; row < cfg.rows; row++) {
      for (let col = 0; col < cfg.cols; col++) {
        const idx = row * cfg.cols + col;
        const west = -180 + col * lngStep;
        const east = west + lngStep;
        const north = 90 - row * latStep;
        const south = north - latStep;
        // Clamp polygon corners to the playable bounds so cells don't extend
        // visually past the locked viewport.
        const n = Math.min(NORTH_LIMIT, north);
        const s = Math.max(SOUTH_LIMIT, south);
        if (n <= s) continue; // cell is entirely outside the play area
        out.push({
          idx,
          bounds: [
            [n, west],
            [n, east],
            [s, east],
            [s, west],
          ],
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
      onGuess(e.latlng.lat, e.latlng.lng);
    },
  });

  // For visual feedback we tint the cell that contains the actual click
  // (derived via regionForCoord) green when correct, red when wrong.
  const guessedColor = isCorrect ? '#22c55e' : '#ef4444';

  return (
    <MapContainer
      bounds={WORLD_BOUNDS}
      boundsOptions={{ padding: [0, 0], animate: false }}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1.0}
      maxZoom={6}
      zoomSnap={0.25}
      scrollWheelZoom
      worldCopyJump={false}
      className="w-full h-full"
      style={{ background: '#aad3df' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        noWrap
      />
      <ResizeWatcher />
      <FitAndLockBounds bounds={WORLD_BOUNDS} />
      <ClickHandler disabled={!!disabled} onGuess={onGuess} />

      {/* Cell polygons sit above the tile layer but below the grid lines so
          their hover tint doesn't obscure the borders. */}
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
          pathOptions={{ color: '#000', weight: 1.2, dashArray: '4 4', opacity: 0.7, interactive: false }}
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
