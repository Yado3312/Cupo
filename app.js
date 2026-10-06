import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeImageForRoboflow } from './image-processing.js'
import { resolveMapCoordinates } from './map-links.js'
import { listWorkflowOutputNames, summarizeWorkflowResponse } from './parking-occupancy.js'

const app = express()
const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.join(appDirectory, 'dist')

app.use(express.json({ limit: '16kb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith('image/')) {
      callback(null, true)
      return
    }

    callback(new Error('El archivo debe ser una imagen.'))
  },
})

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

  let jpegBuffer
  try {
    jpegBuffer = await normalizeImageForRoboflow(request.file.buffer)
  } catch {
    response.status(415).json({ error: 'No se pudo decodificar la imagen. Prueba con JPG, PNG, WebP o AVIF válido.' })
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
            value: jpegBuffer.toString('base64'),
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const responseText = await inferenceResponse.text()
    let result = {}
    try {
      result = JSON.parse(responseText)
    } catch {
      result = {}
    }

    if (!inferenceResponse.ok) {
      const remoteMessage = [result.error, result.message, result.detail]
        .find((value) => typeof value === 'string' && value.trim())
      const safeMessage = (remoteMessage || 'Revisa la API key, el workspace, el Workflow y sus créditos.')
        .replaceAll(process.env.ROBOFLOW_API_KEY, '[oculta]')
        .slice(0, 240)
      response.status(inferenceResponse.status).json({
        error: `Roboflow respondió HTTP ${inferenceResponse.status}: ${safeMessage}`,
      })
      return
    }

    const summary = summarizeWorkflowResponse(result)
    if (!summary) {
      const outputNames = listWorkflowOutputNames(result)
      const outputsDescription = outputNames.length ? outputNames.join(', ') : 'ningún campo de salida'
      const outputError = Array.isArray(result.outputs) && result.outputs.length === 0
        ? 'El Workflow cupo devolvió outputs vacío. En Roboflow agrega un JsonField llamado predictions con el selector de predicciones del bloque de detección, guarda y publica el Workflow.'
        : `El Workflow respondió, pero no encontramos conteos de cajones ni detecciones. Campos recibidos: ${outputsDescription}. Agrega un JsonField llamado predictions conectado a las predicciones del bloque de detección y publica el Workflow.`
      response.status(502).json({
        error: outputError,
      })
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

if (!process.env.VERCEL) {
  app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      next()
      return
    }

    response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
      if (error) next(error)
    })
  })
}

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: 'La imagen supera el límite de 4 MB.' })
    return
  }

  response.status(400).json({ error: error.message || 'No se pudo procesar el archivo.' })
})

export default app