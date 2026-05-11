import { useState, useEffect, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Search } from "lucide-react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import "leaflet.markercluster"

export default function App() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const clusterGroupRef = useRef(null)
  const searchContainerRef = useRef(null)

  const [birds, setBirds] = useState([])
  const [selectedYear, setSelectedYear] = useState(2026)
  const [minYear, setMinYear] = useState(2000)
  const [maxYear, setMaxYear] = useState(2026)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedBirds, setSelectedBirds] = useState([])
  const [selectedBirdName, setSelectedBirdName] = useState(null) // scientificName highlighted via search
  const [birdPhotos, setBirdPhotos] = useState({})
  const [visibleCount, setVisibleCount] = useState(0)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])

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
    mapInstanceRef.current = L.map(mapRef.current, { zoomControl: false }).setView([20, 0], 2)
    L.control.zoom({ position: "bottomleft" }).addTo(mapInstanceRef.current)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(mapInstanceRef.current)
  }, [])

  // Update markers when year or birds change
  useEffect(() => {
    if (!mapInstanceRef.current || birds.length === 0) return

    if (clusterGroupRef.current) {
      mapInstanceRef.current.removeLayer(clusterGroupRef.current)
    }

    clusterGroupRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,
    })

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
        openPanel(location, locationBirds, null)
      })
      clusterGroupRef.current.addLayer(marker)
    }

    mapInstanceRef.current.addLayer(clusterGroupRef.current)

    if (clusterGroupRef.current.getLayers().length > 0) {
      mapInstanceRef.current.fitBounds(clusterGroupRef.current.getBounds(), { padding: [40, 40] })
    }
  }, [birds, selectedYear])

  // Filter search results as user types (searches all birds with coords)
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setSearchResults([])
      return
    }
    const results = birds
      .filter(b => b.lat && b.lng && (
        b.commonName?.toLowerCase().includes(q) ||
        b.scientificName?.toLowerCase().includes(q)
      ))
      .slice(0, 8)
    setSearchResults(results)
  }, [searchQuery, birds])

  // Close dropdown when clicking outside the search widget
  useEffect(() => {
    function onClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchResults([])
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  // Shared helper to open the side panel
  function openPanel(location, locationBirds, highlightedBirdName) {
    setSelectedLocation(location)
    setSelectedBirds(locationBirds)
    setSelectedBirdName(highlightedBirdName)
    setBirdPhotos({})
    locationBirds.forEach(bird => fetchPhoto(bird.scientificName))
  }

  // Called when user picks a result from the search dropdown
  function selectBirdFromSearch(bird) {
    // Gather all birds seen at the same location
    const locationBirds = birds.filter(b => b.locId === bird.locId && b.lat && b.lng)
    openPanel(bird.location, locationBirds, bird.scientificName)

    // Pan & zoom the map to the selected pin
    if (mapInstanceRef.current) {
      const currentZoom = mapInstanceRef.current.getZoom()
      mapInstanceRef.current.setView([bird.lat, bird.lng], Math.max(currentZoom, 10), { animate: true })
    }

    // Clear search
    setSearchQuery("")
    setSearchResults([])
  }

  function closePanel() {
    setSelectedLocation(null)
    setSelectedBirdName(null)
    setSearchQuery("")
  }

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

        {/* Map + floating search */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={mapRef} className="absolute inset-0" />

          {/* Floating search widget — sits above the map */}
          <div
            ref={searchContainerRef}
            className="absolute top-3 left-3 z-[1001] w-72"
            // Prevent map drag/zoom from triggering when interacting with the widget
            onMouseDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            <div className="bg-white rounded-xl shadow-lg border border-border/60 overflow-hidden">
              {/* Input row */}
              <div className="flex items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") {
                      setSearchQuery("")
                      setSearchResults([])
                    }
                    if (e.key === "Enter" && searchResults.length > 0) {
                      selectBirdFromSearch(searchResults[0])
                    }
                  }}
                  placeholder="Search species…"
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchResults([]) }}
                    className="text-muted-foreground hover:text-foreground text-base leading-none"
                  >×</button>
                )}
              </div>

              {/* Dropdown results */}
              {searchResults.length > 0 && (
                <div className="border-t border-border/60 max-h-64 overflow-y-auto">
                  {searchResults.map(bird => (
                    <button
                      key={bird.scientificName}
                      onMouseDown={e => e.preventDefault()} // keep input focused
                      onClick={() => selectBirdFromSearch(bird)}
                      className="w-full px-3 py-2.5 text-left hover:bg-muted/60 flex flex-col gap-0.5 transition-colors"
                    >
                      <span className="text-sm font-medium leading-tight">{bird.commonName}</span>
                      <span className="text-xs text-muted-foreground italic leading-tight">{bird.scientificName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side panel */}
        {selectedLocation && (
          <div className="w-80 border-l overflow-y-auto bg-background">
            <div className="sticky top-0 z-10 bg-background px-4 py-3 border-b flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{selectedLocation}</span>
                <span className="text-xs text-muted-foreground">{selectedBirds.length} species</span>
              </div>
              <button
                onClick={closePanel}
                className="text-muted-foreground hover:text-foreground text-xl leading-none mt-0.5"
              >×</button>
            </div>

            <div className="p-3 flex flex-col gap-3">
              {selectedBirds.map(bird => (
                <Card
                  key={bird.scientificName}
                  // Scroll highlighted card into view via ref callback
                  ref={bird.scientificName === selectedBirdName
                    ? el => el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                    : null}
                  className={bird.scientificName === selectedBirdName
                    ? "ring-2 ring-indigo-500 ring-offset-1"
                    : ""}
                >
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
