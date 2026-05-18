import React, { useEffect, useRef, useState } from 'react';
import {
  Globe,
  Building2,
  Languages,
  Flag,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  X,
  Map as MapIcon,
} from 'lucide-react';
import type { DailyPuzzle, PuzzleLocation } from '@/types';
import { regionForCoord } from '@/lib/projection';
import { haversineKm, scoreFromDistance } from '@/lib/distance';
import { WORLD_ASPECT } from '@/lib/mapBounds';
import MapPicker from './MapPicker';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const TOTAL_ROUNDS = 8;

type PowerupKey = 'countryName' | 'continent' | 'capital' | 'language' | 'flag';
type PowerupState = Record<PowerupKey, { active: boolean; used: boolean }>;
const initialPowerups: PowerupState = {
  countryName: { active: false, used: false },
  continent: { active: false, used: false },
  capital: { active: false, used: false },
  language: { active: false, used: false },
  flag: { active: false, used: false },
};

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

type RoundResult = { correct: boolean; score: number; km: number };

// Horizontal row of TOTAL_ROUNDS dots that fills with green-check / red-X as
// each round resolves. The currently-active round is highlighted with a
// pulsing blue ring; not-yet-played rounds are numbered ghosts.
function RoundProgress({
  results,
  currentRound,
  totalRounds,
  gameOver,
}: {
  results: RoundResult[];
  currentRound: number;
  totalRounds: number;
  gameOver: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      {Array.from({ length: totalRounds }, (_, i) => {
        const result = results[i];
        if (result) {
          if (result.correct) {
            return (
              <div
                key={i}
                className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm"
                title={`Round ${i + 1}: correct (${result.score} pts)`}
              >
                <Check className="w-4 h-4" strokeWidth={3.5} />
              </div>
            );
          }
          return (
            <div
              key={i}
              className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
              title={`Round ${i + 1}: missed (${result.score} pts)`}
            >
              <X className="w-4 h-4" strokeWidth={3.5} />
            </div>
          );
        }
        const isCurrent = !gameOver && currentRound - 1 === i;
        if (isCurrent) {
          return (
            <div
              key={i}
              className="w-7 h-7 rounded-full border-2 border-blue-500 bg-white text-blue-600 flex items-center justify-center text-xs font-bold animate-pulse"
              title={`Round ${i + 1} (current)`}
            >
              {i + 1}
            </div>
          );
        }
        return (
          <div
            key={i}
            className="w-7 h-7 rounded-full border-2 border-gray-300 bg-gray-50 text-gray-400 flex items-center justify-center text-xs font-bold"
            title={`Round ${i + 1}`}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
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
  const [guessedRegion, setGuessedRegion] = useState<number | null>(null);
  const [isCorrectGuess, setIsCorrectGuess] = useState<boolean | null>(null);
  const [clickedLatLng, setClickedLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [powerups, setPowerups] = useState<PowerupState>(initialPowerups);

  // Per-round outcomes — drives the round-progress dots and game-over stats.
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
      continent: { active: false, used: prev.continent.used },
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

  const handleMapGuess = (lat: number, lng: number) => {
    if (!currentLocation || guessedRegion !== null) return;

    const regionIdx = regionForCoord(round, lat, lng);
    const correctIdx = regionForCoord(round, currentLocation.lat, currentLocation.lng);
    const correct = regionIdx === correctIdx;

    setGuessedRegion(regionIdx);
    setIsCorrectGuess(correct);
    setClickedLatLng({ lat, lng });

    const km = haversineKm(lat, lng, currentLocation.lat, currentLocation.lng);
    setDistanceKm(Math.round(km));
    setRevealLocation(true);

    // Score is distance-based for every guess. Region selection only drives
    // the correct/wrong feedback message; the score scales with how close
    // the click was to the actual landmark.
    const roundScore = scoreFromDistance(km);
    setRoundResults(rr => [...rr, { correct, score: roundScore, km: Math.round(km) }]);

    setTimeout(() => {
      setScore(s => s + roundScore);
      if (round === TOTAL_ROUNDS) {
        setHasWon(true);
        setGameOver(true);
      } else {
        setClickedLatLng(null);
        setDistanceKm(null);
        setRevealLocation(false);
        setGuessedRegion(null);
        setIsCorrectGuess(null);
        setRound(r => r + 1);
      }
    }, 2200);
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
    setClickedLatLng(null);
    setDistanceKm(null);
    setPowerups(initialPowerups);
    setRoundResults([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="min-h-screen w-screen bg-blue-100 fixed inset-0 overflow-auto">
      {!gameStarted ? (
        <div className="flex flex-col items-center justify-center min-h-screen w-full px-4">
          <div className="border-4 sm:border-8 border-black px-6 py-10 sm:px-20 sm:py-16 flex flex-col items-center w-full max-w-lg">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mb-6 sm:mb-8">
              <img src="/images/earth.webp" alt="Globe icon" className="w-full h-full object-contain" />
            </div>
            <h1
              className="text-4xl sm:text-6xl font-bold mb-4 text-center"
              style={{ fontFamily: 'Fredoka One, cursive', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}
            >
              geoguess<span
                className="text-blue-500"
                style={{
                  fontFamily: '"Helvetica Neue", Inter, system-ui, sans-serif',
                  fontStyle: 'italic',
                  fontWeight: 300,
                  textShadow: 'none',
                }}
              >.live</span>
            </h1>
            <p className="text-base sm:text-xl text-gray-700 mb-6 sm:mb-8 text-center">Guess the location of world landmarks</p>
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
          <div className="container mx-auto px-4 pt-4 sm:pt-8 pb-4 sm:pb-6 text-center">
            <h1
              className="text-4xl sm:text-6xl font-bold mb-3 sm:mb-6"
              style={{ fontFamily: 'Fredoka One, cursive', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}
            >
              geoguess<span
                className="text-blue-500"
                style={{
                  fontFamily: '"Helvetica Neue", Inter, system-ui, sans-serif',
                  fontStyle: 'italic',
                  fontWeight: 300,
                  textShadow: 'none',
                }}
              >.live</span>
            </h1>
            <p className="text-base sm:text-xl text-gray-600 mb-4 sm:mb-10">{todayLabel()}</p>
            <div className="flex justify-center gap-8 sm:gap-12">
              <div className="text-center">
                <p className="text-xs sm:text-sm text-gray-600">Round</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600">{round}/{TOTAL_ROUNDS}</p>
              </div>
              <div className="text-center">
                <p className="text-xs sm:text-sm text-gray-600">Score</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">{score}</p>
              </div>
            </div>
          </div>

          <div className="container mx-auto px-4">
            {/* Image + map row — both float directly on the page background.
                Stacks vertically on mobile, side-by-side on lg+. */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              {/* Zoomable image. Scroll to zoom (cursor over image), drag to pan when zoomed. */}
              <div
                ref={imageBoxRef}
                onMouseDown={beginPan}
                onMouseMove={movePan}
                onMouseUp={endPan}
                onMouseLeave={endPan}
                className={`w-full lg:w-[65%] aspect-video bg-gray-200 rounded-lg overflow-hidden relative shadow-lg ${
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

              {/* RIGHT COLUMN: round-progress dots, then map, then hint buttons + info.
                  Map at rest sits in flow with a placeholder reserving its size; the
                  actual map is absolutely-positioned over that placeholder so it can
                  grow on hover (top-0 right-0, hover:w-[280%]) without pushing the
                  hints below it around. */}
              <div className="flex-1 flex flex-col gap-4 sm:gap-6 lg:gap-10">
                <RoundProgress
                  results={roundResults}
                  currentRound={round}
                  totalRounds={TOTAL_ROUNDS}
                  gameOver={gameOver}
                />

                {/* Map. On mobile / tablet it just sits inline at full container
                    width — no hover trickery, since touch devices don't hover and
                    a tiny map is unguessable. On lg+ it keeps the hover-to-enlarge
                    behavior the desktop layout was designed around. */}
                <div className="block lg:hidden">
                  <div
                    className="relative rounded-lg overflow-hidden border-2 border-white shadow-xl bg-blue-50 w-full"
                    style={{ aspectRatio: WORLD_ASPECT }}
                  >
                    <MapPicker
                      round={round}
                      target={currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng, name: currentLocation.name } : undefined}
                      click={clickedLatLng}
                      guessedRegion={guessedRegion}
                      isCorrect={isCorrectGuess}
                      reveal={revealLocation}
                      disabled={gameOver || guessedRegion !== null}
                      onGuess={handleMapGuess}
                    />
                  </div>
                  <p className="text-[10px] text-center mt-1 text-gray-700">
                    Tap a region to guess
                  </p>
                </div>
                <div className="relative hidden lg:block">
                  <div style={{ aspectRatio: WORLD_ASPECT }} aria-hidden className="invisible" />
                  <div className="absolute top-0 right-0 z-10 w-full hover:w-[280%] transition-all duration-300 ease-out hover:z-50">
                    <div
                      className="relative rounded-lg overflow-hidden border-2 border-white shadow-xl bg-blue-50"
                      style={{ aspectRatio: WORLD_ASPECT }}
                    >
                      <MapPicker
                        round={round}
                        target={currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng, name: currentLocation.name } : undefined}
                        click={clickedLatLng}
                        guessedRegion={guessedRegion}
                        isCorrect={isCorrectGuess}
                        reveal={revealLocation}
                        disabled={gameOver || guessedRegion !== null}
                        onGuess={handleMapGuess}
                      />
                    </div>
                    <p className="text-[10px] text-center mt-1 text-gray-700">
                      Hover to enlarge · click to guess
                    </p>
                  </div>
                </div>

                {/* Hints */}
                <div className="flex flex-col gap-3">
                  <div className="text-center">
                    <span className="text-sm font-bold text-gray-700">Hints</span>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        powerups.countryName.used
                          ? 'bg-gray-200 cursor-not-allowed opacity-50'
                          : 'bg-blue-500 hover:bg-blue-600 shadow-md'
                      }`}
                      disabled={powerups.countryName.used}
                      onClick={() => setPowerups(p => ({ ...p, countryName: { active: true, used: true } }))}
                      title="Country name"
                    >
                      <Globe className="w-6 h-6 text-white" strokeWidth={2} />
                    </button>
                    <button
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        powerups.continent.used
                          ? 'bg-gray-200 cursor-not-allowed opacity-50'
                          : 'bg-green-500 hover:bg-green-600 shadow-md'
                      }`}
                      disabled={powerups.continent.used}
                      onClick={() => setPowerups(p => ({ ...p, continent: { active: true, used: true } }))}
                      title="Continent"
                    >
                      <MapIcon className="w-6 h-6 text-white" strokeWidth={2} />
                    </button>
                    <button
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        powerups.capital.used
                          ? 'bg-gray-200 cursor-not-allowed opacity-50'
                          : 'bg-purple-500 hover:bg-purple-600 shadow-md'
                      }`}
                      disabled={powerups.capital.used}
                      onClick={() => setPowerups(p => ({ ...p, capital: { active: true, used: true } }))}
                      title="Capital"
                    >
                      <Building2 className="w-6 h-6 text-white" strokeWidth={2} />
                    </button>
                    <button
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        powerups.language.used
                          ? 'bg-gray-200 cursor-not-allowed opacity-50'
                          : 'bg-orange-500 hover:bg-orange-600 shadow-md'
                      }`}
                      disabled={powerups.language.used}
                      onClick={() => setPowerups(p => ({ ...p, language: { active: true, used: true } }))}
                      title="Language"
                    >
                      <Languages className="w-6 h-6 text-white" strokeWidth={2} />
                    </button>
                    <button
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        powerups.flag.used
                          ? 'bg-gray-200 cursor-not-allowed opacity-50'
                          : 'bg-red-500 hover:bg-red-600 shadow-md'
                      }`}
                      disabled={powerups.flag.used}
                      onClick={() => setPowerups(p => ({ ...p, flag: { active: true, used: true } }))}
                      title="Flag"
                    >
                      <Flag className="w-6 h-6 text-white" strokeWidth={2} />
                    </button>
                  </div>

                  {/* Active hint info, stacked vertically below the buttons. */}
                  <div className="flex flex-col gap-1.5">
                    {powerups.countryName.active && currentLocation && (
                      <div className="px-2.5 py-1.5 bg-blue-50 rounded text-xs flex items-center gap-2">
                        <span className="font-bold text-blue-700">Country:</span>
                        <span>{currentLocation.country}</span>
                      </div>
                    )}
                    {powerups.continent.active && currentLocation && (
                      <div className="px-2.5 py-1.5 bg-green-50 rounded text-xs flex items-center gap-2">
                        <span className="font-bold text-green-700">Continent:</span>
                        <span>{currentLocation.demographics.continent}</span>
                      </div>
                    )}
                    {powerups.capital.active && currentLocation && (
                      <div className="px-2.5 py-1.5 bg-purple-50 rounded text-xs flex items-center gap-2">
                        <span className="font-bold text-purple-700">Capital:</span>
                        <span>{currentLocation.demographics.capital}</span>
                      </div>
                    )}
                    {powerups.language.active && currentLocation && (
                      <div className="px-2.5 py-1.5 bg-orange-50 rounded text-xs flex items-center gap-2">
                        <span className="font-bold text-orange-700">Language:</span>
                        <span>{currentLocation.demographics.language}</span>
                      </div>
                    )}
                    {powerups.flag.active && currentLocation && (
                      <div className="px-2.5 py-1.5 bg-red-50 rounded text-xs flex items-center gap-2">
                        <span className="font-bold text-red-700">Flag:</span>
                        <img
                          src={currentLocation.flag}
                          alt={`Flag of ${currentLocation.country}`}
                          className="h-5 object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Feedback line */}
            {guessedRegion !== null && currentLocation && (
              <p className="text-sm mt-3 w-full lg:w-[65%]">
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
        <div className="fixed inset-0 bg-blue-100 flex items-center justify-center z-50 p-4">
          <div className="border-4 sm:border-8 border-black px-6 py-10 sm:px-20 sm:py-16 flex flex-col items-center w-full max-w-lg bg-blue-100 relative z-50">
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
