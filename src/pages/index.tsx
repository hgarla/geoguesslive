import GeoGuessGame from '@/components/GeoGuessGame'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <GeoGuessGame />
      </div>
    </main>
  )
}