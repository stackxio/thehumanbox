import { useEffect, useRef, type MutableRefObject } from 'react'
import type { WorldState } from '../../types'
import { TILE } from '../../world/palette'
import { isMapControl, screenToMap, type MapCamera, type MapCommand, type MapSize } from './camera-controls'
import { useUIStore } from '../../stores/store'
import './world-map.css'

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  commandRef: MutableRefObject<MapCommand | null>
  viewport: MapSize
  container: HTMLDivElement | null
  toolLabel?: string | null
  toolStatus?: string | null
  toolRadius?: number
}

export function WorldMapHud({
  world,
  cameraRef,
  commandRef,
  viewport,
  container,
  toolLabel,
  toolRadius = 0,
  toolStatus,
}: Props) {
  const brush = useRef<HTMLDivElement>(null)
  const selectedId = useUIStore((s) => s.selectedOrgId)
  const followId = useUIStore((s) => s.followOrgId)
  const selected = world.organisms.find((org) => org.id === selectedId && org.alive)
  const ox = world.grid.origin_x ?? 0,
    oy = world.grid.origin_y ?? 0
  useEffect(() => {
    const ring = brush.current
    if (!container || !ring || !toolLabel) return
    const move = (e: PointerEvent) => {
      if (isMapControl(e.target)) {
        ring.style.display = 'none'
        return
      }
      const rect = container.getBoundingClientRect()
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const position = screenToMap(cameraRef.current, point, viewport)
      const tileX = Math.round(position.x / TILE + ox) - ox
      const tileY = Math.round(position.y / TILE + oy) - oy
      const inside = tileX >= 0 && tileY >= 0 && tileX < world.grid.width && tileY < world.grid.height
      ring.style.display = inside ? 'block' : 'none'
      const size = Math.max(12, (toolRadius * 2 + 1) * TILE * cameraRef.current.zoom)
      ring.style.width = `${size}px`
      ring.style.height = `${size}px`
      ring.style.left = `${((tileX + 0.5) * TILE - cameraRef.current.x) * cameraRef.current.zoom + viewport.w / 2}px`
      ring.style.top = `${((tileY + 0.5) * TILE - cameraRef.current.y) * cameraRef.current.zoom + viewport.h / 2}px`
    }
    const leave = () => {
      ring.style.display = 'none'
    }
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerleave', leave)
    container.addEventListener('wheel', leave)
    return () => {
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerleave', leave)
      container.removeEventListener('wheel', leave)
    }
  }, [container, toolLabel, toolRadius, cameraRef, viewport, world.grid.width, world.grid.height, ox, oy])

  const focusSelected = () => {
    if (selected)
      commandRef.current = { kind: 'focus', x: (selected.x - ox) * TILE, y: (selected.y - oy) * TILE }
  }
  return (
    <>
      {selected && !toolLabel && (
        <section className="map2d-person map2d-glass" data-map-ui aria-label="Selected person">
          <div>
            <span className="map2d-eyebrow">
              {followId === selected.id ? 'FOLLOWING' : 'SELECTED PERSON'}
            </span>
            <strong>{selected.name}</strong>
            <span>{selected.thought || 'Exploring the world'}</span>
          </div>
          <div className="map2d-vitals">
            {[
              ['Health', selected.health],
              ['Energy', selected.energy],
              ['Water', selected.hydration],
            ].map(([label, value]) => (
              <label key={label as string}>
                {label}
                <meter min={0} max={1} value={Number(value)} aria-label={label as string} />
              </label>
            ))}
          </div>
          <div className="map2d-person-actions">
            <button onClick={focusSelected}>Find on map</button>
            <button
              onClick={() => useUIStore.getState().followOrg(followId === selected.id ? null : selected.id)}
            >
              {followId === selected.id ? 'Stop following' : 'Follow'}
            </button>
          </div>
        </section>
      )}
      {toolLabel && (
        <div className="map2d-tool-hint map2d-glass" data-map-ui role="status">
          <strong>{toolLabel}</strong>
          <span>
            {toolStatus?.includes('applied') || toolStatus?.includes('failed')
              ? toolStatus
              : 'Click to apply · drag to pan · Esc to cancel'}
          </span>
        </div>
      )}
      {toolLabel && <div className="map2d-brush" ref={brush} aria-hidden="true" />}
    </>
  )
}
