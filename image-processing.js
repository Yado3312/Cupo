import sharp from 'sharp'

export async function normalizeImageForRoboflow(imageBuffer) {
  return sharp(imageBuffer, { limitInputPixels: 100_000_000 })
    .rotate()
    .jpeg({ quality: 88 })
    .toBuffer()
}