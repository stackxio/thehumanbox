import { MapInspector } from './MapInspector'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WorldState } from '../../types'
import { TILE, TILE_COLORS } from '../../world/palette'
import { oceanColor } from './landscape-style'
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
  const minimap = useRef<HTMLCanvasElement>(null)
  const brush = useRef<HTMLDivElement>(null)
  const [help, setHelp] = useState(false)
  const selectedId = useUIStore((s) => s.selectedOrgId)
  const followId = useUIStore((s) => s.followOrgId)
  const selected = world.organisms.find((org) => org.id === selectedId && org.alive)
  const ox = world.grid.origin_x ?? 0,
    oy = world.grid.origin_y ?? 0
  const living = world.organisms.filter((org) => org.alive).length
  const struggling = world.organisms.filter(
    (org) => org.alive && (org.health < 0.3 || org.energy < 0.15 || org.hydration < 0.2),
  )
  const attentionTarget = struggling.reduce<(typeof struggling)[number] | null>(
    (worst, org) =>
      !worst ||
      Math.min(org.health, org.energy, org.hydration) < Math.min(worst.health, worst.energy, worst.hydration)
        ? org
        : worst,
    null,
  )
  const latest = useRef(world)
  latest.current = world
  const { tiles, width, height, depth_map } = world.grid
  const mapW = 184,
    mapH = 92
  useEffect(() => {
    const canvas = minimap.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const terrain = document.createElement('canvas')
    terrain.width = mapW
    terrain.height = mapH
    const terrainCtx = terrain.getContext('2d')!
    for (let y = 0; y < mapH; y++)
      for (let x = 0; x < mapW; x++) {
        const row = Math.min(height - 1, Math.floor((y / mapH) * height))
        const col = Math.min(width - 1, Math.floor((x / mapW) * width))
        const tile = tiles[row]?.[col] ?? 0
        terrainCtx.fillStyle =
          tile === 2
            ? `rgb(${oceanColor(depth_map?.[row]?.[col] ?? 0).join(',')})`
            : (TILE_COLORS[tile] ?? '#638954')
        terrainCtx.fillRect(x, y, 1, 1)
      }
    let raf = 0,
      last = -Infinity
    const draw = (now: number) => {
      if (now - last > 100 && !document.hidden) {
        last = now
        ctx.drawImage(terrain, 0, 0)
        const state = latest.current
        ctx.fillStyle = '#ffe3a1'
        for (const settlement of state.settlements ?? []) {
          ctx.fillRect(
            ((settlement.center[0] - ox) / state.grid.width) * mapW - 1,
            ((settlement.center[1] - oy) / state.grid.height) * mapH - 1,
            3,
            3,
          )
        }
        const camera = cameraRef.current
        const w = (viewport.w / camera.zoom / (state.grid.width * TILE)) * mapW
        const h = (viewport.h / camera.zoom / (state.grid.height * TILE)) * mapH
        const x = (camera.x / (state.grid.width * TILE)) * mapW - w / 2
        const y = (camera.y / (state.grid.height * TILE)) * mapH - h / 2
        ctx.strokeStyle = '#132c30'
        ctx.lineWidth = 3
        ctx.strokeRect(x, y, w, h)
        ctx.strokeStyle = '#fff1c8'
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, w, h)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [tiles, width, height, depth_map, ox, oy, cameraRef, viewport.w, viewport.h])

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
      <div className="map2d-status map2d-glass" data-map-ui>
        <span className="map2d-eyebrow">
          {world.is_day ? 'DAYLIGHT' : 'NIGHTFALL'} · {world.season}
        </span>
        <strong>A living world</strong>
        <span>
          {living.toLocaleString()} people · {world.settlements?.length ?? 0} settlements
        </span>
      </div>
      <aside className="map2d-navigator map2d-glass" data-map-ui aria-label="Map navigation">
        <div className="map2d-nav-title">
          <span>WORLD MAP</span>
          <button onClick={() => setHelp(!help)} aria-expanded={help} aria-label="Map controls help">
            ?
          </button>
        </div>
        <canvas
          ref={minimap}
          width={mapW}
          height={mapH}
          role="img"
          aria-label="World minimap. Gold squares mark settlements; the frame shows your view."
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            commandRef.current = {
              kind: 'focus',
              x: ((e.clientX - rect.left) / rect.width) * world.grid.width * TILE,
              y: ((e.clientY - rect.top) / rect.height) * world.grid.height * TILE,
            }
          }}
        />
        <div className="map2d-nav-buttons">
          <button
            aria-label="Zoom out"
            onClick={() => {
              commandRef.current = { kind: 'zoom', factor: 1 / 1.3 }
            }}
          >
            −
          </button>
          <button
            onClick={() => {
              commandRef.current = { kind: 'fit' }
            }}
            title="Fit world (0)"
          >
            Fit world
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => {
              commandRef.current = { kind: 'zoom', factor: 1.3 }
            }}
          >
            +
          </button>
        </div>
        {attentionTarget && (
          <button
            className="map2d-attention"
            onClick={() => {
              useUIStore.getState().selectOrg(attentionTarget.id)
              commandRef.current = {
                kind: 'focus',
                x: (attentionTarget.x - ox) * TILE,
                y: (attentionTarget.y - oy) * TILE,
              }
            }}
          >
            {struggling.length} struggling · find someone to help →
          </button>
        )}
        {!!world.settlements?.length && (
          <select
            aria-label="Jump to settlement"
            value=""
            onChange={(e) => {
              const town = world.settlements?.[Number(e.target.value)]
              if (town)
                commandRef.current = {
                  kind: 'focus',
                  x: (town.center[0] - ox) * TILE,
                  y: (town.center[1] - oy) * TILE,
                }
            }}
          >
            <option value="" disabled>
              Explore a settlement…
            </option>
            {world.settlements.map((town, i) => (
              <option key={town.lineage_id + i} value={i}>
                {town.name} · {town.population} people
              </option>
            ))}
          </select>
        )}
        {help && (
          <p className="map2d-help">
            Drag to explore. Scroll to zoom at the cursor. Click the map, then use WASD or arrow keys to pan,
            +/− to zoom, and 0 to fit the world. Space pauses or resumes. Click a person to inspect them.
            Escape clears your tool. [ and ] cycle through people.
          </p>
        )}
      </aside>
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
      {!toolLabel && (
        <MapInspector world={world} cameraRef={cameraRef} viewport={viewport} container={container} />
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
