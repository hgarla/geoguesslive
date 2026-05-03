import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Users, Building2, Languages, Flag, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { DailyPuzzle, PuzzleLocation } from '@/types';
import { MAP_VIEWBOX, geoToPixel, regionForCoord, roundConfigs } from '@/lib/projection';
import { haversineKm, scoreFromDistance } from '@/lib/distance';
import { CountryBorders } from './CountryBorders';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const TOTAL_ROUNDS = 8;

type PowerupKey = 'countryName' | 'population' | 'capital' | 'language' | 'flag';
type PowerupState = Record<PowerupKey, { active: boolean; used: boolean }>;
const initialPowerups: PowerupState = {
  countryName: { active: false, used: false },
  population: { active: false, used: false },
  capital: { active: false, used: false },
  language: { active: false, used: false },
  flag: { active: false, used: false },
};

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const GeoGuessGame: React.FC = () => {
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);

  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [hasWon, setHasWon] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [revealLocation, setRevealLocation] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [guessedRegion, setGuessedRegion] = useState<number | null>(null);
  const [isCorrectGuess, setIsCorrectGuess] = useState<boolean | null>(null);
  const [clickedPixel, setClickedPixel] = useState<{ x: number; y: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [powerups, setPowerups] = useState<PowerupState>(initialPowerups);

  // Per-round outcomes — drives the game-over stats panel.
  type RoundResult = { correct: boolean; score: number; km: number };
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);

  // Image zoom + pan. Resets on every round change.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);

  // Load today's puzzle from the API.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/daily-puzzle')
      .then(r => r.json())
      .then((p: DailyPuzzle) => {
        if (!cancelled) setPuzzle(p);
      })
      .catch(err => {
        if (!cancelled) setPuzzleError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset active (not used) powerups + zoom/pan whenever the round changes.
  useEffect(() => {
    setPowerups(prev => ({
      countryName: { active: false, used: prev.countryName.used },
      population: { active: false, used: prev.population.used },
      capital: { active: false, used: prev.capital.used },
      language: { active: false, used: prev.language.used },
      flag: { active: false, used: prev.flag.used },
    }));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [round]);

  // Auto-clear pan whenever zoom drops back to 1.
  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // Refs mirror the latest zoom/pan so the wheel + touch handlers (registered
  // once with passive:false) can read them without being re-attached on every
  // state change.
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Cursor-anchored wheel zoom + 2-finger pinch zoom + 1-finger drag pan.
  // For both zoom paths we keep the point under the cursor / pinch midpoint
  // stationary by adjusting pan with: newPan = anchor + (oldPan - anchor) * ratio
  // where `anchor` is the cursor/midpoint offset from the container's center.
  useEffect(() => {
    const el = imageBoxRef.current;
    if (!el) return;

    const anchorOf = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const oldZoom = zoomRef.current;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (newZoom === oldZoom) return;
      const { x: ax, y: ay } = anchorOf(e.clientX, e.clientY);
      const ratio = newZoom / oldZoom;
      setZoom(newZoom);
      setPan({
        x: ax + (panRef.current.x - ax) * ratio,
        y: ay + (panRef.current.y - ay) * ratio,
      });
    };

    type Pinch = { baseZoom: number; basePan: { x: number; y: number }; startDist: number; ax: number; ay: number };
    type TouchPan = { sx: number; sy: number; basePan: { x: number; y: number } };
    let pinch: Pinch | null = null;
    let touchPan: TouchPan | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const a = anchorOf((t1.clientX + t2.clientX) / 2, (t1.clientY + t2.clientY) / 2);
        pinch = {
          baseZoom: zoomRef.current,
          basePan: { ...panRef.current },
          startDist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
          ax: a.x,
          ay: a.y,
        };
        touchPan = null;
      } else if (e.touches.length === 1 && zoomRef.current > 1) {
        e.preventDefault();
        touchPan = {
          sx: e.touches[0].clientX,
          sy: e.touches[0].clientY,
          basePan: { ...panRef.current },
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const newZoom = clamp(pinch.baseZoom * (dist / pinch.startDist), MIN_ZOOM, MAX_ZOOM);
        const ratio = newZoom / pinch.baseZoom;
        setZoom(newZoom);
        setPan({
          x: pinch.ax + (pinch.basePan.x - pinch.ax) * ratio,
          y: pinch.ay + (pinch.basePan.y - pinch.ay) * ratio,
        });
      } else if (e.touches.length === 1 && touchPan) {
        e.preventDefault();
        setPan({
          x: touchPan.basePan.x + (e.touches[0].clientX - touchPan.sx),
          y: touchPan.basePan.y + (e.touches[0].clientY - touchPan.sy),
        });
      }
    };

    const onTouchEnd = () => {
      pinch = null;
      touchPan = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // Re-run whenever the image box mounts (i.e. whenever the player enters
    // a game). Without `gameStarted` in deps the effect runs once at app
    // mount when imageBoxRef.current is still null, and the listener never
    // gets attached.
  }, [gameStarted]);

  const beginPan = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };
  const movePan = (e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.mx),
      y: panStart.current.py + (e.clientY - panStart.current.my),
    });
  };
  const endPan = () => {
    setIsPanning(false);
    panStart.current = null;
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const currentLocation: PuzzleLocation | undefined = puzzle?.locations[round - 1];

  // Lines splitting the map into the round's grid.
  const divisionLines = useMemo(() => {
    const cfg = roundConfigs[round];
    if (!cfg) return null;
    const { width, height } = MAP_VIEWBOX;
    const lines: React.ReactElement[] = [];
    for (let i = 1; i < cfg.cols; i++) {
      const x = (i * width) / cfg.cols;
      lines.push(
        <line key={`v${i}`} x1={x} y1={0} x2={x} y2={height} stroke="#000000" strokeWidth={1.2} strokeDasharray="3 3" />,
      );
    }
    for (let i = 1; i < cfg.rows; i++) {
      const y = (i * height) / cfg.rows;
      lines.push(
        <line key={`h${i}`} x1={0} y1={y} x2={width} y2={y} stroke="#000000" strokeWidth={1.2} strokeDasharray="3 3" />,
      );
    }
    return lines;
  }, [round]);

  const correctRegion = useMemo(() => {
    if (!currentLocation) return -1;
    return regionForCoord(round, currentLocation.lat, currentLocation.lng);
  }, [round, currentLocation]);

  const handleGuess = (regionIdx: number, e: React.MouseEvent<SVGRectElement>) => {
    if (!currentLocation || guessedRegion !== null) return;

    const correct = regionIdx === correctRegion;
    setGuessedRegion(regionIdx);
    setIsCorrectGuess(correct);

    // Always capture click + reveal actual location, even on wrong guesses,
    // so the player learns where it was. Wrong guesses score 0; correct
    // guesses scale 0..100 by distance from the click to the real coords.
    const svg = e.currentTarget.ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * MAP_VIEWBOX.width;
    const vbY = ((e.clientY - rect.top) / rect.height) * MAP_VIEWBOX.height;
    setClickedPixel({ x: vbX, y: vbY });

    const clickedLng = (vbX / MAP_VIEWBOX.width) * 360 - 180;
    const clickedLat = 90 - (vbY / MAP_VIEWBOX.height) * 180;
    const km = haversineKm(clickedLat, clickedLng, currentLocation.lat, currentLocation.lng);
    setDistanceKm(Math.round(km));
    setRevealLocation(true);

    // Score is distance-based for every guess. Region selection only affects
    // the correct/wrong feedback message, not the score.
    const roundScore = scoreFromDistance(km);

    setRoundResults(rr => [...rr, { correct, score: roundScore, km: Math.round(km) }]);

    setTimeout(() => {
      setScore(s => s + roundScore);
      if (round === TOTAL_ROUNDS) {
        setHasWon(true);
        setGameOver(true);
      } else {
        setClickedPixel(null);
        setDistanceKm(null);
        setRevealLocation(false);
        setGuessedRegion(null);
        setIsCorrectGuess(null);
        setRound(r => r + 1);
      }
    }, 2200);
  };

  const renderRegions = () => {
    const cfg = roundConfigs[round];
    if (!cfg) return null;
    const { width, height } = MAP_VIEWBOX;
    const cellW = width / cfg.cols;
    const cellH = height / cfg.rows;
    const cells: React.ReactElement[] = [];
    for (let row = 0; row < cfg.rows; row++) {
      for (let col = 0; col < cfg.cols; col++) {
        const idx = row * cfg.cols + col;
        let fill = 'transparent';
        if (idx === guessedRegion) {
          fill = isCorrectGuess ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        } else if (idx === hoveredRegion && guessedRegion === null) {
          fill = 'rgba(59, 130, 246, 0.2)';
        }
        cells.push(
          <g key={idx}>
            <rect
              x={col * cellW}
              y={row * cellH}
              width={cellW}
              height={cellH}
              fill={fill}
              className="cursor-pointer transition-colors duration-200"
              onMouseEnter={() => setHoveredRegion(idx)}
              onMouseLeave={() => setHoveredRegion(null)}
              onClick={e => handleGuess(idx, e)}
            />
            {idx === guessedRegion && (
              <g transform={`translate(${col * cellW + cellW / 2}, ${row * cellH + cellH / 2})`}>
                {isCorrectGuess ? (
                  <path d="M-30 0 L-10 20 L30 -20" stroke="rgb(34,197,94)" strokeWidth={8} fill="none" strokeLinecap="round" />
                ) : (
                  <g stroke="rgb(239,68,68)" strokeWidth={8}>
                    <line x1={-20} y1={-20} x2={20} y2={20} strokeLinecap="round" />
                    <line x1={-20} y1={20} x2={20} y2={-20} strokeLinecap="round" />
                  </g>
                )}
              </g>
            )}
          </g>,
        );
      }
    }
    return cells;
  };

  const resetGame = () => {
    setGameStarted(false);
    setGameOver(false);
    setHasWon(false);
    setRound(1);
    setScore(0);
    setRevealLocation(false);
    setGuessedRegion(null);
    setIsCorrectGuess(null);
    setHoveredRegion(null);
    setClickedPixel(null);
    setDistanceKm(null);
    setPowerups(initialPowerups);
    setRoundResults([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="min-h-screen w-screen bg-blue-100 fixed inset-0 overflow-auto">
      {!gameStarted ? (
        <div className="flex flex-col items-center justify-center min-h-screen w-full">
          <div className="border-8 border-black px-20 py-16 flex flex-col items-center max-w-lg">
            <div className="w-24 h-24 mb-8">
              <img src="/images/earth.webp" alt="Globe icon" className="w-full h-full object-contain" />
            </div>
            <h1
              className="text-6xl font-bold mb-4 text-center"
              style={{ fontFamily: 'Fredoka One, cursive', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}
            >
              GeoGuess
            </h1>
            <p className="text-xl text-gray-700 mb-8 text-center">Guess the location of world landmarks</p>
            {puzzleError && <p className="text-red-600 mb-4 text-sm">Error loading puzzle: {puzzleError}</p>}
            <button
              className="bg-black text-white px-12 py-3 rounded-full text-xl font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
              onClick={() => setGameStarted(true)}
              disabled={!puzzle}
            >
              {puzzle ? 'Play' : 'Loading…'}
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-blue-100">
          <div className="container mx-auto px-4 pt-8 pb-6 text-center">
            <h1
              className="text-6xl font-bold mb-6"
              style={{ fontFamily: 'Fredoka One, cursive', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}
            >
              GeoGuess
            </h1>
            <p className="text-xl text-gray-600 mb-10">{todayLabel()}</p>
            <div className="flex justify-center gap-12">
              <div className="text-center">
                <p className="text-sm text-gray-600">Round</p>
                <p className="text-2xl font-bold text-blue-600">{round}/{TOTAL_ROUNDS}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Score</p>
                <p className="text-2xl font-bold text-green-600">{score}</p>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4">
            {/* Image + map row — both float directly on the page background. */}
            <div className="flex gap-4 items-stretch">
              {/* Zoomable image. Scroll to zoom (cursor over image), drag to pan when zoomed. */}
              <div
                ref={imageBoxRef}
                onMouseDown={beginPan}
                onMouseMove={movePan}
                onMouseUp={endPan}
                onMouseLeave={endPan}
                className={`w-[65%] aspect-video bg-gray-200 rounded-lg overflow-hidden relative shadow-lg ${
                  zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                }`}
              >
                {currentLocation?.image ? (
                  <img
                    src={currentLocation.image}
                    alt={`Location ${round}`}
                    draggable={false}
                    className="w-full h-full object-cover select-none"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                      transition: isPanning ? 'none' : 'transform 0.12s ease-out',
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    {currentLocation
                      ? 'Image not yet built. Run `npm run build-seed-images`.'
                      : 'Loading location…'}
                  </div>
                )}

                {/* Zoom controls — overlay top-right of image. Stays fixed regardless of pan/zoom. */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 bg-black/55 rounded-md p-1 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => setZoom(z => clamp(z * 1.4, MIN_ZOOM, MAX_ZOOM))}
                    className="w-7 h-7 flex items-center justify-center rounded text-white hover:bg-white/20 disabled:opacity-40"
                    disabled={zoom >= MAX_ZOOM}
                    title="Zoom in (or scroll up)"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(z => clamp(z / 1.4, MIN_ZOOM, MAX_ZOOM))}
                    className="w-7 h-7 flex items-center justify-center rounded text-white hover:bg-white/20 disabled:opacity-40"
                    disabled={zoom <= MIN_ZOOM}
                    title="Zoom out (or scroll down)"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetView}
                    className="w-7 h-7 flex items-center justify-center rounded text-white hover:bg-white/20 disabled:opacity-40"
                    disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                    title="Reset view"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {currentLocation?.attribution && (
                  <a
                    href={currentLocation.attribution.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded hover:bg-black/80"
                    title={`Photo by ${currentLocation.attribution.artist} (${currentLocation.attribution.license})`}
                  >
                    © {currentLocation.attribution.artist.slice(0, 30)} / {currentLocation.attribution.license}
                  </a>
                )}
              </div>

              {/* Right column reserves space; map sits vertically centered.
                  transform-origin: right (mid-right edge) so hover-scale grows
                  up + down + left, overlaying the image without pushing layout. */}
              <div className="flex-1 relative">
                <div className="absolute top-1/2 right-0 -translate-y-1/2 z-10 w-full origin-right transition-transform duration-300 ease-out hover:scale-[2.4] hover:z-50 cursor-crosshair">
                  <div
                    className="relative rounded-lg overflow-hidden border-2 border-white shadow-xl"
                    style={{ backgroundColor: '#cfe7fa', aspectRatio: '2 / 1' }}
                  >
                    {/* The map is now pure SVG: ocean-colored background div + filled
                        country paths + region grid + pins. No bitmap, so no graticule
                        or equator line baked in. */}
                    <svg
                      viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
                      preserveAspectRatio="none"
                      className="absolute top-0 left-0 w-full h-full"
                    >
                      <CountryBorders fill="rgb(243,244,246)" stroke="rgb(75,85,99)" strokeWidth={0.4} />
                      {!gameOver && (
                        <>
                          {divisionLines}
                          {renderRegions()}
                        </>
                      )}
                      {revealLocation && currentLocation && (() => {
                        const p = geoToPixel(currentLocation.lat, currentLocation.lng);
                        const name = currentLocation.name;
                        // Pill-shaped white background behind the label keeps it readable
                        // against the map's terrain colors.
                        const padX = 4;
                        const charW = 6;
                        const labelW = name.length * charW + padX * 2;
                        const labelH = 14;
                        return (
                          <g transform={`translate(${p.x}, ${p.y})`}>
                            <circle r={5} fill="rgb(220,38,38)" stroke="white" strokeWidth={1.5} />
                            <g transform={`translate(${10}, ${-labelH / 2})`}>
                              <rect width={labelW} height={labelH} rx={3} fill="white" stroke="rgb(220,38,38)" strokeWidth={0.8} />
                              <text x={padX} y={labelH - 4} fontSize={10} fill="rgb(185,28,28)" fontWeight="700">
                                {name}
                              </text>
                            </g>
                          </g>
                        );
                      })()}
                      {clickedPixel && (
                        <circle cx={clickedPixel.x} cy={clickedPixel.y} r={3} fill="black" stroke="white" strokeWidth={1} />
                      )}
                    </svg>
                  </div>
                  <p className="text-[10px] text-center mt-1 text-gray-700">
                    Hover to enlarge · click to guess
                  </p>
                </div>
              </div>
            </div>

            {/* Hints row below the image/map row */}
            <div className="mt-4 flex items-start gap-4">
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-gray-700 mb-1">Hints</span>
                <div className="flex gap-2">
                  <button
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      powerups.countryName.used
                        ? 'bg-gray-200 cursor-not-allowed opacity-50'
                        : 'bg-blue-500 hover:bg-blue-600 shadow-md'
                    }`}
                    disabled={powerups.countryName.used}
                    onClick={() => setPowerups(p => ({ ...p, countryName: { active: true, used: true } }))}
                    title="Country name"
                  >
                    <Globe className="w-7 h-7 text-white" strokeWidth={2} />
                  </button>
                  <button
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      powerups.population.used
                        ? 'bg-gray-200 cursor-not-allowed opacity-50'
                        : 'bg-green-500 hover:bg-green-600 shadow-md'
                    }`}
                    disabled={powerups.population.used}
                    onClick={() => setPowerups(p => ({ ...p, population: { active: true, used: true } }))}
                    title="Population"
                  >
                    <Users className="w-7 h-7 text-white" strokeWidth={2} />
                  </button>
                  <button
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      powerups.capital.used
                        ? 'bg-gray-200 cursor-not-allowed opacity-50'
                        : 'bg-purple-500 hover:bg-purple-600 shadow-md'
                    }`}
                    disabled={powerups.capital.used}
                    onClick={() => setPowerups(p => ({ ...p, capital: { active: true, used: true } }))}
                    title="Capital"
                  >
                    <Building2 className="w-7 h-7 text-white" strokeWidth={2} />
                  </button>
                  <button
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      powerups.language.used
                        ? 'bg-gray-200 cursor-not-allowed opacity-50'
                        : 'bg-orange-500 hover:bg-orange-600 shadow-md'
                    }`}
                    disabled={powerups.language.used}
                    onClick={() => setPowerups(p => ({ ...p, language: { active: true, used: true } }))}
                    title="Language"
                  >
                    <Languages className="w-7 h-7 text-white" strokeWidth={2} />
                  </button>
                  <button
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      powerups.flag.used
                        ? 'bg-gray-200 cursor-not-allowed opacity-50'
                        : 'bg-red-500 hover:bg-red-600 shadow-md'
                    }`}
                    disabled={powerups.flag.used}
                    onClick={() => setPowerups(p => ({ ...p, flag: { active: true, used: true } }))}
                    title="Flag"
                  >
                    <Flag className="w-7 h-7 text-white" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-5 gap-2">
                {powerups.countryName.active && currentLocation && (
                  <div className="p-2 bg-blue-50 rounded-lg text-xs">
                    <h3 className="font-bold text-blue-700">Country</h3>
                    <p>{currentLocation.country}</p>
                  </div>
                )}
                {powerups.population.active && currentLocation && (
                  <div className="p-2 bg-green-50 rounded-lg text-xs">
                    <h3 className="font-bold text-green-700">Population</h3>
                    <p>{currentLocation.demographics.population}</p>
                  </div>
                )}
                {powerups.capital.active && currentLocation && (
                  <div className="p-2 bg-purple-50 rounded-lg text-xs">
                    <h3 className="font-bold text-purple-700">Capital</h3>
                    <p>{currentLocation.demographics.capital}</p>
                  </div>
                )}
                {powerups.language.active && currentLocation && (
                  <div className="p-2 bg-orange-50 rounded-lg text-xs">
                    <h3 className="font-bold text-orange-700">Language</h3>
                    <p>{currentLocation.demographics.language}</p>
                  </div>
                )}
                {powerups.flag.active && currentLocation && (
                  <div className="p-2 bg-red-50 rounded-lg text-xs">
                    <h3 className="font-bold text-red-700">Flag</h3>
                    <div className="w-full h-12 flex items-center justify-center">
                      <img
                        src={currentLocation.flag}
                        alt={`Flag of ${currentLocation.country}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Feedback line */}
            {guessedRegion !== null && currentLocation && (
              <p className="text-sm mt-3 w-[65%]">
                {isCorrectGuess ? (
                  <span className="text-green-600 font-semibold">Correct region! </span>
                ) : (
                  <span className="text-red-600 font-semibold">Wrong region. </span>
                )}
                <span className="text-gray-700">
                  {distanceKm} km from {currentLocation.name}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 bg-blue-100 flex items-center justify-center z-50">
          <div className="border-8 border-black px-20 py-16 flex flex-col items-center max-w-lg bg-blue-100 relative z-50">
            <button
              className="absolute top-4 right-4 text-2xl font-bold hover:text-gray-700 z-50"
              onClick={resetGame}
            >
              ✕
            </button>
            <div className="w-24 h-24 mb-8">
              <img src="/images/earth.webp" alt="Globe icon" className="w-full h-full object-contain" />
            </div>
            <h2
              className="text-4xl font-bold mb-4 text-center"
              style={{ fontFamily: 'Fredoka One, cursive', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}
            >
              {hasWon ? 'Congratulations!' : 'Game Over'}
            </h2>
            <div className="text-gray-700 mb-8 text-center w-full">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-base">
                <div className="text-right text-gray-600">Final score</div>
                <div className="text-left font-bold text-green-600">{score} / {TOTAL_ROUNDS * 100}</div>

                <div className="text-right text-gray-600">Rounds correct</div>
                <div className="text-left font-bold">
                  {roundResults.filter(r => r.correct).length} / {TOTAL_ROUNDS}
                </div>

                <div className="text-right text-gray-600">Best round</div>
                <div className="text-left font-bold">
                  {roundResults.length > 0 ? Math.max(...roundResults.map(r => r.score)) : 0} pts
                </div>

                <div className="text-right text-gray-600">Avg distance</div>
                <div className="text-left font-bold">
                  {roundResults.length > 0
                    ? Math.round(roundResults.reduce((s, r) => s + r.km, 0) / roundResults.length).toLocaleString()
                    : 0} km
                </div>
              </div>
            </div>
            <button
              className="bg-black text-white px-12 py-3 rounded-full text-xl font-semibold hover:bg-gray-800 transition-colors z-50"
              onClick={resetGame}
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeoGuessGame;
