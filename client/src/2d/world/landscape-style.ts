import { BIOME_ID, TILE_ID } from '../../world/terrain-ids'

/** Wire depth is inverse: 0 is deep ocean, 200 is the shoreline. */
export function oceanColor(wireDepth: number): [number, number, number] {
  const shallow = Math.max(0, Math.min(1, wireDepth / 200))
  const stops = [
    [24, 55, 91],
    [35, 105, 135],
    [75, 166, 172],
  ] as const
  const segment = shallow < 0.65 ? 0 : 1
  const blend = segment === 0 ? shallow / 0.65 : (shallow - 0.65) / 0.35
  return stops[segment].map((channel, index) =>
    Math.round(channel + (stops[segment + 1][index] - channel) * blend),
  ) as [number, number, number]
}

export function shorelineColors(tile: number, biome: number): readonly [string, string] {
  if (tile === TILE_ID.SNOW || biome === BIOME_ID.TUNDRA) return ['#99b6c5', '#e3eff1']
  if (tile === TILE_ID.ROCK || biome === BIOME_ID.VOLCANIC) return ['#555965', '#93949a']
  if (biome === BIOME_ID.WETLAND) return ['#61785b', '#9ca976']
  return ['#b99b65', '#e0c48a']
}

/** The simulation uses ecological phase names; older snapshots use calendar seasons. */
export function vegetationSeason(season: string): string {
  return (
    (
      { recovery: 'spring', abundance: 'summer', decline: 'autumn', scarcity: 'winter' } as Record<
        string,
        string
      >
    )[season] ?? season
  )
}

/** Integer multiplication preserves random low bits even at large world coordinates. */
export function landscapeHash(x: number, y: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return (hash ^ (hash >>> 16)) >>> 0
}
