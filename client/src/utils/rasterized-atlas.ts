const rasters = new WeakMap<HTMLImageElement, { src: string; canvas: HTMLCanvasElement }>()

export function rasterizedAtlas(image: HTMLImageElement): HTMLCanvasElement | null {
  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return null
  const cached = rasters.get(image)
  if (
    cached?.src === image.src &&
    cached.canvas.width === image.naturalWidth &&
    cached.canvas.height === image.naturalHeight
  )
    return cached.canvas

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)
  rasters.set(image, { src: image.src, canvas })
  return canvas
}
