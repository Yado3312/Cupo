import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ArrowUpRight,
  CarFront,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crosshair,
  Heart,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  ParkingSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const initialPlaces = [
  { id: 1, name: 'Parque Delta', type: 'shopping', category: 'Centro comercial', address: 'Av. Cuauhtémoc 462, Narvarte', available: 42, capacity: 280, minutes: 3, position: [19.4027, -99.1536] },
  { id: 2, name: 'Mercado Roma', type: 'dining', category: 'Restaurante y mercado', address: 'Querétaro 225, Roma Norte', available: 8, capacity: 64, minutes: 6, position: [19.4158, -99.1602] },
  { id: 3, name: 'Hospital General', type: 'help', category: 'Salud y ayuda', address: 'Dr. Balmis 148, Doctores', available: 11, capacity: 96, minutes: 8, position: [19.4137, -99.1535] },
  { id: 4, name: 'Plaza Universidad', type: 'shopping', category: 'Centro comercial', address: 'Av. Universidad 1000, Santa Cruz Atoyac', available: 76, capacity: 540, minutes: 13, position: [19.3605, -99.1888] },
  { id: 5, name: 'Mítikah', type: 'shopping', category: 'Centro comercial', address: 'Real de Mayorazgo 130, Xoco', available: 123, capacity: 720, minutes: 15, position: [19.3608, -99.1682] },
  { id: 6, name: 'Pabellón Cuauhtémoc', type: 'shopping', category: 'Centro comercial', address: 'Av. Cuauhtémoc 19, Roma Norte', available: 19, capacity: 180, minutes: 9, position: [19.4212, -99.1606] },
]

const filters = [
  { id: 'all', label: 'Todo', icon: Crosshair },
  { id: 'shopping', label: 'Plazas', icon: ParkingSquare },
  { id: 'dining', label: 'Restaurantes', icon: Heart },
  { id: 'help', label: 'Salud y ayuda', icon: ShieldCheck },
]

function MapViewport({ center }) {
  const map = useMap()

  useEffect(() => {
    map.flyTo(center, map.getZoom(), { duration: 0.6 })
  }, [center, map])

  return null
}

function Availability({ place, compact = false }) {
  const percentage = Math.round((place.available / place.capacity) * 100)
  const state = percentage <= 10 ? 'low' : percentage <= 25 ? 'medium' : 'open'

  return (
    <div className={`availability ${state} ${compact ? 'compact' : ''}`}>
      <strong>{place.available}</strong>
      <span>lugares libres</span>
    </div>
  )
}

function App() {
  const [places, setPlaces] = useState(initialPlaces)
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('distance')
  const [apiStatus, setApiStatus] = useState({ configured: false, model: 'coco/40' })
  const [analysis, setAnalysis] = useState(null)
  const [analysisState, setAnalysisState] = useState('idle')
  const [notice, setNotice] = useState('')
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() => new Date())
  const fileInputRef = useRef(null)

  const selectedPlace = places.find((place) => place.id === selectedId) || places[0]
  const visiblePlaces = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es')
    return places
      .filter((place) => activeFilter === 'all' || place.type === activeFilter)
      .filter((place) => !normalizedSearch || `${place.name} ${place.address} ${place.category}`.toLocaleLowerCase('es').includes(normalizedSearch))
      .sort((first, second) => sortBy === 'availability'
        ? second.available - first.available
        : first.minutes - second.minutes)
  }, [activeFilter, places, search, sortBy])

  const totalAvailable = places.reduce((total, place) => total + place.available, 0)

  useEffect(() => {
    fetch('/api/status')
      .then((response) => response.json())
      .then(setApiStatus)
      .catch(() => setApiStatus({ configured: false, model: 'coco/40' }))
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function refreshDemoData() {
    setPlaces((current) => current.map((place) => ({
      ...place,
      available: Math.max(0, Math.min(place.capacity, place.available + Math.round(Math.random() * 8 - 4))),
    })))
    setLastRefresh(new Date())
    setNotice('Disponibilidad de muestra actualizada.')
  }

  async function analyzeImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setNotice('Selecciona un archivo de imagen válido.')
      return
    }

    const imageUrl = URL.createObjectURL(file)
    const dimensions = await new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve({ width: 1280, height: 720 })
      image.src = imageUrl
    })

    setAnalysis({ imageUrl, fileName: file.name, ...dimensions, detections: [], vehicleCount: 0 })
    setAnalysisState('loading')

    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await fetch('/api/analyze', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo analizar la imagen.')
      setAnalysis((current) => ({ ...current, ...result }))
      setAnalysisState('done')
    } catch (error) {
      setAnalysisState('error')
      setNotice(error.message)
    }
  }

  function applyAnalysisToAvailability() {
    if (!analysis || analysisState !== 'done') return
    setPlaces((current) => current.map((place) => place.id === selectedId
      ? { ...place, available: Math.max(0, place.capacity - analysis.vehicleCount) }
      : place))
    setLastRefresh(new Date())
    setNotice(`Estimación aplicada a ${selectedPlace.name}.`)
  }

  function centerOnUser() {
    if (!navigator.geolocation) {
      setNotice('Este dispositivo no permite compartir ubicación.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setNotice(`Tu ubicación está en ${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}. Los lugares mostrados son datos de ejemplo de CDMX.`),
      () => setNotice('No se pudo obtener tu ubicación. Revisa los permisos del navegador.'),
      { timeout: 8000 },
    )
  }

  function selectPlace(place) {
    setSelectedId(place.id)
    setIsMobilePanelOpen(false)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Cupo, inicio">
          <span className="brand-mark"><ParkingSquare size={22} strokeWidth={2.2} /></span>
          <span className="brand-name">cupo<span>.</span></span>
        </a>
        <div className="topbar-center">
          <span className="live-pulse" />
          <span>Disponibilidad de estacionamiento</span>
          <span className="demo-tag">MODO DEMO</span>
        </div>
        <div className="topbar-actions">
          <span className={`connection-state ${apiStatus.configured ? 'connected' : ''}`}>
            <span className="connection-dot" />
            {apiStatus.configured ? 'Roboflow listo' : 'Roboflow sin configurar'}
          </span>
          <button className="icon-button mobile-menu" type="button" aria-label="Abrir lista de lugares" onClick={() => setIsMobilePanelOpen((open) => !open)}>
            {isMobilePanelOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <button className="avatar" type="button" aria-label="Perfil">C</button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`places-panel ${isMobilePanelOpen ? 'mobile-open' : ''}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">EXPLORA CERCA</span>
              <h1>Encuentra tu lugar.</h1>
              <p>Estacionamiento para lo que importa.</p>
            </div>
            <button className="icon-button locate-button" type="button" aria-label="Usar mi ubicación" title="Usar mi ubicación" onClick={centerOnUser}>
              <LocateFixed size={18} />
            </button>
          </div>

          <label className="search-box">
            <Search size={17} />
            <input aria-label="Buscar lugares" placeholder="Lugar, colonia o dirección" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button type="button" className="clear-search" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X size={15} /></button>}
          </label>

          <div className="nearby-caption">
            <span><MapPin size={14} /> Ciudad de México</span>
            <button type="button" title="Cambiar zona" aria-label="Cambiar zona"><ChevronDown size={15} /></button>
          </div>

          <nav className="filter-list" aria-label="Filtrar lugares">
            {filters.map(({ id, label, icon: Icon }) => (
              <button className={`filter-button ${activeFilter === id ? 'active' : ''}`} key={id} type="button" onClick={() => setActiveFilter(id)}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                {id === 'all' && <span className="filter-count">{places.length}</span>}
              </button>
            ))}
          </nav>

          <div className="results-toolbar">
            <span>{visiblePlaces.length} lugares <span className="muted-dot">·</span> datos de muestra</span>
            <button className="sort-button" type="button" onClick={() => setSortBy((current) => current === 'distance' ? 'availability' : 'distance')} title={sortBy === 'distance' ? 'Ordenar por disponibilidad' : 'Ordenar por distancia'}>
              <ArrowDownUp size={14} /> {sortBy === 'distance' ? 'Cerca' : 'Más libres'}
            </button>
          </div>

          <div className="place-list">
            {visiblePlaces.map((place) => (
              <button type="button" className={`place-card ${selectedId === place.id ? 'selected' : ''}`} key={place.id} onClick={() => selectPlace(place)}>
                <span className={`place-symbol ${place.type}`}>
                  {place.type === 'shopping' ? <ParkingSquare size={18} /> : place.type === 'dining' ? <Heart size={18} /> : <ShieldCheck size={18} />}
                </span>
                <span className="place-info">
                  <strong>{place.name}</strong>
                  <span>{place.category}</span>
                  <span className="place-distance"><Navigation size={12} /> {place.minutes} min <span>·</span> {place.address.split(',').at(-1)}</span>
                </span>
                <Availability place={place} compact />
              </button>
            ))}
            {visiblePlaces.length === 0 && (
              <div className="empty-state"><Search size={22} /><strong>No encontramos ese lugar</strong><span>Prueba otra colonia o categoría.</span></div>
            )}
          </div>

          <div className="panel-footnote"><CircleHelp size={15} /> Disponibilidad de ejemplo, no en tiempo real.</div>
        </aside>

        <main className="main-content" id="inicio">
          <section className="overview-row" aria-label="Resumen de estacionamientos">
            <div className="overview-title">
              <span className="eyebrow">TU CIUDAD, A TU RITMO</span>
              <h2>Hay espacio para llegar.</h2>
              <p>Consulta opciones y planea dónde estacionarte.</p>
            </div>
            <div className="summary-metrics">
              <div className="metric-item"><span className="metric-icon mint"><ParkingSquare size={17} /></span><div><strong>{places.length}</strong><span>lugares en la zona</span></div></div>
              <span className="metric-separator" />
              <div className="metric-item"><span className="metric-icon lemon"><CarFront size={18} /></span><div><strong>{totalAvailable.toLocaleString('es-MX')}</strong><span>espacios de muestra</span></div></div>
            </div>
          </section>

          <section className="map-section" aria-label="Mapa de estacionamientos">
            <div className="map-topline">
              <div className="map-title"><span className="map-title-icon"><MapPin size={16} /></span><div><strong>Ciudad de México</strong><span>Roma · Doctores · Narvarte · Santa Cruz</span></div></div>
              <button className="refresh-button" type="button" onClick={refreshDemoData}><Clock3 size={15} /><span>Actualizado {lastRefresh.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span><span className="refresh-divider" /><span>Actualizar</span></button>
            </div>
            <div className="map-frame">
              <MapContainer center={[19.405, -99.164]} zoom={13} scrollWheelZoom className="map-canvas" zoomControl={false}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapViewport center={selectedPlace.position} />
                {visiblePlaces.map((place) => {
                  const percentage = place.available / place.capacity
                  const color = percentage <= 0.1 ? '#c25846' : percentage <= 0.25 ? '#dd9d32' : '#227b5b'
                  return (
                    <CircleMarker key={place.id} center={place.position} radius={selectedId === place.id ? 12 : 10} pathOptions={{ color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 }} eventHandlers={{ click: () => selectPlace(place) }}>
                      <Tooltip permanent direction="top" offset={[0, -8]} className="map-tooltip">{place.available} libres</Tooltip>
                      <Popup><div className="map-popup"><strong>{place.name}</strong><span>{place.available} espacios disponibles</span><button type="button" onClick={() => selectPlace(place)}>Ver lugar <ArrowUpRight size={13} /></button></div></Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
              <div className="map-legend"><span><i className="legend-dot open-dot" /> Disponible</span><span><i className="legend-dot busy-dot" /> Pocos lugares</span></div>
              <button className="map-locate" type="button" onClick={centerOnUser} aria-label="Usar mi ubicación" title="Usar mi ubicación"><Crosshair size={17} /></button>
              <div className="map-credit">MAPA · OPENSTREETMAP</div>
            </div>
          </section>

          <section className="selected-section" aria-label="Lugar seleccionado">
            <div className="section-heading">
              <div><span className="eyebrow">SELECCIÓN</span><h3>Un buen lugar para empezar.</h3></div>
              <button className="text-button" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} />Analizar imagen</button>
              <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={analyzeImage} />
            </div>
            <article className="selected-place">
              <span className={`selected-icon ${selectedPlace.type}`}>
                {selectedPlace.type === 'shopping' ? <ParkingSquare size={22} /> : selectedPlace.type === 'dining' ? <Heart size={22} /> : <ShieldCheck size={22} />}
              </span>
              <div className="selected-details"><span>{selectedPlace.category}</span><strong>{selectedPlace.name}</strong><p><MapPin size={13} />{selectedPlace.address}</p></div>
              <div className="selected-availability"><Availability place={selectedPlace} /><span><span className="availability-dot" /> Estimación de muestra</span></div>
              <div className="selected-distance"><Navigation size={15} /><strong>{selectedPlace.minutes} min</strong><span>desde el centro de la zona</span></div>
              <button className="directions-button" type="button" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.position[0]},${selectedPlace.position[1]}`, '_blank', 'noopener,noreferrer')}><Navigation size={16} />Cómo llegar</button>
            </article>
          </section>

          {analysis && (
            <section className="analysis-section" aria-live="polite">
              <div className="analysis-heading">
                <div><span className="eyebrow">INFERENCIA CON ROBOFLOW</span><h3>Análisis de ocupación</h3></div>
                <button type="button" className="icon-button" aria-label="Cerrar análisis" onClick={() => { URL.revokeObjectURL(analysis.imageUrl); setAnalysis(null); setAnalysisState('idle') }}><X size={18} /></button>
              </div>
              <div className="analysis-body">
                <div className="analysis-preview" style={{ aspectRatio: `${analysis.width} / ${analysis.height}` }}>
                  <img src={analysis.imageUrl} alt={`Imagen analizada: ${analysis.fileName}`} />
                  {analysisState === 'done' && <svg className="detection-overlay" viewBox={`0 0 ${analysis.width} ${analysis.height}`} preserveAspectRatio="none" aria-hidden="true">
                    {analysis.detections.map((detection, index) => <g key={`${detection.label}-${index}`}><rect x={detection.x - detection.width / 2} y={detection.y - detection.height / 2} width={detection.width} height={detection.height} /><text x={detection.x - detection.width / 2} y={detection.y - detection.height / 2 - 5}>{detection.label} {Math.round(detection.confidence * 100)}%</text></g>)}
                  </svg>}
                  {analysisState === 'loading' && <div className="analysis-loading"><span className="spinner" /> Analizando con Roboflow…</div>}
                </div>
                <div className="analysis-result">
                  <span className="result-model"><Sparkles size={15} />{analysis.model || apiStatus.model}</span>
                  {analysisState === 'done' ? <><strong className="vehicle-total">{analysis.vehicleCount}<span> vehículos detectados</span></strong><p>Estimación visual en esta imagen. La disponibilidad real requiere cobertura completa y calibración del estacionamiento.</p><button type="button" className="apply-button" onClick={applyAnalysisToAvailability}><Check size={16} />Aplicar estimación a {selectedPlace.name}</button></> : analysisState === 'error' ? <p className="analysis-error">No se completó el análisis. Verifica la conexión, tu modelo y la configuración del servidor.</p> : <p>Enviando imagen al modelo de Roboflow configurado…</p>}
                </div>
              </div>
              <div className="privacy-note"><ShieldCheck size={14} />La API key se mantiene en el servidor. La imagen se envía a Roboflow solo para realizar esta inferencia.</div>
            </section>
          )}

          <footer className="app-footer"><span>cupo<span className="footer-period">.</span> <span>Hecho para llegar más fácil.</span></span><span>Datos de ejemplo · Ciudad de México</span><a href="https://docs.roboflow.com/guides/run-model-serverless-api" target="_blank" rel="noreferrer">API de Roboflow <ArrowUpRight size={13} /></a></footer>
        </main>
      </div>

      {notice && <div className="toast" role="status"><span><Check size={15} /></span>{notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={15} /></button></div>}
    </div>
  )
}

export default App