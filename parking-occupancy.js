const vehicleClasses = new Set(['car', 'truck', 'bus', 'motorcycle', 'vehicle'])
const availableSpaceClasses = new Set([
  'available',
  'available_space',
  'empty',
  'empty_space',
  'empty_parking_space',
  'free',
  'free_space',
  'free_parking_space',
  'parking_space_available',
  'vacant',
  'vacant_parking_spot',
])
const occupiedSpaceClasses = new Set([
  'occupied',
  'occupied_space',
  'occupied_parking_spot',
  'parking_space_occupied',
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

export function summarizeWorkflowResponse(response) {
  const predictions = findPredictions(response?.outputs ?? response)
  return predictions ? summarizePredictions(predictions) : null
}