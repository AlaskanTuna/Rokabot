import { readdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const spritesDirectory = 'assets/sprites/buddies'

const spriteFiles = (await readdir(spritesDirectory)).filter((file) => file.endsWith('.png'))

const isBackgroundPixel = (red: number, green: number, blue: number) => {
  const darkest = Math.min(red, green, blue)
  const lightest = Math.max(red, green, blue)

  return darkest > 215 && lightest - darkest < 30
}

for (const file of spriteFiles) {
  const filePath = join(spritesDirectory, file)
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const background = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let queueLength = 0
  let queueIndex = 0

  const addBackgroundPixel = (x: number, y: number) => {
    const pixel = y * width + x
    const offset = pixel * 4

    if (background[pixel] || !isBackgroundPixel(data[offset], data[offset + 1], data[offset + 2])) return

    background[pixel] = 1
    queue[queueLength++] = pixel
  }

  for (let x = 0; x < width; x++) {
    addBackgroundPixel(x, 0)
    addBackgroundPixel(x, height - 1)
  }

  for (let y = 1; y < height - 1; y++) {
    addBackgroundPixel(0, y)
    addBackgroundPixel(width - 1, y)
  }

  while (queueIndex < queueLength) {
    const pixel = queue[queueIndex++]
    const x = pixel % width
    const y = Math.floor(pixel / width)

    if (x > 0) addBackgroundPixel(x - 1, y)
    if (x < width - 1) addBackgroundPixel(x + 1, y)
    if (y > 0) addBackgroundPixel(x, y - 1)
    if (y < height - 1) addBackgroundPixel(x, y + 1)
  }

  for (let pixel = 0; pixel < background.length; pixel++) {
    if (background[pixel]) data[pixel * 4 + 3] = 0
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const offset = pixel * 4
      const touchesBackground =
        (x > 0 && background[pixel - 1]) ||
        (x < width - 1 && background[pixel + 1]) ||
        (y > 0 && background[pixel - width]) ||
        (y < height - 1 && background[pixel + width])

      if (!background[pixel] && touchesBackground) data[offset + 3] = Math.round(data[offset + 3] * 0.6)
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim()
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toFile(`${filePath}.tmp`)

  await rename(`${filePath}.tmp`, filePath)
  const { size } = await stat(filePath)
  console.log(`${file}: ${size} bytes`)
}
