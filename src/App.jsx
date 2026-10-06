import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ArrowUpRight,
  Building2,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CircleHelp,
  Crosshair,
  Heart,
  LocateFixed,
  MapPin,
  MapPinned,
  Menu,
  Navigation,
  ParkingSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
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
  const hasReading = Number.isFinite(place.available)
  const percentage = hasReading ? Math.round((place.available / place.capacity) * 100) : null
  const state = !hasReading ? 'unknown' : percentage <= 10 ? 'low' : percentage <= 25 ? 'medium' : 'open'

  return (
    <div className={`availability ${state} ${compact ? 'compact' : ''}`}>
      <strong>{hasReading ? place.available : '—'}</strong>
      <span>{hasReading ? 'lugares libres' : 'sin lectura'}</span>
    </div>
  )
}

function App() {
  const [places, setPlaces] = useState(() => {
    try {
      const savedPlaces = window.localStorage.getItem('cupo.places')
      return savedPlaces ? JSON.parse(savedPlaces) : initialPlaces
    } catch {
      return initialPlaces
    }
  })
  const [accountMode, setAccountMode] = useState('user')
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('distance')
  const [apiStatus, setApiStatus] = useState({ configured: false, model: 'martinalan471-s-workspace/workflows/cupo' })
  const [analysis, setAnalysis] = useState(null)
  const [analysisState, setAnalysisState] = useState('idle')
  const [notice, setNotice] = useState('')
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraScanning, setCameraScanning] = useState(false)
  const [cameraMessage, setCameraMessage] = useState('Conecta una cámara para iniciar el análisis.')
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const scanIntervalRef = useRef(null)
  const scanBusyRef = useRef(false)
  const scanCameraFrameRef = useRef(null)

  const selectedPlace = places.find((place) => place.id === selectedId) || places[0]
  const visiblePlaces = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es')
    return places
      .filter((place) => activeFilter === 'all' || place.type === activeFilter)
      .filter((place) => !normalizedSearch || `${place.name} ${place.address} ${place.category}`.toLocaleLowerCase('es').includes(normalizedSearch))
      .sort((first, second) => sortBy === 'availability'
        ? (second.available ?? -1) - (first.available ?? -1)
        : (first.minutes ?? Number.MAX_SAFE_INTEGER) - (second.minutes ?? Number.MAX_SAFE_INTEGER))
  }, [activeFilter, places, search, sortBy])

  useEffect(() => {
    window.localStorage.setItem('cupo.places', JSON.stringify(places))
  }, [places])

  useEffect(() => {
    fetch('/api/status')
      .then((response) => response.json())
      .then(setApiStatus)
      .catch(() => setApiStatus({ configured: false, model: 'martinalan471-s-workspace/workflows/cupo' }))
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => () => {
    window.clearInterval(scanIntervalRef.current)
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

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
    if (!analysis || analysisState !== 'done' || analysis.availableSpaces === null) return
    setPlaces((current) => current.map((place) => place.id === selectedId
      ? { ...place, available: Math.min(place.capacity, analysis.availableSpaces), lastUpdated: new Date().toISOString() }
      : place))
    setNotice(`Estimación aplicada a ${selectedPlace.name}.`)
  }

  async function createPlace(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const latitudeText = String(form.get('latitude')).trim()
    const longitudeText = String(form.get('longitude')).trim()
    const mapLink = String(form.get('mapLink')).trim()
    const capacity = Number(form.get('capacity'))
    let location

    if (latitudeText && longitudeText) {
      const latitude = Number(latitudeText)
      const longitude = Number(longitudeText)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setNotice('Revisa las coordenadas: latitud de -90 a 90 y longitud de -180 a 180.')
        return
      }
      location = { latitude, longitude, mapUrl: '' }
    } else if (mapLink) {
      setNotice('Resolviendo el enlace del mapa…')
      try {
        const response = await fetch('/api/resolve-map-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: mapLink }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudo resolver el enlace del mapa.')
        location = result
      } catch (error) {
        setNotice(error.message)
        return
      }
    } else {
      setNotice('Ingresa latitud y longitud, o pega un enlace de mapa con la ubicación.')
      return
    }

    const place = {
      id: crypto.randomUUID(),
      name: String(form.get('name')).trim(),
      type: String(form.get('type')),
      category: { shopping: 'Centro comercial', dining: 'Restaurante', help: 'Salud y ayuda' }[String(form.get('type'))],
      address: String(form.get('address')).trim(),
      capacity,
      available: null,
      minutes: null,
      source: 'venue',
      mapUrl: location.mapUrl || '',
      position: [location.latitude, location.longitude],
    }

    setPlaces((current) => [...current, place])
    setSelectedId(place.id)
    setActiveFilter('all')
    setSearch('')
    formElement.reset()
    setNotice(`${place.name} ya aparece en el mapa. Sube una foto o conecta una cámara para medir espacios.`)
  }

  const stopCamera = useCallback(() => {
    window.clearInterval(scanIntervalRef.current)
    scanIntervalRef.current = null
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setCameraScanning(false)
    setCameraMessage('Cámara desconectada.')
  }, [])

  const scanCameraFrame = useCallback(async () => {
    const video = videoRef.current
    if (!video?.videoWidth || scanBusyRef.current) return

    scanBusyRef.current = true
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
      if (!imageBlob) throw new Error('No se pudo capturar un cuadro de la cámara.')

      const formData = new FormData()
      formData.append('image', imageBlob, 'camera-frame.jpg')
      const response = await fetch('/api/analyze', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo analizar la cámara.')

      if (result.availableSpaces === null) {
        window.clearInterval(scanIntervalRef.current)
        scanIntervalRef.current = null
        setCameraScanning(false)
        setCameraMessage(`El modelo ${result.model} detectó ${result.vehicleCount} vehículos, pero no clasifica cajones libres/ocupados. Usa un modelo Roboflow entrenado para cajones.`)
        return
      }

      setPlaces((current) => current.map((place) => place.id === selectedId
        ? { ...place, available: Math.min(place.capacity, result.availableSpaces), lastUpdated: new Date().toISOString() }
        : place))
      setCameraMessage(`${result.availableSpaces} cajones libres según el último análisis.`)
    } catch (error) {
      window.clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
      setCameraScanning(false)
      setCameraMessage(error.message)
    } finally {
      scanBusyRef.current = false
    }
  }, [selectedId])

  useEffect(() => {
    scanCameraFrameRef.current = scanCameraFrame
  }, [scanCameraFrame])

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !cameraStreamRef.current) return

    videoRef.current.srcObject = cameraStreamRef.current
    videoRef.current.play()
      .then(() => scanCameraFrameRef.current?.())
      .catch(() => {
        stopCamera()
        setCameraMessage('No se pudo reproducir la vista de la cámara.')
      })
  }, [cameraActive, stopCamera])

  async function startCamera() {
    if (!apiStatus.configured) {
      setCameraMessage('Configura ROBOFLOW_API_KEY en .env para activar el análisis.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('El navegador no permite acceder a la cámara en este contexto.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      })
      cameraStreamRef.current = stream
      setCameraActive(true)
      setCameraScanning(true)
      setCameraMessage('Analizando un cuadro cada 10 segundos.')
      scanIntervalRef.current = window.setInterval(() => scanCameraFrameRef.current?.(), 10_000)
    } catch (error) {
      stopCamera()
      setCameraMessage(error.name === 'NotAllowedError'
        ? 'Permite el acceso a la cámara en tu navegador para continuar.'
        : 'No se pudo iniciar la cámara. Comprueba que esté conectada y disponible.')
    }
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

      <div className={`workspace ${accountMode === 'venue' ? 'venue-mode' : ''}`}>
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
            <span>{visiblePlaces.length} lugares en esta zona</span>
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
                  <span className="place-distance"><Navigation size={12} /> {place.minutes == null ? 'Ubicación registrada' : `${place.minutes} min`} <span>·</span> {place.address.split(',').at(-1)}</span>
                </span>
                <Availability place={place} compact />
              </button>
            ))}
            {visiblePlaces.length === 0 && (
              <div className="empty-state"><Search size={22} /><strong>No encontramos ese lugar</strong><span>Prueba otra colonia o categoría.</span></div>
            )}
          </div>

          <div className="panel-footnote"><CircleHelp size={15} />Consulta la lectura disponible en cada ubicación.</div>
        </aside>

        <main className="main-content" id="inicio">
          <div className="account-switch">
            <span>VISTA DEMO</span>
            <div role="group" aria-label="Cambiar tipo de cuenta">
              <button className={accountMode === 'user' ? 'active' : ''} type="button" onClick={() => setAccountMode('user')}><UserRound size={15} />Usuario</button>
              <button className={accountMode === 'venue' ? 'active' : ''} type="button" onClick={() => setAccountMode('venue')}><Building2 size={15} />Centro o lugar</button>
            </div>
          </div>
          {accountMode === 'user' ? (
            <>
          <section className="map-section" aria-label="Mapa de estacionamientos">
            <div className="map-topline">
              <div className="map-title"><span className="map-title-icon"><MapPin size={16} /></span><div><strong>Lugares en el mapa</strong><span>Selecciona un marcador para consultar su información.</span></div></div>
              <span className="map-place-count">{visiblePlaces.length} {visiblePlaces.length === 1 ? 'lugar' : 'lugares'}</span>
            </div>
            <div className="map-frame">
              <MapContainer center={[19.405, -99.164]} zoom={13} scrollWheelZoom className="map-canvas" zoomControl={false}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapViewport center={selectedPlace.position} />
                {visiblePlaces.map((place) => {
                  const percentage = place.available === null ? null : place.available / place.capacity
                  const color = percentage === null ? '#87938a' : percentage <= 0.1 ? '#c25846' : percentage <= 0.25 ? '#dd9d32' : '#227b5b'
                  return (
                    <CircleMarker key={place.id} center={place.position} radius={selectedId === place.id ? 12 : 10} pathOptions={{ color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 }} eventHandlers={{ click: () => selectPlace(place) }}>
                      <Tooltip permanent direction="top" offset={[0, -8]} className="map-tooltip">{place.available === null ? 'Sin lectura' : `${place.available} libres`}</Tooltip>
                      <Popup className="place-popup">
                        <div className="map-popup">
                          <span className="map-popup-category">{place.category}</span>
                          <strong>{place.name}</strong>
                          <span className="map-popup-address">{place.address}</span>
                          <div className="map-popup-spaces">
                            <strong>{place.available ?? '—'}</strong>
                            <span>{place.available === null ? 'espacios sin lectura' : `espacios libres de ${place.capacity}`}</span>
                          </div>
                          <span className={`map-popup-status ${place.available === null ? 'unknown' : place.available === 0 ? 'full' : 'reading'}`}>
                            {place.available === null ? 'Sin lectura de ocupación' : place.available === 0 ? 'Sin espacios disponibles' : place.lastUpdated ? `Actualizado ${new Date(place.lastUpdated).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Disponibilidad de demostración'}
                          </span>
                          <button type="button" onClick={() => selectPlace(place)}>Ver ficha completa <ArrowUpRight size={13} /></button>
                        </div>
                      </Popup>
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
            </div>
            <article className="selected-place">
              <span className={`selected-icon ${selectedPlace.type}`}>
                {selectedPlace.type === 'shopping' ? <ParkingSquare size={22} /> : selectedPlace.type === 'dining' ? <Heart size={22} /> : <ShieldCheck size={22} />}
              </span>
                <div className="selected-details"><span>{selectedPlace.category}</span><strong>{selectedPlace.name}</strong><p><MapPin size={13} />{selectedPlace.address}</p></div>
                <div className="selected-availability"><Availability place={selectedPlace} /><span><span className="availability-dot" />{selectedPlace.available === null ? 'Sin lectura de cámara' : selectedPlace.source === 'venue' ? 'Lectura del establecimiento' : 'Dato de muestra'}</span></div>
                <div className="selected-distance"><Navigation size={15} /><strong>{selectedPlace.minutes == null ? '—' : `${selectedPlace.minutes} min`}</strong><span>{selectedPlace.minutes == null ? 'distancia no configurada' : 'desde el centro de la zona'}</span></div>
              <button className="directions-button" type="button" onClick={() => window.open(selectedPlace.mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.position[0]},${selectedPlace.position[1]}`, '_blank', 'noopener,noreferrer')}><Navigation size={16} />{selectedPlace.mapUrl ? 'Abrir lugar' : 'Cómo llegar'}</button>
            </article>
          </section>

            </>
          ) : (
            <section className="operator-dashboard">
              <div className="operator-heading">
                <div>
                  <span className="eyebrow">CUENTA DE CENTRO O LUGAR</span>
                  <h2>Administra tu estacionamiento.</h2>
                  <p>Conecta una cámara y supervisa los espacios de {selectedPlace.name}.</p>
                </div>
                <span className="demo-tag">VISTA DEMO · SIN AUTENTICACIÓN</span>
              </div>
              <div className="operator-summary">
                <div><span>ESTABLECIMIENTO</span><strong>{selectedPlace.name}</strong><small>{selectedPlace.address}</small></div>
                <div><span>CAPACIDAD CONFIGURADA</span><strong>{selectedPlace.capacity} cajones</strong><small>La disponibilidad se actualiza con un modelo de ocupación.</small></div>
                <div><span>DISPONIBLES PARA USUARIOS</span><Availability place={selectedPlace} /><small>{selectedPlace.lastUpdated ? `Última lectura ${new Date(selectedPlace.lastUpdated).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : selectedPlace.source === 'venue' ? 'Sin lectura de ocupación' : 'Dato de demostración'}</small></div>
              </div>
              <section className="registration-section" aria-label="Dar de alta un estacionamiento">
                <div className="registration-heading"><span className="registration-icon"><MapPinned size={18} /></span><div><span className="eyebrow">NUEVA UBICACIÓN</span><h3>Dar de alta un lugar</h3></div></div>
                <form className="registration-form" onSubmit={createPlace}>
                  <label>Nombre del lugar<input name="name" required maxLength="80" placeholder="Ej. Plaza Central" /></label>
                  <label>Tipo de lugar<select name="type" defaultValue="shopping"><option value="shopping">Centro comercial</option><option value="dining">Restaurante</option><option value="help">Salud y ayuda</option></select></label>
                  <label className="form-wide">Dirección<input name="address" required maxLength="140" placeholder="Calle, número, colonia y ciudad" /></label>
                  <label>Latitud<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="19.4326" /></label>
                  <label>Longitud<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="-99.1332" /></label>
                  <label>Capacidad total<input name="capacity" required type="number" min="1" max="50000" step="1" placeholder="120" /></label>
                  <label className="form-full">Enlace de Google Maps, Apple Maps u OpenStreetMap<input name="mapLink" type="url" placeholder="https://maps.app.goo.gl/..." /></label>
                  <button className="register-button" type="submit"><Plus size={16} />Agregar al mapa</button>
                </form>
                <p className="registration-help">Indica ambas coordenadas o pega un enlace del lugar. El marcador se guardará en esa ubicación.</p>
              </section>
              <section className="photo-ingestion" aria-label="Analizar foto del estacionamiento">
                <div><span className="registration-icon"><Upload size={18} /></span><div><strong>Contar espacios desde una foto</strong><span>Sube una imagen del estacionamiento seleccionado.</span></div></div>
                <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={analyzeImage} />
                <button className="camera-action" type="button" onClick={() => fileInputRef.current?.click()}><Upload size={16} />Elegir imagen</button>
              </section>
              <section className="camera-console" aria-label="Cámara y análisis">
                <div className="camera-preview">
                  {cameraActive ? <video ref={videoRef} autoPlay muted playsInline aria-label="Vista en vivo de la cámara del estacionamiento" /> : <div className="camera-placeholder"><Camera size={28} /><strong>Cámara del estacionamiento</strong><span>La vista previa aparece al iniciar la cámara de este dispositivo.</span></div>}
                  <span className={`camera-live ${cameraActive ? 'active' : ''}`}><i />{cameraScanning ? 'ANÁLISIS ACTIVO · 10 S' : cameraActive ? 'CÁMARA CONECTADA' : 'SIN CÁMARA'}</span>
                </div>
                <div className="camera-controls">
                  <span className="eyebrow">LECTURA DE OCUPACIÓN</span>
                  <h3>Estado de la cámara</h3>
                  <p className="camera-message" role="status">{cameraMessage}</p>
                  <div className="camera-model"><Sparkles size={15} />Modelo: <strong>{apiStatus.model}</strong></div>
                  {cameraActive
                    ? <button className="camera-action stop" type="button" onClick={stopCamera}><CameraOff size={17} />Detener cámara</button>
                    : <button className="camera-action" type="button" onClick={startCamera}><Camera size={17} />Conectar cámara y analizar</button>}
                  {!apiStatus.configured && <small className="camera-setup">Falta `ROBOFLOW_API_KEY` en `.env`. La clave nunca se escribe en el navegador.</small>}
                </div>
              </section>
              {analysis && (
                <section className="analysis-section" aria-live="polite">
                  <div className="analysis-heading">
                    <div><span className="eyebrow">INFERENCIA CON ROBOFLOW</span><h3>Resultado para {selectedPlace.name}</h3></div>
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
                      {analysisState === 'done' ? (
                        analysis.availableSpaces === null
                          ? <><strong className="vehicle-total">{analysis.vehicleCount}<span> vehículos detectados</span></strong><p>El Workflow no devolvió cajones libres/ocupados; no se actualizará el mapa.</p></>
                          : <><strong className="vehicle-total">{analysis.availableSpaces}<span> cajones libres</span></strong><p>{analysis.occupiedSpaces} ocupados detectados. Confirma la lectura para publicarla.</p><button type="button" className="apply-button" onClick={applyAnalysisToAvailability}><Check size={16} />Publicar disponibilidad</button></>
                      ) : analysisState === 'error' ? <p className="analysis-error">No se completó el análisis. Verifica la configuración del Workflow.</p> : <p>Enviando la imagen a Roboflow…</p>}
                    </div>
                  </div>
                  <div className="privacy-note"><ShieldCheck size={14} />La clave permanece en el servidor. La imagen se envía a Roboflow solo para esta inferencia.</div>
                </section>
              )}
              <div className="operator-note"><ShieldCheck size={17} /><p><strong>Antes de publicar:</strong> el Workflow `cupo` debe detectar explícitamente cajones libres y ocupados para el ángulo de esta cámara. Para cámaras IP, conecta RTSP a un servicio de inferencia edge, no al navegador del operador.</p></div>
              <p className="account-limit"><CircleHelp size={14} />Este prototipo cambia de vista en el mismo navegador. Inicio de sesión, permisos por establecimiento y sincronización entre dispositivos requieren autenticación y una base de datos.</p>
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