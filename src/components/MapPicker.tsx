import React, { useMemo, useState } from 'react';
import {
  MAP_VIEWBOX,
  MAP_CROP_TOP,
  MAP_CROP_HEIGHT,
  geoToPixel,
  pixelToGeo,
  roundConfigs,
} from '@/lib/projection';

// A simple static map. World image as the background, an SVG overlay for
// the region grid, hover/guess feedback, and the reveal pin. No tiles, no
// pan, no zoom — exactly what a casual daily game needs.

const MAP_IMAGE = '/images/world-map.png?v=4';

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

export default function MapPicker({
  round,
  target,
  click,
  guessedRegion,
  isCorrect,
  reveal,
  disabled,
  onGuess,
}: MapPickerProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const cfg = roundConfigs[round];

  // Cells span the cropped playable strip. Each cell is sized in
  // viewBox units; preserveAspectRatio="none" stretches the SVG to fit
  // the (slightly wider-than-2:1) container, keeping cells visually equal.
  const cells = useMemo(() => {
    if (!cfg) return [];
    const cellW = MAP_VIEWBOX.width / cfg.cols;
    const cellH = MAP_CROP_HEIGHT / cfg.rows;
    const list: { idx: number; x: number; y: number; w: number; h: number; cx: number; cy: number }[] = [];
    for (let row = 0; row < cfg.rows; row++) {
      for (let col = 0; col < cfg.cols; col++) {
        const x = col * cellW;
        const y = MAP_CROP_TOP + row * cellH;
        list.push({
          idx: row * cfg.cols + col,
          x,
          y,
          w: cellW,
          h: cellH,
          cx: x + cellW / 2,
          cy: y + cellH / 2,
        });
      }
    }
    return list;
  }, [cfg]);

  const gridLines = useMemo(() => {
    if (!cfg) return [] as React.ReactElement[];
    const out: React.ReactElement[] = [];
    for (let i = 1; i < cfg.cols; i++) {
      const x = (i * MAP_VIEWBOX.width) / cfg.cols;
      out.push(
        <line
          key={`v${i}`}
          x1={x}
          y1={MAP_CROP_TOP}
          x2={x}
          y2={MAP_CROP_TOP + MAP_CROP_HEIGHT}
          stroke="#000"
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={0.7}
        />,
      );
    }
    for (let i = 1; i < cfg.rows; i++) {
      const y = MAP_CROP_TOP + (i * MAP_CROP_HEIGHT) / cfg.rows;
      out.push(
        <line
          key={`h${i}`}
          x1={0}
          y1={y}
          x2={MAP_VIEWBOX.width}
          y2={y}
          stroke="#000"
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={0.7}
        />,
      );
    }
    return out;
  }, [cfg]);

  // Convert a click event on a region rect into a (lat, lng) pair so the
  // parent's scoring can run on the precise click point, not the cell center.
  const handleClick = (e: React.MouseEvent<SVGRectElement>) => {
    if (disabled) return;
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * MAP_VIEWBOX.width;
    // The SVG's actual visible y range is [MAP_CROP_TOP, MAP_CROP_TOP+MAP_CROP_HEIGHT]
    // mapped onto the container's full height — so we map screen y back into the
    // visible y range, then add MAP_CROP_TOP to land in the full-image coordinate space.
    const vbY = MAP_CROP_TOP + ((e.clientY - rect.top) / rect.height) * MAP_CROP_HEIGHT;
    const { lat, lng } = pixelToGeo(vbX, vbY);
    onGuess(lat, lng);
  };

  // Pin layout for the reveal: a circle "head" sitting above the precise
  // point, connected by a short tail line. The bottom tip of the line is
  // the actual lat/lng location.
  const pinHeadR = 9;
  const pinTailLen = 18;

  return (
    <>
      <svg
        viewBox={`0 ${MAP_CROP_TOP} ${MAP_VIEWBOX.width} ${MAP_CROP_HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        {/* Background world map. Drawn as an SVG <image> so the viewBox
            crops the polar caps automatically. */}
        <image
          href={MAP_IMAGE}
          x={0}
          y={0}
          width={MAP_VIEWBOX.width}
          height={MAP_VIEWBOX.height}
          preserveAspectRatio="none"
        />

        {/* Region cells — interactive. */}
        {cells.map(cell => {
          const isGuessed = guessedRegion === cell.idx;
          const isHovered = !disabled && hoveredIdx === cell.idx;
          let fill = 'transparent';
          if (isGuessed) {
            fill = isCorrect ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)';
          } else if (isHovered) {
            fill = 'rgba(59,130,246,0.20)';
          }
          return (
            <rect
              key={cell.idx}
              x={cell.x}
              y={cell.y}
              width={cell.w}
              height={cell.h}
              fill={fill}
              className={disabled ? '' : 'cursor-pointer'}
              onMouseEnter={() => !disabled && setHoveredIdx(cell.idx)}
              onMouseLeave={() => setHoveredIdx(prev => (prev === cell.idx ? null : prev))}
              onClick={handleClick}
            />
          );
        })}

        {/* Dashed grid lines on top of the rects so hover tints don't obscure them. */}
        {gridLines}

        {/* Subtle 1..N region number labels at each cell's center. Block-letter
            font, very low alpha — present but not distracting. */}
        {cells.map(cell => {
          const fontSize = Math.min(cell.w, cell.h) * 0.32;
          return (
            <text
              key={`n${cell.idx}`}
              x={cell.cx}
              y={cell.cy}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(17,24,39,0.13)"
              fontSize={fontSize}
              fontWeight={900}
              fontFamily="'Arial Black', system-ui, sans-serif"
              pointerEvents="none"
            >
              {cell.idx + 1}
            </text>
          );
        })}

        {/* Player's guess marker (only shown during the reveal window). */}
        {click && (() => {
          const p = geoToPixel(click.lat, click.lng);
          return (
            <circle
              cx={p.x}
              cy={p.y}
              r={5}
              fill={isCorrect ? '#22c55e' : '#ef4444'}
              stroke="white"
              strokeWidth={1.8}
              pointerEvents="none"
            />
          );
        })()}

        {/* Connecting line from guess to target on reveal. */}
        {reveal && target && click && (() => {
          const c = geoToPixel(click.lat, click.lng);
          const t = geoToPixel(target.lat, target.lng);
          return (
            <line
              x1={c.x}
              y1={c.y}
              x2={t.x}
              y2={t.y}
              stroke="rgb(220,38,38)"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              opacity={0.75}
              pointerEvents="none"
            />
          );
        })()}

        {/* Target reveal pin: red circle "head" perched above the precise
            point, joined by a short tail line. The tail's bottom tip
            (and the small white dot) mark the exact lat/lng. */}
        {reveal && target && (() => {
          const p = geoToPixel(target.lat, target.lng);
          return (
            <g transform={`translate(${p.x},${p.y})`} pointerEvents="none">
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-pinTailLen}
                stroke="rgb(220,38,38)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <circle
                cx={0}
                cy={-pinTailLen}
                r={pinHeadR}
                fill="rgb(220,38,38)"
                stroke="white"
                strokeWidth={2}
              />
              <circle
                cx={0}
                cy={0}
                r={1.6}
                fill="white"
                stroke="rgb(220,38,38)"
                strokeWidth={1}
              />
            </g>
          );
        })()}
      </svg>
    </>
  );
}
