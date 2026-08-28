import { useState, useEffect, useRef, useMemo } from "react"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Search, Trophy } from "lucide-react"
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
  const skipNextFitRef = useRef(false) // set before exiting hotspot mode to prevent fitBounds overriding zoom

  const [birds, setBirds] = useState([])
  const [selectedYear, setSelectedYear] = useState(2026)
  const [minYear, setMinYear] = useState(2000)
  const [maxYear, setMaxYear] = useState(2026)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedBirds, setSelectedBirds] = useState([])
  const [selectedBirdName, setSelectedBirdName] = useState(null)
  const [birdPhotos, setBirdPhotos] = useState({})
  const [photoStatus, setPhotoStatus] = useState({}) // "loading" | "done" per scientificName
  const [visibleCount, setVisibleCount] = useState(0)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])

  // Hotspot rankings state
  const [hotspotMode, setHotspotMode] = useState(false)

  // ── Derived hotspot data ─────────────────────────────────────────────────────

  // Top 10 locations by lifer count, derived from currently visible birds
  const top10Hotspots = useMemo(() => {
    const visible = birds.filter(b => b.lat && b.lng && b.year <= selectedYear)
    const byLoc = {}
    for (const b of visible) {
      if (!byLoc[b.locId]) byLoc[b.locId] = []
      byLoc[b.locId].push(b)
    }
    return Object.values(byLoc)
      .map(locationBirds => {
        const first = locationBirds[0]
        const years = locationBirds.map(b => b.year).filter(Boolean)
        return {
          locId: first.locId,
          location: first.location,
          lat: first.lat,
          lng: first.lng,
          count: locationBirds.length,
          firstYear: Math.min(...years),
          locationBirds,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [birds, selectedYear])

  // ── Data loading ─────────────────────────────────────────────────────────────

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

  // ── Map initialization ────────────────────────────────────────────────────────

  useEffect(() => {
    if (mapInstanceRef.current) return
    mapInstanceRef.current = L.map(mapRef.current, { zoomControl: false }).setView([20, 0], 2)
    L.control.zoom({ position: "bottomleft" }).addTo(mapInstanceRef.current)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: "osm-tiles",
    }).addTo(mapInstanceRef.current)
  }, [])

  // ── Markers ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapInstanceRef.current || birds.length === 0) return

    if (clusterGroupRef.current) {
      mapInstanceRef.current.removeLayer(clusterGroupRef.current)
    }

    clusterGroupRef.current = L.markerClusterGroup({ showCoverageOnHover: false })

    const visible = birds.filter(b => b.year <= selectedYear && b.lat && b.lng)
    setVisibleCount(visible.length)

    const byLocation = {}
    for (const bird of visible) {
      if (!byLocation[bird.locId]) byLocation[bird.locId] = []
      byLocation[bird.locId].push(bird)
    }

    // In hotspot mode, only render the top-10 pins (by lifer count)
    let locationEntries = Object.entries(byLocation)
    if (hotspotMode) {
      locationEntries = locationEntries
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10)
    }

    for (const [, locationBirds] of locationEntries) {
      const { lat, lng, location } = locationBirds[0]
      const marker = L.circleMarker([lat, lng], {
        radius: Math.min(5 + locationBirds.length, 14),
        fillColor: "#6366f1",
        color: "#fff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85,
      })
      marker.on("click", () => openPanel(location, locationBirds, null))
      clusterGroupRef.current.addLayer(marker)
    }

    mapInstanceRef.current.addLayer(clusterGroupRef.current)

    if (clusterGroupRef.current.getLayers().length > 0 && !skipNextFitRef.current) {
      mapInstanceRef.current.fitBounds(clusterGroupRef.current.getBounds(), { padding: [40, 40] })
    }
    skipNextFitRef.current = false
  }, [birds, selectedYear, hotspotMode])

  // ── Search ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) { setSearchResults([]); return }
    const results = birds
      .filter(b => b.lat && b.lng && (
        b.commonName?.toLowerCase().includes(q) ||
        b.scientificName?.toLowerCase().includes(q)
      ))
      .slice(0, 8)
    setSearchResults(results)
  }, [searchQuery, birds])

  useEffect(() => {
    function onClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchResults([])
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  // ── Panel helpers ─────────────────────────────────────────────────────────────

  function openPanel(location, locationBirds, highlightedBirdName) {
    setHotspotMode(false) // always exit rankings mode when opening a bird detail
    setSelectedLocation(location)
    setSelectedBirds(locationBirds)
    setSelectedBirdName(highlightedBirdName)
    setBirdPhotos({})
    // Mark every bird as loading so the skeleton shows immediately
    const initStatus = {}
    locationBirds.forEach(b => { initStatus[b.scientificName] = "loading" })
    setPhotoStatus(initStatus)
    locationBirds.forEach(bird => fetchPhoto(bird.scientificName))
  }

  function closePanel() {
    setSelectedLocation(null)
    setSelectedBirdName(null)
    setSearchQuery("")
  }

  function selectBirdFromSearch(bird) {
    const locationBirds = birds.filter(b => b.locId === bird.locId && b.lat && b.lng)
    openPanel(bird.location, locationBirds, bird.scientificName)
    if (mapInstanceRef.current) {
      const currentZoom = mapInstanceRef.current.getZoom()
      mapInstanceRef.current.setView([bird.lat, bird.lng], Math.max(currentZoom, 10), { animate: true })
    }
    setSearchQuery("")
    setSearchResults([])
  }

  // ── Hotspot helpers ───────────────────────────────────────────────────────────

  /** Expanding amber ring that fades out over ~1 second */
  function pulseMarker(lat, lng) {
    if (!mapInstanceRef.current) return
    const pulse = L.circleMarker([lat, lng], {
      radius: 18,
      fillColor: "#f59e0b",
      color: "#f59e0b",
      weight: 3,
      opacity: 1,
      fillOpacity: 0.3,
      interactive: false,
    }).addTo(mapInstanceRef.current)

    let step = 0
    const STEPS = 15
    const id = setInterval(() => {
      step++
      const t = step / STEPS
      pulse.setRadius(18 + 14 * t)
      pulse.setStyle({ opacity: 1 - t, fillOpacity: 0.3 * (1 - t) })
      if (step >= STEPS) {
        clearInterval(id)
        mapInstanceRef.current?.removeLayer(pulse)
      }
    }, 60)
  }

  function selectHotspot(hotspot) {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([hotspot.lat, hotspot.lng], 12, { animate: true })
      setTimeout(() => pulseMarker(hotspot.lat, hotspot.lng), 300)
    }
    skipNextFitRef.current = true // don't let the marker effect override this zoom
    openPanel(hotspot.location, hotspot.locationBirds, null)
  }

  // ── Photo fetch ───────────────────────────────────────────────────────────────

  async function fetchPhoto(scientificName) {
    try {
      const res = await fetch(
        `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&rank=species&per_page=1`
      )
      const data = await res.json()
      const photo = data.results?.[0]?.default_photo?.medium_url
      if (photo) setBirdPhotos(prev => ({ ...prev, [scientificName]: photo }))
    } catch {
      // no photo available
    } finally {
      // Mark as done whether or not a photo was found, so the skeleton is replaced
      setPhotoStatus(prev => ({ ...prev, [scientificName]: "done" }))
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const sidebarOpen = hotspotMode || !!selectedLocation

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">

      {/* Header */}
      <div className="px-6 py-3 border-b flex items-center gap-4">
        <h1 className="text-lg font-semibold">🦅 My Life List Map</h1>
        <span className="text-sm text-muted-foreground">{visibleCount} species</span>
        <button
          onClick={() => {
            const next = !hotspotMode
            setHotspotMode(next)
            if (next) closePanel() // clear bird detail when opening rankings
          }}
          className={[
            "ml-auto flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors",
            hotspotMode
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-background text-foreground border-border hover:bg-muted",
          ].join(" ")}
        >
          <Trophy className="h-3.5 w-3.5" />
          Top 10 Hotspots
        </button>
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

          {/* Floating search widget */}
          <div
            ref={searchContainerRef}
            className="absolute top-3 left-3 z-[1001] w-72"
            onMouseDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            <div className="bg-white rounded-xl shadow-lg border border-border/60 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setSearchQuery(""); setSearchResults([]) }
                    if (e.key === "Enter" && searchResults.length > 0) selectBirdFromSearch(searchResults[0])
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
              {searchResults.length > 0 && (
                <div className="border-t border-border/60 max-h-64 overflow-y-auto">
                  {searchResults.map(bird => (
                    <button
                      key={bird.scientificName}
                      onMouseDown={e => e.preventDefault()}
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

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <div className="w-80 border-l overflow-y-auto bg-background">

            {/* ── Hotspot rankings panel ── */}
            {hotspotMode && (
              <>
                {/* Sticky header */}
                <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Top 10 Hotspots</span>
                  <button
                    onClick={() => setHotspotMode(false)}
                    className="text-muted-foreground hover:text-foreground text-xl leading-none"
                  >×</button>
                </div>

                {/* Ranked list */}
                <div className="p-3 flex flex-col gap-2">
                  {top10Hotspots.map((hotspot, i) => (
                    <button
                      key={hotspot.locId}
                      onClick={() => selectHotspot(hotspot)}
                      className="w-full text-left group"
                    >
                      <Card className="transition-all group-hover:border-indigo-300 group-hover:shadow-sm">
                        <CardContent className="px-3 py-2.5 flex items-center gap-3">
                          {/* Rank */}
                          <span className="w-6 shrink-0 text-right text-xs font-mono text-muted-foreground">
                            {i + 1}
                          </span>

                          {/* Location info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight truncate">
                              {hotspot.location}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              since {hotspot.firstYear}
                            </p>
                          </div>

                          {/* Lifer count badge */}
                          <span className="shrink-0 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 tabular-nums">
                            {hotspot.count}
                          </span>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ── Bird detail panel ── */}
            {!hotspotMode && selectedLocation && (
              <>
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
                      ref={bird.scientificName === selectedBirdName
                        ? el => el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                        : null}
                      className={bird.scientificName === selectedBirdName
                        ? "ring-2 ring-indigo-500 ring-offset-1"
                        : ""}
                    >
                      {/* Fixed-height photo slot — exists while loading or when a photo is available,
                          so the card height never changes after the panel opens */}
                      {(photoStatus[bird.scientificName] === "loading" || birdPhotos[bird.scientificName]) && (
                        <div className="-mt-4 w-full h-40 overflow-hidden bg-muted">
                          {photoStatus[bird.scientificName] === "loading" && !birdPhotos[bird.scientificName] && (
                            <div className="w-full h-full animate-pulse bg-muted" />
                          )}
                          {birdPhotos[bird.scientificName] && (
                            <img
                              src={birdPhotos[bird.scientificName]}
                              alt={bird.commonName}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
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
              </>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
