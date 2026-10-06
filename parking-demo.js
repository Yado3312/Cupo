const demoSpots = [
  { x: 0.18, y: 0.285, state: 'libre' },
  { x: 0.28, y: 0.285, state: 'libre' },
  { x: 0.39, y: 0.285, state: 'ocupado' },
  { x: 0.49, y: 0.285, state: 'libre' },
  { x: 0.69, y: 0.285, state: 'libre' },
  { x: 0.80, y: 0.285, state: 'ocupado' },
  { x: 0.91, y: 0.285, state: 'libre' },
  { x: 0.31, y: 0.55, state: 'libre' },
  { x: 0.42, y: 0.55, state: 'ocupado' },
  { x: 0.53, y: 0.55, state: 'libre' },
  { x: 0.76, y: 0.72, state: 'libre' },
  { x: 0.88, y: 0.72, state: 'ocupado' },
]

export function createDemoParkingOverlay(width, height) {
  const imageWidth = Math.max(1, Number(width) || 1280)
  const imageHeight = Math.max(1, Number(height) || 720)
  const boxWidth = imageWidth * 0.055
  const boxHeight = imageHeight * 0.16
  const detections = demoSpots.map((spot) => ({
    x: imageWidth * spot.x,
    y: imageHeight * spot.y,
    width: boxWidth,
    height: boxHeight,
    class: `DEMO · ${spot.state}`,
    state: spot.state,
    confidence: null,
  }))

  return {
    demo: true,
    availableSpaces: demoSpots.filter((spot) => spot.state === 'libre').length,
    occupiedSpaces: demoSpots.filter((spot) => spot.state === 'ocupado').length,
    vehicleCount: 0,
    detections,
  }
}