import { describe, expect, it } from 'vitest'
import { oceanColor, shorelineColors, landscapeHash, vegetationSeason } from './landscape-style'
import { BIOME_ID, TILE_ID } from '../../world/terrain-ids'

describe('landscape art direction', () => {
  it('uses the inverse wire depth to keep deep water darker than shallows', () => {
    const deep = oceanColor(0)
    const shallow = oceanColor(200)
    expect(shallow[1]).toBeGreaterThan(deep[1])
    expect(oceanColor(220)).toEqual(shallow)
    expect(oceanColor(-1)).toEqual(deep)
  })
  it('keeps snowy, rocky, wetland and sandy coastlines visually distinct', () => {
    const shores = [
      shorelineColors(TILE_ID.SNOW, BIOME_ID.TUNDRA),
      shorelineColors(TILE_ID.ROCK, BIOME_ID.GRASSLAND),
      shorelineColors(TILE_ID.GRASS, BIOME_ID.WETLAND),
      shorelineColors(TILE_ID.SAND, BIOME_ID.DESERT),
    ]
    expect(new Set(shores.map((shore) => shore.join())).size).toBe(4)
  })
})

describe('natural decoration placement', () => {
  it('preserves random low bits instead of carpeting every tile with decorations', () => {
    let flowers = 0
    const buckets = new Set<number>()
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) {
        const sample = landscapeHash(x + 100000, y - 100000) & 255
        buckets.add(sample)
        if (sample / 255 < 0.06) flowers++
      }
    expect(buckets.size).toBeGreaterThan(240)
    expect(flowers).toBeGreaterThan(400)
    expect(flowers).toBeLessThan(850)
    expect(landscapeHash(700, -12)).toBe(landscapeHash(700, -12))
  })
  it('uses actual ecological seasons for the tree atlas variants', () => {
    expect(vegetationSeason('decline')).toBe('autumn')
    expect(vegetationSeason('scarcity')).toBe('winter')
    expect(vegetationSeason('abundance')).toBe('summer')
    expect(vegetationSeason('recovery')).toBe('spring')
    expect(vegetationSeason('autumn')).toBe('autumn')
  })
})
