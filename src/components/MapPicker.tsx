import { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import { roundConfigs } from '@/lib/projection';

// react-leaflet pulls in `leaflet`, which touches `window`/`document` at
// import time. The parent imports this file via next/dynamic({ ssr: false })
// so it never runs on the server.

interface MapPickerProps {
  round: number;
  target?: { lat: number; lng: number; name: string };
  click?: { lat: number; lng: number } | null;
  isCorrect?: boolean | null;
  reveal?: boolean;
  disabled?: boolean;
  onGuess: (lat: number, lng: number) => void;
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

export default function MapPicker({ round, target, click, isCorrect, reveal, disabled, onGuess }: MapPickerProps) {
  const cfg = roundConfigs[round];

  // Region grid as polylines along constant-longitude (vertical) and
  // constant-latitude (horizontal) lines. Stops short of the poles so the
  // line ends don't bunch up where Mercator stretches.
  const gridLines = useMemo(() => {
    if (!cfg) return [];
    const lines: { positions: [number, number][]; key: string }[] = [];
    for (let i = 1; i < cfg.cols; i++) {
      const lng = -180 + (360 * i) / cfg.cols;
      lines.push({ key: `v${i}`, positions: [[-85, lng], [85, lng]] });
    }
    for (let i = 1; i < cfg.rows; i++) {
      const lat = 90 - (180 * i) / cfg.rows;
      lines.push({ key: `h${i}`, positions: [[lat, -180], [lat, 180]] });
    }
    return lines;
  }, [cfg]);

  return (
    <MapContainer
      center={[20, 0]}
      zoom={1}
      minZoom={1}
      maxZoom={6}
      worldCopyJump
      scrollWheelZoom
      className="w-full h-full"
      style={{ background: '#aad3df' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
      />
      <ClickHandler disabled={!!disabled} onGuess={onGuess} />
      {gridLines.map(line => (
        <Polyline
          key={line.key}
          positions={line.positions}
          pathOptions={{ color: '#000', weight: 1.2, dashArray: '4 4', opacity: 0.65 }}
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
          }}
        />
      )}
      {reveal && target && (
        <>
          <CircleMarker
            center={[target.lat, target.lng]}
            radius={7}
            pathOptions={{ color: 'white', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}
          />
          {click && (
            <Polyline
              positions={[[click.lat, click.lng], [target.lat, target.lng]]}
              pathOptions={{ color: '#dc2626', weight: 2, dashArray: '5 5', opacity: 0.85 }}
            />
          )}
        </>
      )}
    </MapContainer>
  );
}
