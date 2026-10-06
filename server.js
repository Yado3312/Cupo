import 'dotenv/config'
import express from 'express'
import multer from 'multer'

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith('image/')) {
      callback(null, true)
      return
    }

    callback(new Error('El archivo debe ser una imagen.'))
  },
})

const port = Number(process.env.API_PORT || 3001)
const modelId = process.env.ROBOFLOW_MODEL_ID || 'coco/40'

app.get('/api/status', (_request, response) => {
  response.json({
    configured: Boolean(process.env.ROBOFLOW_API_KEY),
    model: modelId,
  })
})

app.post('/api/analyze', upload.single('image'), async (request, response) => {
  if (!process.env.ROBOFLOW_API_KEY) {
    response.status(503).json({ error: 'Agrega ROBOFLOW_API_KEY en el archivo .env para activar el análisis.' })
    return
  }

  if (!request.file) {
    response.status(400).json({ error: 'Selecciona una imagen para analizar.' })
    return
  }

  const modelPath = modelId.split('/').map(encodeURIComponent).join('/')

  try {
    const inferenceResponse = await fetch(`https://serverless.roboflow.com/${modelPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ROBOFLOW_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: request.file.buffer.toString('base64'),
      signal: AbortSignal.timeout(60_000),
    })

    const result = await inferenceResponse.json()

    if (!inferenceResponse.ok) {
      response.status(inferenceResponse.status).json({
        error: result.error || 'Roboflow no pudo analizar la imagen. Revisa el modelo y tu API key.',
      })
      return
    }

    if (!Array.isArray(result.predictions)) {
      response.status(502).json({ error: 'El modelo respondió en un formato inesperado.' })
      return
    }

    const vehicleClasses = new Set(['car', 'truck', 'bus', 'motorcycle', 'vehicle'])
    const vehicles = result.predictions.filter((prediction) =>
      vehicleClasses.has(String(prediction.class).toLowerCase()),
    )

    response.json({
      model: modelId,
      image: result.image || null,
      vehicleCount: vehicles.length,
      detections: vehicles.map(({ x, y, width, height, class: label, confidence }) => ({
        x,
        y,
        width,
        height,
        label,
        confidence,
      })),
    })
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'Roboflow tardó demasiado en responder. Intenta de nuevo.'
      : 'No se pudo conectar con Roboflow. Comprueba tu conexión e inténtalo de nuevo.'
    response.status(502).json({ error: message })
  }
})

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: 'La imagen supera el límite de 10 MB.' })
    return
  }

  response.status(400).json({ error: error.message || 'No se pudo procesar el archivo.' })
})

app.listen(port, () => {
  console.log(`Cupo API disponible en http://localhost:${port}`)
})