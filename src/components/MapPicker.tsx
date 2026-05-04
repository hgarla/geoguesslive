import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet';
import L, { type LeafletMouseEvent } from 'leaflet';
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
  // Wrapper hover state from the parent. When this flips, we schedule
  // an explicit fit-to-bounds after the CSS transition has settled —
  // this is the safety net for the "rest state shows only a fragment
  // after hover" bug.
  hoverState?: boolean;
  onGuess: (lat: number, lng: number) => void;
}

// Single source of truth for resize handling. ResizeObserver fires whenever
// the leaflet container's box changes — during CSS transitions, on window
// resize, etc. Each fire: invalidateSize -> read new size -> setMinZoom +
// fitBounds. Plus a debounced final fit ~400ms after the last observation
// to guarantee a clean settle.
function MapAutoFit({ hoverState }: { hoverState?: boolean }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let lastTimer: ReturnType<typeof setTimeout> | null = null;

    const performFit = () => {
      map.invalidateSize({ animate: false });
      const z = map.getBoundsZoom(WORLD_BOUNDS, false);
      map.setMinZoom(z);
      map.fitBounds(WORLD_BOUNDS, { padding: [0, 0], animate: false });
    };

    const scheduleFinal = () => {
      if (lastTimer) clearTimeout(lastTimer);
      lastTimer = setTimeout(performFit, 400);
    };

    const obs = new ResizeObserver(() => {
      performFit();
      scheduleFinal();
    });
    obs.observe(el);
    performFit();

    return () => {
      obs.disconnect();
      if (lastTimer) clearTimeout(lastTimer);
    };
  }, [map]);

  // Safety net: when the parent's hover state flips, force a fit shortly
  // after the CSS transition would settle. Catches the case where
  // ResizeObserver missed the final intermediate frames.
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize({ animate: false });
      const z = map.getBoundsZoom(WORLD_BOUNDS, false);
      map.setMinZoom(z);
      map.fitBounds(WORLD_BOUNDS, { padding: [0, 0], animate: false });
    }, 350);
    return () => clearTimeout(t);
  }, [map, hoverState]);

  return null;
}

interface Cell {
  idx: number;
  bounds: [number, number][]; // 4 corners as [lat, lng]
  centerLat: number;
  centerLng: number;
}

export default function MapPicker({ round, target, click, guessedRegion, isCorrect, reveal, disabled, hoverState, onGuess }: MapPickerProps) {
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

  // Cells span the playable bounds exactly so they tile the visible world.
  // (Visual cell heights vary slightly between rows due to Mercator stretch
  // near the lat bounds — accepted tradeoff for crisp tile rendering.)
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
      bounds={WORLD_BOUNDS}
      boundsOptions={{ padding: [0, 0], animate: false }}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1.0}
      maxZoom={6}
      zoomSnap={0.1}
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
      <MapAutoFit hoverState={hoverState} />

      {/* Cell polygons sit above tiles, below the grid lines. Cells handle
          their own click; map.click is intentionally NOT bound to avoid
          double-fire that was making rounds skip. */}
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
            iconSize: [80, 48],
            iconAnchor: [40, 24],
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
