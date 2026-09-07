import type { SceneContext, SceneFixture, SceneId, SceneOccupant } from '../../../scenes/core/types'
import type { WorldState } from '../../../types'

const RADIUS = 12

export function resolveSettlementScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'settlement') return null
  const { centerX, centerY, lineageId } = scene
  const lineageName = world.lineage_names?.[lineageId] ?? lineageId.slice(0, 6)

  const inside: SceneOccupant[] = []
  const away: SceneOccupant[] = []
  let hutCount = 0
  const tiles = world.grid?.tiles
  if (tiles) {
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      const row = tiles[centerY - (world.grid.origin_y ?? 0) + dy]
      if (!row) continue
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (row[centerX - (world.grid.origin_x ?? 0) + dx] === 8) hutCount++
      }
    }
  }

  for (const o of world.organisms) {
    if (!o.alive) continue
    if (o.lineage_id !== lineageId) continue
    const d = Math.abs(o.x - centerX) + Math.abs(o.y - centerY)
    if (d > RADIUS) continue
    const entry: SceneOccupant = {
      org: o,
      role: o.is_leader ? 'host' : 'kin',
      activity: o.thought || 'idling',
    }
    if (d <= 5) inside.push(entry)
    else away.push(entry)
  }

  const fixtures: SceneFixture[] = [
    { id: 'square-fire', kind: 'square_fire', x: 6, y: 5 },
    { id: 'well', kind: 'well', x: 2, y: 5 },
    { id: 'cart', kind: 'cart', x: 10, y: 4 },
    { id: 'stall-1', kind: 'stall', x: 3, y: 2 },
    { id: 'stall-2', kind: 'stall', x: 9, y: 2 },
    { id: 'hut-l', kind: 'small_hut', x: 1, y: 7 },
    { id: 'hut-r', kind: 'small_hut', x: 11, y: 7 },
  ]

  return {
    scene,
    world,
    title: `${lineageName} village`,
    subtitle: `Town square · ${hutCount} hut${hutCount === 1 ? '' : 's'} · ${inside.length + away.length} residents`,
    isDay: !!world.is_day,
    occupants: inside.slice(0, 8),
    away: away.slice(0, 16),
    fixtures,
  }
}
