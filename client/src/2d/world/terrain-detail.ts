import { TILE_ID } from '../../world/terrain-ids'

/** Quiet, directional surface marks rather than uniform television-static grain. */
export function terrainDetail(tile: number, x: number, y: number): number {
  const cellX = Math.floor(x / 6),
    cellY = Math.floor(y / 5)
  const hash = Math.imul(cellX, 374761393) ^ Math.imul(cellY, 668265263)
  const px = ((x % 6) + 6) % 6,
    py = ((y % 5) + 5) % 5
  if (tile === TILE_ID.SAND) {
    const ridge = (y + Math.floor(x / 12) + ((hash >>> 6) & 1)) % 7
    return ridge === 0 ? 9 : ridge === 1 ? -4 : 0
  }
  if (tile === TILE_ID.ROCK) return py === 1 && px < 4 ? 12 : py === 2 && px < 4 ? -8 : 0
  if (tile === TILE_ID.SNOW) return (hash & 7) === 0 && py === 2 && px < 3 ? 7 : 0
  if (tile === TILE_ID.GRASS || tile === TILE_ID.FOOD) {
    if ((hash & 3) !== 0) return 0
    return (px === 2 && py < 2) || (px === 3 && py === 2) ? 9 : py === 3 && px > 1 && px < 4 ? -5 : 0
  }
  return 0
}
