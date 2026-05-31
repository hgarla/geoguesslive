import GeoGuessGame from '@/components/GeoGuessGame'

// The game owns its own full-viewport blue-100 background. Anything we
// wrap around it here (a gray `<main>`, a `container mx-auto` width cap,
// vertical py-* padding) leaves a visible non-blue frame on wide or
// short viewports — so we don't.
export default function Home() {
  return <GeoGuessGame />
}