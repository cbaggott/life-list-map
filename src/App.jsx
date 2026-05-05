import { useState, useEffect, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

export default function App() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const [birds, setBirds] = useState([])
  const [selectedYear, setSelectedYear] = useState(2026)
  const [minYear, setMinYear] = useState(2000)
  const [maxYear, setMaxYear] = useState(2026)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedBirds, setSelectedBirds] = useState([])
  const [birdPhotos, setBirdPhotos] = useState({})
  const [visibleCount, setVisibleCount] = useState(0)

  // Load birds.json
  useEffect(() => {
    fetch("/birds.json")
      .then(r => r.json())
      .then(data => {
        setBirds(data)
        const years = data.map(b => b.year).filter(Boolean)
        const min = Math.min(...years)
        const max = Math.max(...years)
        setMinYear(min)
        setMaxYear(max)
        setSelectedYear(max)
      })
  }, [])

  // Initialize map
  useEffect(() => {
    if (mapInstanceRef.current) return
    mapInstanceRef.current = L.map(mapRef.current).setView([20, 0], 2)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(mapInstanceRef.current)
  }, [])

  // Update markers when year or birds change
  useEffect(() => {
    if (!mapInstanceRef.current || birds.length === 0) return

    markersRef.current.forEach(m => mapInstanceRef.current.removeLayer(m))
    markersRef.current = []

    const visible = birds.filter(b => b.year <= selectedYear && b.lat && b.lng)
    setVisibleCount(visible.length)

    const byLocation = {}
    for (const bird of visible) {
      if (!byLocation[bird.locId]) byLocation[bird.locId] = []
      byLocation[bird.locId].push(bird)
    }

    for (const [, locationBirds] of Object.entries(byLocation)) {
      const { lat, lng, location } = locationBirds[0]
      const marker = L.circleMarker([lat, lng], {
        radius: Math.min(5 + locationBirds.length, 14),
        fillColor: "#6366f1",
        color: "#fff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85
      })
      marker.on("click", () => {
        setSelectedLocation(location)
        setSelectedBirds(locationBirds)
        setBirdPhotos({})
        locationBirds.forEach(bird => fetchPhoto(bird.scientificName))
      })
      marker.addTo(mapInstanceRef.current)
      markersRef.current.push(marker)
    }
  }, [birds, selectedYear])

  async function fetchPhoto(scientificName) {
  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&rank=species&per_page=1`
    )
    const data = await res.json()
    const photo = data.results?.[0]?.default_photo?.medium_url
    if (photo) {
      setBirdPhotos(prev => ({ ...prev, [scientificName]: photo }))
    }
  } catch {
    // no photo available
  }
}

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">

      {/* Header */}
      <div className="px-6 py-3 border-b flex items-center gap-4">
        <h1 className="text-lg font-semibold">🦅 My Life List Map</h1>
        <span className="text-sm text-muted-foreground">{visibleCount} species</span>
      </div>

      {/* Slider */}
      <div className="px-6 py-3 border-b flex items-center gap-4">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Showing lifers through:</span>
        <Slider
          min={minYear}
          max={maxYear}
          step={1}
          value={[selectedYear]}
          onValueChange={([val]) => setSelectedYear(val)}
          className="flex-1"
        />
        <span className="text-sm font-medium min-w-[40px]">{selectedYear}</span>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map */}
        <div ref={mapRef} className="flex-1" />

        {/* Side panel */}
        {selectedLocation && (
          <div className="w-80 border-l overflow-y-auto bg-background">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <span className="text-sm font-medium">{selectedLocation}</span>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >×</button>
            </div>

            <div className="p-3 flex flex-col gap-3">
              {selectedBirds.map(bird => (
                <Card key={bird.scientificName}>
                  {birdPhotos[bird.scientificName] && (
                    <img
                      src={birdPhotos[bird.scientificName]}
                      alt={bird.commonName}
                      className="w-full h-40 object-cover rounded-t-lg"
                    />
                  )}
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm">{bird.commonName}</CardTitle>
                    <p className="text-xs text-muted-foreground italic">{bird.scientificName}</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <p className="text-xs text-muted-foreground">First seen: {bird.date}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}