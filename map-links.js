const allowedHosts = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'maps.google.com',
  'www.google.com',
  'openstreetmap.org',
  'www.openstreetmap.org',
  'maps.apple.com',
])

function isAllowedHost(hostname) {
  return allowedHosts.has(hostname)
    || hostname.endsWith('.google.com')
    || hostname.endsWith('.openstreetmap.org')
}

function coordinatePair(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null
  }

  return { latitude: lat, longitude: lng }
}

function parsePair(value) {
  const match = String(value).match(/^\s*(-?\d+(?:\.\d+)?)\s*[,/\s]+\s*(-?\d+(?:\.\d+)?)\s*$/)
  return match ? coordinatePair(match[1], match[2]) : null
}

export function parseMapCoordinates(value) {
  const text = String(value || '')
  const directPair = parsePair(text)
  if (directPair) return directPair

  let url
  try {
    url = new URL(text)
  } catch {
    return null
  }

  const candidates = [
    url.searchParams.get('q'),
    url.searchParams.get('query'),
    url.searchParams.get('ll'),
    url.searchParams.get('center'),
    url.searchParams.get('where'),
    decodeURIComponent(url.pathname),
    decodeURIComponent(url.hash),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const decoded = decodeURIComponent(candidate)
    const patterns = [
      /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
      /(?:^|[=#/])map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/,
      /(-?\d+(?:\.\d+)?)[,%2F/\s]+(-?\d+(?:\.\d+)?)/i,
    ]

    for (const pattern of patterns) {
      const match = decoded.match(pattern)
      if (!match) continue
      const pair = coordinatePair(match[1], match[2])
      if (pair) return pair
    }
  }

  const latitude = url.searchParams.get('mlat') || url.searchParams.get('lat')
  const longitude = url.searchParams.get('mlon') || url.searchParams.get('lon') || url.searchParams.get('lng')
  return latitude && longitude ? coordinatePair(latitude, longitude) : null
}

export async function resolveMapCoordinates(value, fetchImpl = fetch) {
  let target
  try {
    target = new URL(String(value))
  } catch {
    throw new Error('Pega un enlace completo de Google Maps, Apple Maps u OpenStreetMap.')
  }

  if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
    throw new Error('Usa un enlace seguro de Google Maps, Apple Maps u OpenStreetMap.')
  }

  const directCoordinates = parseMapCoordinates(target.href)
  if (directCoordinates) return { ...directCoordinates, mapUrl: target.href }

  for (let redirects = 0; redirects < 5; redirects += 1) {
    const response = await fetchImpl(target, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Cupo/1.0 map-link resolver' },
      signal: AbortSignal.timeout(8000),
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      target = new URL(location, target)
      if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
        throw new Error('El enlace redirigió a un sitio no compatible.')
      }

      const redirectedCoordinates = parseMapCoordinates(target.href)
      if (redirectedCoordinates) return { ...redirectedCoordinates, mapUrl: target.href }
      continue
    }

    const finalCoordinates = parseMapCoordinates(response.url || target.href)
    if (finalCoordinates) return { ...finalCoordinates, mapUrl: response.url || target.href }
    break
  }

  throw new Error('No encontramos coordenadas en ese enlace. Pega un enlace con un marcador de mapa o ingresa latitud y longitud.')
}