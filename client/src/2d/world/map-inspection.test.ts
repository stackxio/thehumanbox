import { describe, expect, it } from 'vitest'
import type { WorldState, Building } from '../../types'
import { inspectWorldTile } from './map-inspection'
import { resolveSettlementScene } from '../scenes/settlement/resolve'
import { resolveTavernScene } from '../scenes/tavern/resolve'

function world(buildings: Building[] = []): WorldState {
  return {
    grid: {
      width: 3,
      height: 3,
      origin_x: 100,
      origin_y: 200,
      tiles: [
        [1, 3, 1],
        [1, 8, 1],
        [1, 1, 1],
      ],
      fertility: [[0.2, 0.8, 0.3]],
      biomes: [[0, 0, 0]],
    },
    buildings,
    organisms: [],
    settlements: [],
    lineage_names: { clan: 'Willow' },
    is_day: true,
  } as unknown as WorldState
}

describe('map inspection and interior access', () => {
  it('reads resources in world coordinates even when the grid has an origin', () => {
    const tile = inspectWorldTile(world(), 101, 200)
    expect(tile?.title).toBe('Wild food')
    expect(tile?.details).toContain('Fertility 80%')
    expect(inspectWorldTile(world(), 1, 1)).toBeNull()
  })
  it('opens the correct interior anywhere inside a building footprint', () => {
    const state = world([{ id: 1, kind: 'Watermill', x: 100, y: 200, footprint: [2, 2], condition: 1 }])
    expect(inspectWorldTile(state, 101, 201)?.scene).toEqual({ kind: 'mill', buildingId: 1 })
  })
  it('never offers entry into unfinished or ruined buildings', () => {
    for (const extra of [
      { condition: 0.3 },
      { condition: 1, ruined: true },
      { condition: 1, integrity: 0 },
    ]) {
      const state = world([{ id: 2, kind: 'Forge', x: 100, y: 200, ...extra }])
      expect(inspectWorldTile(state, 100, 200)?.scene).toBeNull()
    }
  })
  it('resolves canonical Tavern casing and its actual owner', () => {
    const state = world([{ id: 3, kind: 'Tavern', x: 100, y: 200, owner_lineage: 'clan', condition: 1 }])
    const scene = inspectWorldTile(state, 100, 200)?.scene
    expect(scene).toEqual({ kind: 'tavern', lineageId: 'clan' })
    expect(scene && resolveTavernScene(state, scene)).not.toBeNull()
  })
  it('counts settlement huts in the local grid instead of indexing global coordinates', () => {
    const scene = resolveSettlementScene(world(), {
      kind: 'settlement',
      centerX: 101,
      centerY: 201,
      lineageId: 'clan',
    })
    expect(scene?.subtitle).toContain('1 hut')
  })
})
