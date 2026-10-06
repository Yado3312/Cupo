# Cupo

Buscador de estacionamientos con mapa interactivo, filtros por destino y análisis visual de vehículos con la API alojada de Roboflow.

Incluye dos vistas de demostración con el selector superior: **Usuario** consulta el mapa y **Centro o lugar** registra establecimientos con coordenadas, capacidad y tipo, y administra su lectura. Los registros se guardan en `localStorage` de ese navegador. No son cuentas autenticadas y todavía no hay sincronización entre dispositivos.

## Iniciar

### Con Docker (macOS, Linux y Windows)

Instala Docker Desktop en macOS/Windows o Docker Engine con el plugin Compose en Linux. Desde la carpeta del proyecto ejecuta:

```bash
docker compose up --build -d
```

Abre `http://localhost:3000`. La primera ejecución compila la interfaz y crea el contenedor; no necesitas instalar Node.js en la máquina. Para ver los logs usa `docker compose logs -f cupo`; para detenerlo usa `docker compose down`.

Docker Compose lee `.env` si existe. La app funciona en modo demo sin credenciales; para Roboflow copia `.env.example` a `.env`, agrega tu `ROBOFLOW_API_KEY` y vuelve a ejecutar `docker compose up --build -d`. Cambia `CUPO_PORT` en `.env` si el puerto 3000 ya está ocupado. La clave no se copia a la imagen Docker.

### Desplegar en Vercel

1. Sube el repositorio a GitHub, GitLab o Bitbucket y en [Vercel](https://vercel.com/new) selecciona **Add New Project** para importarlo.
2. Usa el preset **Vite**. `vercel.json` configura `npm ci --include=dev` como Install Command, `npm run build` como Build Command y `dist` como Output Directory.
3. En **Project Settings → Environment Variables**, agrega `ROBOFLOW_API_KEY`, `ROBOFLOW_WORKSPACE`, `ROBOFLOW_WORKFLOW_ID` y `ROBOFLOW_WORKFLOW_IMAGE_INPUT`. Usa `martinalan471-s-workspace`, `cupo` e `image` para las últimas tres. No uses el prefijo `VITE_` en la clave.
4. Asigna las variables a Production y Preview, guarda y vuelve a desplegar.

También puedes desplegar desde la terminal con `npx vercel` y publicar producción con `npx vercel --prod`. Para probar localmente con el mismo enrutamiento usa `npx vercel dev` después de vincular el proyecto y cargar las variables con `npx vercel env pull`.

Vercel sirve el frontend estático desde `dist/` y las rutas `/api/*` mediante la Function `api/[...path].js`, que reutiliza la app Express. Las imágenes subidas se limitan a 4 MB para respetar el máximo de payload de Vercel Functions; si necesitas procesar imágenes mayores o video continuo, usa Docker en un servidor/servicio de contenedores. La cámara del navegador requiere HTTPS, que Vercel proporciona en el dominio desplegado.

### Desarrollo local

```bash
npm install
npm run dev
```

Abre la URL que muestra Vite, normalmente `http://localhost:5173`. En Centro o lugar, registra un establecimiento con latitud, longitud y capacidad; después sube una imagen o conecta la cámara. El usuario consulta los lugares en el mapa y selecciona un marcador para ver su ficha. Los lugares registrados localmente solo aparecen en ese navegador hasta conectar una base de datos compartida.

## Configurar Roboflow Workflow

El `.env` local ya tiene configurado el workspace `martinalan471-s-workspace`, el Workflow `cupo` y su entrada `image`. `.env` está ignorado por Git. Si reemplazas la clave, añádela en `ROBOFLOW_API_KEY` y reinicia el servidor.

El servidor normaliza las imágenes subidas (incluido AVIF) a JPEG y las envía como base64 a `POST https://serverless.roboflow.com/infer/workflows/{workspace}/{workflow}`, con autorización Bearer. La clave solo se lee en el servidor y nunca se devuelve al frontend. Las imágenes se limitan a 4 MB; los errores de decodificación y las respuestas HTTP de Roboflow se muestran en el panel sin revelar la clave.

La vista Centro o lugar puede leer la cámara disponible en el navegador y enviar un cuadro cada 10 segundos. Requiere permiso de cámara y conexión segura (`localhost` funciona para desarrollo). Para una cámara IP/RTSP o una operación 24/7 se requiere un agente de inferencia en edge/servidor; no se debe exponer la cámara directamente al navegador.

El Workflow debe tener una entrada de imagen llamada `image` y devolver una salida `predictions` o `detections` con clases explícitas de cajón libre/ocupado, por ejemplo `empty parking space` y `occupied parking spot`. Por seguridad, detecciones de autos no se convierten en espacios libres. Ajusta `ROBOFLOW_WORKFLOW_IMAGE_INPUT` si la entrada tiene otro nombre y entrena/calibra el Workflow para el ángulo fijo de la cámara.

La API serverless de Workflows limita cada ejecución a 20 segundos. El sondeo de cámara está espaciado a 10 segundos, pero no es un sistema de streaming de producción; para CCTV/RTSP y baja latencia, despliega Inference/WebRTC en edge o usa un despliegue dedicado.

## RapidAPI

RapidAPI es un marketplace, no una API única de estacionamientos. Todavía no hay un proveedor RapidAPI conectado: hace falta elegir un API concreto para descubrir/enriquecer lugares y definir su endpoint, plan y formato de respuesta. La disponibilidad debe seguir viniendo del sistema del establecimiento (cámara/sensores), no de un directorio de lugares. No se inventó un endpoint ni una API key para esta demo.

## Comandos

- `npm run dev`: interfaz Vite y API local.
- `npm run build`: compilación de producción de la interfaz.
- `npm run lint`: revisión con Oxlint.

La API alojada y el mapa requieren conexión a internet. El uso de inferencia puede consumir créditos de Roboflow.# Cupo
