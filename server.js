import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { resolveMapCoordinates } from './map-links.js'
import { summarizeWorkflowResponse } from './parking-occupancy.js'

const app = express()
app.use(express.json({ limit: '16kb' }))
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
const workspace = process.env.ROBOFLOW_WORKSPACE || 'martinalan471-s-workspace'
const workflowId = process.env.ROBOFLOW_WORKFLOW_ID || 'cupo'
const imageInput = process.env.ROBOFLOW_WORKFLOW_IMAGE_INPUT || 'image'

app.get('/api/status', (_request, response) => {
  response.json({
    configured: Boolean(process.env.ROBOFLOW_API_KEY),
    model: `${workspace}/workflows/${workflowId}`,
  })
})

app.post('/api/resolve-map-link', async (request, response) => {
  try {
    const location = await resolveMapCoordinates(request.body?.url)
    response.json(location)
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError'
    response.status(isTimeout ? 504 : 422).json({
      error: isTimeout ? 'El enlace del mapa tardó demasiado en responder.' : error.message,
    })
  }
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

  const workflowPath = [workspace, workflowId].map(encodeURIComponent).join('/')

  try {
    const inferenceResponse = await fetch(`https://serverless.roboflow.com/infer/workflows/${workflowPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ROBOFLOW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {
          [imageInput]: {
            type: 'base64',
            value: request.file.buffer.toString('base64'),
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const result = await inferenceResponse.json()

    if (!inferenceResponse.ok) {
      response.status(inferenceResponse.status).json({ error: 'Roboflow rechazó la ejecución del Workflow. Verifica la API key, el nombre del workspace/workflow y sus créditos.' })
      return
    }

    const summary = summarizeWorkflowResponse(result)
    if (!summary) {
      response.status(502).json({ error: 'El Workflow respondió, pero no encontramos una salida de detecciones. Configura una salida llamada predictions o detections.' })
      return
    }

    response.json({
      model: `${workspace}/workflows/${workflowId}`,
      ...summary,
    })
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'Roboflow tardó demasiado en responder. Su API serverless limita la ejecución de Workflows a 20 segundos.'
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