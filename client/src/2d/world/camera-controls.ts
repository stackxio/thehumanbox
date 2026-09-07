export interface MapCamera {
  x: number
  y: number
  zoom: number
}
export interface MapSize {
  w: number
  h: number
}
export type MapCommand =
  { kind: 'fit' } | { kind: 'zoom'; factor: number } | { kind: 'focus'; x: number; y: number }

export function clampMapCamera(camera: MapCamera, world: MapSize, viewport: MapSize): MapCamera {
  const halfW = viewport.w / (2 * camera.zoom)
  const halfH = viewport.h / (2 * camera.zoom)
  return {
    ...camera,
    x: halfW >= world.w / 2 ? world.w / 2 : Math.max(halfW, Math.min(world.w - halfW, camera.x)),
    y: halfH >= world.h / 2 ? world.h / 2 : Math.max(halfH, Math.min(world.h - halfH, camera.y)),
  }
}

export function zoomMapAt(
  camera: MapCamera,
  zoom: number,
  point: { x: number; y: number },
  viewport: MapSize,
): MapCamera {
  const dx = point.x - viewport.w / 2
  const dy = point.y - viewport.h / 2
  return { x: camera.x + dx / camera.zoom - dx / zoom, y: camera.y + dy / camera.zoom - dy / zoom, zoom }
}

export function screenToMap(camera: MapCamera, point: { x: number; y: number }, viewport: MapSize) {
  return {
    x: camera.x + (point.x - viewport.w / 2) / camera.zoom,
    y: camera.y + (point.y - viewport.h / 2) / camera.zoom,
  }
}

export function isMapControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('button, input, select, textarea, a, [contenteditable="true"], [data-map-ui]')
  )
}
