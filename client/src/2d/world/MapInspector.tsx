import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WorldState } from '../../types'
import { TILE } from '../../world/palette'
import { useSceneStore } from '../../stores/scene'
import { inspectWorldTile } from './map-inspection'
import { isMapControl, screenToMap, type MapCamera, type MapSize } from './camera-controls'

export function MapInspector({
  world,
  cameraRef,
  viewport,
  container,
}: {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
  container: HTMLDivElement | null
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const previous = useRef('')
  const ox = world.grid.origin_x ?? 0,
    oy = world.grid.origin_y ?? 0
  useEffect(() => {
    if (!container) return
    let last = 0
    const inspect = (e: PointerEvent) => {
      if (e.buttons || isMapControl(e.target) || performance.now() - last < 90) return
      last = performance.now()
      const rect = container.getBoundingClientRect()
      const position = screenToMap(
        cameraRef.current,
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport,
      )
      const x = Math.floor(position.x / TILE) + ox,
        y = Math.floor(position.y / TILE) + oy
      const key = `${x},${y}`
      if (previous.current !== key) {
        previous.current = key
        setPoint({ x, y })
      }
    }
    container.addEventListener('pointermove', inspect)
    // A touch release also pins a tile; the action remains available after lifting the finger.
    container.addEventListener('pointerup', inspect)
    return () => {
      container.removeEventListener('pointermove', inspect)
      container.removeEventListener('pointerup', inspect)
    }
  }, [container, cameraRef, viewport, ox, oy])
  const tile = point ? inspectWorldTile(world, point.x, point.y) : null
  if (!tile) return null
  return (
    <section className="map2d-inspector map2d-glass" data-map-ui aria-label="Tile inspector">
      <span className="map2d-eyebrow">{tile.subtitle}</span>
      <strong>{tile.title}</strong>
      {tile.details.map((detail) => (
        <span key={detail}>{detail}</span>
      ))}
      {tile.scene && (
        <button
          onClick={() => {
            if (tile.scene) useSceneStore.getState().enter(tile.scene)
          }}
        >
          {tile.action} →
        </button>
      )}
    </section>
  )
}
