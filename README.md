# Cupo

Buscador de estacionamientos con mapa interactivo, filtros por destino y análisis visual de vehículos con la API alojada de Roboflow.

## Iniciar

```bash
npm install
npm run dev
```

Abre la URL que muestra Vite, normalmente `http://localhost:5173`. El tablero funciona en modo demo sin credenciales; los lugares y espacios de Ciudad de México son datos de muestra, no disponibilidad en tiempo real.

## Activar Roboflow

1. Copia `.env.example` a `.env`.
2. Agrega tu API key de Roboflow en `ROBOFLOW_API_KEY`. Puedes obtenerla en [Roboflow API settings](https://app.roboflow.com/settings/api).
3. Deja `ROBOFLOW_MODEL_ID=coco/40` para usar el modelo público del ejemplo oficial, o indica el ID de otro modelo compatible.
4. Reinicia `npm run dev`.

La aplicación envía la imagen al servidor local, que llama a `POST https://serverless.roboflow.com/{modelo}` con autorización Bearer. La clave solo se lee en el servidor y `.env` está excluido de Git. Las imágenes se limitan a 10 MB.

El botón **Analizar imagen** detecta autos, camiones, autobuses y motocicletas, dibuja sus detecciones y permite aplicar una estimación a la ubicación seleccionada. Para anunciar disponibilidad real y continua se requiere conectar cámaras o sensores, definir los cajones por estacionamiento, entrenar/calibrar el modelo para esa vista y persistir las lecturas en un servicio de datos. Una foto aislada no confirma cuáles cajones están libres.

## Comandos

- `npm run dev`: interfaz Vite y API local.
- `npm run build`: compilación de producción de la interfaz.
- `npm run lint`: revisión con Oxlint.

La API alojada y el mapa requieren conexión a internet. El uso de inferencia puede consumir créditos de Roboflow.# Cupo
