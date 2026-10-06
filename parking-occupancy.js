const vehicleClasses = new Set(['car', 'truck', 'bus', 'motorcycle', 'vehicle'])
const availableSpaceClasses = new Set([
  'available',
  'available_parking_space',
  'available_parking_slot',
  'available_slot',
  'available_space',
  'available_spot',
  'available_stall',
  'empty',
  'empty_space',
  'empty_parking_space',
  'empty_slot',
  'empty_spot',
  'free',
  'free_space',
  'free_parking_space',
  'free_parking_slot',
  'free_slot',
  'parking_space_available',
  'parking_slot_available',
  'vacant',
  'vacant_space',
  'vacant_parking_spot',
  'espacios_disponibles',
  'espacios_libres',
  'cajones_disponibles',
  'cajones_libres',
  'lugares_disponibles',
  'lugares_libres',
])
const occupiedSpaceClasses = new Set([
  'occupied',
  'occupied_parking_space',
  'occupied_parking_slot',
  'occupied_space',
  'occupied_parking_spot',
  'occupied_slot',
  'parking_space_occupied',
  'parking_slot_occupied',
  'espacios_ocupados',
  'cajones_ocupados',
  'lugares_ocupados',
])

export function summarizePredictions(predictions) {
  const normalized = predictions.map((prediction) => ({
    ...prediction,
    normalizedClass: String(prediction.class).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  }))
  const availableSpaces = normalized.filter(({ normalizedClass }) => availableSpaceClasses.has(normalizedClass))
  const occupiedSpaces = normalized.filter(({ normalizedClass }) => occupiedSpaceClasses.has(normalizedClass))
  const vehicles = normalized.filter(({ normalizedClass }) => vehicleClasses.has(normalizedClass))
  const hasSpaceClasses = availableSpaces.length + occupiedSpaces.length > 0

  return {
    vehicleCount: vehicles.length,
    availableSpaces: hasSpaceClasses ? availableSpaces.length : null,
    occupiedSpaces: hasSpaceClasses ? occupiedSpaces.length : null,
    detections: normalized.map(({ normalizedClass: _normalizedClass, ...prediction }) => prediction),
  }
}

function findPredictions(value, propertyName = '', depth = 0) {
  if (depth > 8 || value == null) return null

  if (Array.isArray(value)) {
    if (/prediction|detection/i.test(propertyName)) {
      if (value.length === 0 || value.every((item) => item && typeof item.class === 'string')) return value
    }

    if (value.length > 0 && value.every((item) => item && typeof item === 'object' && typeof item.class === 'string')) {
      return value
    }

    for (const item of value) {
      const nested = findPredictions(item, propertyName, depth + 1)
      if (nested) return nested
    }
    return null
  }

  if (typeof value !== 'object') return null

  const entries = Object.entries(value).sort(([first], [second]) => {
    const priority = (name) => /prediction|detection/i.test(name) ? 0 : 1
    return priority(first) - priority(second)
  })

  for (const [name, nestedValue] of entries) {
    const nested = findPredictions(nestedValue, name, depth + 1)
    if (nested) return nested
  }

  return null
}

function normalizedOutputName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/^(num|number_of|count_of)_/, '')
    .replace(/_(count|total|number)$/, '')
}

function findSpaceCounts(value, counts = { available: null, occupied: null, total: null }, depth = 0) {
  if (depth > 8 || value == null || typeof value !== 'object') return counts

  if (Array.isArray(value)) {
    for (const item of value) findSpaceCounts(item, counts, depth + 1)
    return counts
  }

  for (const [name, fieldValue] of Object.entries(value)) {
    const normalizedName = normalizedOutputName(name)
    const numericValue = typeof fieldValue === 'number' ? fieldValue : null

    if (numericValue !== null && Number.isFinite(numericValue) && numericValue >= 0) {
      if (['available', 'available_space', 'available_spaces', 'available_parking_spaces', 'available_parking_slots', 'available_slots', 'available_spot', 'available_spots', 'free_space', 'free_spaces', 'free_parking_spaces', 'free_parking_slots', 'free_slots', 'free_spots', 'vacant_spaces', 'vacant_spots', 'empty_spaces', 'empty_slots', 'spaces_available', 'spaces_free', 'parking_spaces_available', 'parking_slots_available', 'espacios_disponibles', 'espacios_libres', 'cajones_disponibles', 'cajones_libres', 'lugares_disponibles', 'lugares_libres'].includes(normalizedName)) {
        counts.available ??= Math.floor(numericValue)
      } else if (['occupied', 'occupied_space', 'occupied_spaces', 'occupied_parking_spaces', 'occupied_parking_slots', 'occupied_slots', 'occupied_spots', 'used_spaces', 'used_slots', 'used_spots', 'spaces_occupied', 'parking_spaces_occupied', 'parking_slots_occupied', 'espacios_ocupados', 'cajones_ocupados', 'lugares_ocupados'].includes(normalizedName)) {
        counts.occupied ??= Math.floor(numericValue)
      } else if (['total_spaces', 'total_parking_spaces', 'total_parking_slots', 'total_stalls', 'parking_spaces', 'parking_slots', 'space_capacity', 'parking_capacity', 'total_capacity', 'capacity', 'capacidad_total', 'total_cajones'].includes(normalizedName)) {
        counts.total ??= Math.floor(numericValue)
      }
    }

    if (fieldValue && typeof fieldValue === 'object') findSpaceCounts(fieldValue, counts, depth + 1)
  }

  return counts
}

export function listWorkflowOutputNames(response) {
  const outputs = response?.outputs ?? response
  const outputItems = Array.isArray(outputs) ? outputs : [outputs]
  return [...new Set(outputItems.flatMap((item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item) : [],
  ))].slice(0, 12)
}

export function summarizeWorkflowResponse(response) {
  const outputs = response?.outputs ?? response
  const predictions = findPredictions(outputs)
  if (predictions) return summarizePredictions(predictions)

  const counts = findSpaceCounts(outputs)
  const availableSpaces = counts.available ?? (counts.total !== null && counts.occupied !== null
    ? Math.max(0, counts.total - counts.occupied)
    : null)
  const occupiedSpaces = counts.occupied ?? (counts.total !== null && availableSpaces !== null
    ? Math.max(0, counts.total - availableSpaces)
    : null)

  if (availableSpaces === null && occupiedSpaces === null) return null

  return {
    vehicleCount: 0,
    availableSpaces,
    occupiedSpaces,
    detections: [],
  }
}