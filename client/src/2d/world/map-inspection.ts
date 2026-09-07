import type { WorldState } from '../../types'
import type { SceneId } from '../../scenes/core/types'
import { buildingContainsWorldTile, getBuildingState } from '../../world/building-state'

const TILE_NAMES: Record<number, string> = {
  0: 'Uncharted',
  1: 'Meadow',
  2: 'Water',
  3: 'Wild food',
  4: 'Fire',
  5: 'Rock',
  6: 'Ash',
  7: 'Campfire',
  8: 'Shelter',
  9: 'Floodwater',
  10: 'Minerals',
  11: 'Scorched earth',
  12: 'Snow',
  13: 'Sand',
}
const BIOME_NAMES = ['Grassland', 'Forest', 'Desert', 'Wetland', 'Tundra', 'Volcanic']
export interface TileInspection {
  title: string
  subtitle: string
  details: string[]
  scene: SceneId | null
  action: string | null
}

export function inspectWorldTile(world: WorldState, x: number, y: number): TileInspection | null {
  const col = x - (world.grid.origin_x ?? 0),
    row = y - (world.grid.origin_y ?? 0)
  if (col < 0 || row < 0 || col >= world.grid.width || row >= world.grid.height) return null
  const tile = world.grid.tiles[row]?.[col]
  if (tile === undefined) return null
  const result: TileInspection = {
    title: TILE_NAMES[tile] ?? 'Terrain',
    subtitle: `${BIOME_NAMES[world.grid.biomes?.[row]?.[col] ?? 0] ?? 'Wilderness'} · ${x}, ${y}`,
    details: [],
    scene: null,
    action: null,
  }
  const fertility = world.grid.fertility?.[row]?.[col]
  const hazard = world.grid.hazard?.[row]?.[col]
  if (fertility !== undefined && tile !== 2)
    result.details.push(`Fertility ${Math.round(Math.max(0, Math.min(1, fertility)) * 100)}%`)
  if (hazard !== undefined && hazard > 0)
    result.details.push(`Hazard ${Math.round(Math.max(0, Math.min(1, hazard)) * 100)}%`)
  if (tile === 3) result.details.push('Wild food is available here')
  if (tile === 10) result.details.push('Minerals can support crafting')
  if (tile === 9) result.details.push('Flooded ground')

  const building = world.buildings
    ?.filter((item) => buildingContainsWorldTile(item, x, y))
    .sort((a, b) => b.y - a.y || b.id - a.id)[0]
  if (building) {
    const state = getBuildingState(building)
    result.title = building.kind.replace(/([a-z])([A-Z])/g, '$1 $2')
    result.details = [
      `${state.phase} · ${Math.round(state.integrity * 100)}% integrity`,
      `${Math.round(state.constructionProgress * 100)}% built`,
    ]
    const kind = building.kind.toLowerCase()
    if (state.isOperational) {
      if (['forge', 'smithy', 'workshop'].includes(kind))
        result.scene = { kind: 'forge', buildingId: building.id }
      else if (kind === 'bakery') result.scene = { kind: 'bakery', buildingId: building.id }
      else if (['mill', 'windmill', 'watermill'].includes(kind))
        result.scene = { kind: 'mill', buildingId: building.id }
    }
    const owner = building.owner_lineage ?? building.lineage_id
    if (state.isOperational && owner && kind === 'tavern') result.scene = { kind: 'tavern', lineageId: owner }
    if (
      state.isOperational &&
      owner &&
      ['temple', 'cathedral', 'shrine', 'mosque', 'synagogue', 'pagoda'].includes(kind)
    ) {
      const religion = world.religions?.find((entry) => (entry.founder_lineage ?? entry.lineage_id) === owner)
      if (religion) result.scene = { kind: 'temple', religionId: religion.id }
    }
    if (result.scene) result.action = 'Enter interior'
    if (!state.isOperational) return result
  }
  if (!result.scene && tile === 8) {
    const host = world.organisms.find(
      (org) => org.alive && Math.floor(org.home_x) === x && Math.floor(org.home_y) === y,
    )
    if (host) {
      result.scene = { kind: 'home', orgId: host.id }
      result.action = 'Visit home'
    }
  }
  if (!result.scene) {
    const settlement = world.settlements?.find(
      (town) => Math.hypot(town.center[0] - x, town.center[1] - y) <= 4,
    )
    if (settlement) {
      result.scene = {
        kind: 'settlement',
        centerX: Math.round(settlement.center[0]),
        centerY: Math.round(settlement.center[1]),
        lineageId: settlement.lineage_id,
      }
      result.action = `Visit ${settlement.name}`
    }
  }
  return result
}
