import {
  HUMAN_ATLAS_CELL,
  HUMAN_ATLAS_FRAMES,
  humanAtlasRow,
  wrapHumanFrame,
  type AgeStage,
  type HumanSex,
} from '../2d/world/character-visuals'
import { pickAnimalTile, SPRITE, TILE_PX, type Tile } from './sprite-layout'
import { rasterizedAtlas } from './rasterized-atlas'

export { pickAnimalTile, SPRITE, TILE_PX }
export type { AgeStage, Tile }

const cache: Record<string, HTMLImageElement> = {}
const onLoad: Array<() => void> = []

export function onAnyAtlasLoaded(fn: () => void) {
  onLoad.push(fn)
  if (ATLAS_TOWN.complete && ATLAS_CREATURE.complete && ATLAS_PEOPLE.complete) fn()
}

export function loadAtlas(url: string): HTMLImageElement {
  if (cache[url]) return cache[url]
  const img = new Image()
  img.src = url
  img.addEventListener('load', () => onLoad.forEach((fn) => fn()), { once: true })
  cache[url] = img
  return img
}

export const ATLAS_TOWN = loadAtlas(`${import.meta.env.BASE_URL}sprites/tiny-town.png`)
export const ATLAS_CREATURE = loadAtlas(`${import.meta.env.BASE_URL}sprites/tiny-creatures.png`)
export const ATLAS_PEOPLE = loadAtlas(`${import.meta.env.BASE_URL}sprites/people/people.svg`)

export const PEOPLE_CELL = HUMAN_ATLAS_CELL
export const PEOPLE_COLS = HUMAN_ATLAS_FRAMES

export function pickHumanSprite(sex: HumanSex, stage: AgeStage, frame: number, appearance = 0): Tile {
  return [wrapHumanFrame(frame), humanAtlasRow(sex, stage, appearance)]
}

export function drawPeopleTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  dx: number,
  dy: number,
  size: number,
  flipped = false,
) {
  const img = rasterizedAtlas(ATLAS_PEOPLE)
  if (!img) return false
  const [col, row] = tile
  ctx.save()
  ctx.translate(flipped ? dx + size : dx, dy)
  if (flipped) ctx.scale(-1, 1)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, col * PEOPLE_CELL, row * PEOPLE_CELL, PEOPLE_CELL, PEOPLE_CELL, 0, 0, size, size)
  ctx.restore()
  return true
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement,
  tile: Tile,
  dx: number,
  dy: number,
  size = TILE_PX,
) {
  if (!atlas.complete || atlas.naturalWidth === 0) return
  const [col, row] = tile
  ctx.drawImage(atlas, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX, dx, dy, size, size)
}
