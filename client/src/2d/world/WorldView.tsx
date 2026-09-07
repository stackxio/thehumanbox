import { terrainDetail } from './terrain-detail'
import { MapCameraController } from './MapCameraController'
import { WorldMapHud } from './WorldMapHud'
import { isMapControl, type MapCommand } from './camera-controls'
import { drawFaunaSprite } from './fauna-sprites'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AnimalState, OrganismState, WorldState } from '../../types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { useUIStore, type ViewFlags } from '../../stores/store'
import { lineageColor, cbFireRgba } from '../../utils/constants'
import {
  ATLAS_TOWN,
  onAnyAtlasLoaded,
  drawPeopleTile,
  pickAnimalTile,
  pickHumanSprite,
  ATLAS_CREATURE,
  drawTile,
} from '../../utils/sprites'
import { compareBuildingsByDepth, drawBuilding } from './buildings2d'
import { getBuildingSprite, PAD as SPRITE_PAD, PAD_BOT as SPRITE_PAD_BOT } from './building-sprites'
import { normalizeLineageEras } from '../../utils/lineageEras'
import { useSceneStore } from '../../stores/scene'
import { farmCropColor, farmProgress, farmStage } from '../../world/farms'
import { activeStrategy, strategyTimeLabel } from '../../world/strategy-visuals'
import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../../world/terrain-ids'
import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  baseTerrainTile,
  permanentWaterDepth,
  permanentWaterLandEdgeMask,
  terrainVisualSignature,
} from '../../world/terrain-visuals'
import { getBuildingState, hasRuinedBuildingAtWorldTile, isRuinedBuilding } from '../../world/building-state'
import {
  buildTerritoryIndex,
  lineageAtTerritoryTile,
  territoryEmphasis,
  territoryStanding,
  territoryTileKey,
} from '../../world/territory'

import { oceanColor } from './landscape-style'

import { LOW_PERF } from '../../lib/perf'
import { logger } from '../../lib/logger'
import {
  deterministicAppearanceIndex,
  resolveAgeStage,
  zoomDetailLevel,
  characterMotion,
  characterFrame,
  compareCharacterDepth,
  type CharacterMotion,
} from './character-visuals'

const _orgLastPos = new Map<string, CharacterMotion>()
const _animalLastPos = new Map<number, CharacterMotion>()
function orgAnimPhase(id: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 800
}
function orgMotion(id: string, x: number, y: number, now: number): CharacterMotion {
  const motion = characterMotion(_orgLastPos.get(id), x, y, now, orgAnimPhase(id))
  _orgLastPos.set(id, motion)
  return motion
}

interface OrgInterpCache {
  source: OrganismState[] | null
  prevSource: OrganismState[] | null
  frameId: number
  items: OrganismState[]
  prevById: Map<string, OrganismState>
}

interface AnimalInterpCache {
  source: AnimalState[] | null
  prevSource: AnimalState[] | null
  frameId: number
  items: AnimalState[]
  prevById: Map<number, AnimalState>
}

const ERA_STRIPE_COLOR: Record<string, string> = {
  bronze: '#b07a2a',
  iron: '#7a7a7a',
  classical: '#d4a04a',
  medieval: '#5a4030',
  renaissance: '#c08850',
  industrial: '#3e2e22',
  modern: '#9aa0a8',
  information: '#7cc6ff',
}

function pickToolEmoji(tools: Record<string, number> | undefined): string {
  if (!tools) return ''
  if (tools.rifle || tools.musket) return '\u{1F52B}'
  if (tools.iron_sword) return '\u{2694}\u{FE0F}'
  if (tools.bronze_spear || tools.stone_spear) return '\u{1F3F9}'
  if (tools.bow || tools.crossbow) return '\u{1F3F9}'
  if (tools.computer) return '\u{1F4BB}'
  if (tools.book) return '\u{1F4D6}'
  if (tools.hammer || tools.saw) return '\u{1F528}'
  if (tools.plow) return '\u{1F69C}'
  return ''
}

const SPECIALTY_EMOJI: Record<string, string> = {
  farmer: '\u{1F33E}',
  smith: '\u{1F528}',
  hunter: '\u{1F3F9}',
  healer: '\u{2695}\u{FE0F}',
  scholar: '\u{1F4DC}',
  merchant: '\u{1F4B0}',
  soldier: '\u{2694}\u{FE0F}',
  builder: '\u{1F3D7}\u{FE0F}',
  priest: '\u{1F4FF}',
  artist: '\u{1F3A8}',
  engineer: '\u{2699}\u{FE0F}',
  sailor: '\u{26F5}',
  miner: '\u{26CF}\u{FE0F}',
  weaver: '\u{1F9F5}',
  baker: '\u{1F35E}',
  brewer: '\u{1F37A}',
  carpenter: '\u{1FA9C}',
  mason: '\u{1F9F1}',
  scribe: '\u{270D}\u{FE0F}',
  banker: '\u{1F3E6}',
  doctor: '\u{1F489}',
  teacher: '\u{1F4DA}',
  lawyer: '\u{2696}\u{FE0F}',
  officer: '\u{1F46E}',
  pilot: '\u{2708}\u{FE0F}',
  programmer: '\u{1F4BB}',
  journalist: '\u{1F4F0}',
  actor: '\u{1F3AD}',
  athlete: '\u{1F3C5}',
  politician: '\u{1F3DB}\u{FE0F}',
}

function drawCanineSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: 'wolf' | 'dog',
  flipped: boolean,
  step: number,
) {
  const unit = Math.max(1, Math.floor(size / 14))
  const spriteWidth = 14 * unit
  const spriteHeight = 14 * unit
  const left = Math.round(cx - spriteWidth / 2)
  const top = Math.round(cy - spriteHeight / 2)
  const outline = '#261d20'
  const fur = kind === 'wolf' ? '#677483' : '#a8643f'
  const highlight = kind === 'wolf' ? '#a8b3bc' : '#d49a66'
  const dark = kind === 'wolf' ? '#3d4854' : '#6f3c2b'
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x * unit, y * unit, width * unit, height * unit)
  }

  ctx.save()
  ctx.translate(flipped ? left + spriteWidth : left, top)
  if (flipped) ctx.scale(-1, 1)

  // Tail, body and head share an outline so both animals read clearly
  // against grass, sand and snow at the world camera scale.
  rect(0, 4, 4, 3, outline)
  rect(1, 4, 3, 1, fur)
  rect(2, 5, 2, 1, highlight)
  rect(3, 4, 8, 6, outline)
  rect(4, 5, 6, 4, fur)
  rect(4, 8, 6, 1, dark)
  rect(9, 2, 5, 7, outline)
  rect(10, 3, 3, 5, fur)
  rect(9, 0, 2, 3, outline)
  rect(12, 1, 2, 3, outline)
  rect(10, 1, 1, 2, dark)
  rect(12, 2, 1, 2, dark)
  rect(12, 5, 2, 2, highlight)
  rect(13, 5, 1, 1, '#171317')
  rect(11, 4, 1, 1, '#f1d37b')

  const frontFoot = step % 2 === 0 ? 0 : 1
  const backFoot = step % 2 === 0 ? 1 : 0
  rect(4, 9, 2, 4, outline)
  rect(5, 9, 1, 3, fur)
  rect(4 - backFoot, 12, 3, 1, outline)
  rect(8, 9, 2, 4, outline)
  rect(9, 9, 1, 3, fur)
  rect(8 + frontFoot, 12, 3, 1, outline)

  if (kind === 'dog') {
    rect(9, 6, 4, 1, '#e95b55')
    rect(10, 7, 1, 1, '#f2c84b')
  }
  ctx.restore()
}

function visualTileHash(col: number, row: number, salt = 0): number {
  let hash = (col * 374761393 + row * 668265263 + salt * 1274126177) | 0
  hash = ((hash ^ (hash >>> 13)) * 1274126177) | 0
  return hash >>> 0
}

function drawFoodPatch(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number) {
  const berry = (seed & 1) === 0 ? '#e25757' : '#e2bd45'
  ctx.fillStyle = '#244d2a'
  ctx.fillRect(px + 2, py + 3, 5, 3)
  ctx.fillRect(px + 3, py + 2, 3, 5)
  ctx.fillStyle = '#4f8a43'
  ctx.fillRect(px + 2, py + 3, 2, 2)
  ctx.fillRect(px + 5, py + 2, 2, 2)
  ctx.fillStyle = berry
  ctx.fillRect(px + 3 + ((seed >>> 4) & 1), py + 3, 1, 1)
  ctx.fillRect(px + 5, py + 5, 1, 1)
}

function drawMineralOutcrop(ctx: CanvasRenderingContext2D, px: number, py: number, seed: number) {
  ctx.fillStyle = '#3d3937'
  ctx.fillRect(px + 1, py + 5, 7, 2)
  ctx.fillRect(px + 2, py + 3, 5, 3)
  ctx.fillRect(px + 4, py + 2, 3, 2)
  ctx.fillStyle = '#716a62'
  ctx.fillRect(px + 3, py + 3, 2, 1)
  ctx.fillRect(px + 5, py + 4, 2, 1)
  ctx.fillStyle = (seed & 1) === 0 ? '#e2b84d' : '#7fc9c7'
  ctx.fillRect(px + 5, py + 3, 1, 1)
  ctx.fillRect(px + 3, py + 5, 1, 1)
}

function drawPixelFire(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  intensity: number,
  frame: number,
  campfire: boolean,
) {
  const strength = Math.max(0.2, Math.min(1, intensity))
  const shift = frame & 1
  if (campfire) {
    ctx.fillStyle = '#3b2418'
    ctx.fillRect(px + 1, py + 6, 6, 2)
    ctx.fillStyle = '#82502a'
    ctx.fillRect(px + 2, py + 6, 2, 1)
    ctx.fillRect(px + 5, py + 7, 2, 1)
  } else {
    ctx.fillStyle = 'rgba(62,35,24,0.75)'
    ctx.fillRect(px + 1, py + 7, 6, 1)
  }

  ctx.fillStyle = cbFireRgba(204, 54, 16, 0.8 * strength)
  ctx.fillRect(px + 2, py + 3 + shift, 5, 4 - shift)
  ctx.fillStyle = cbFireRgba(255, 126, 24, 0.95 * strength)
  ctx.fillRect(px + 3 + shift, py + 2, 3, 4)
  ctx.fillStyle = cbFireRgba(255, 222, 92, strength)
  ctx.fillRect(px + 4, py + 3 - shift, 1, 3)
  if (strength > 0.55) {
    ctx.fillStyle = cbFireRgba(255, 164, 48, 0.75 * strength)
    ctx.fillRect(px + ((frame + 1) % 6), py + 1, 1, 1)
  }
}

import { TILE, TILE_RGB, BIOME_RGBA, THOUGHT_COLORS } from '../../world/palette'
import { orgVariant } from '../../world/org-variant'
import { drawTrees, drawClouds, drawNaturalDecor, scratchA, scratchB } from './decorations'

const fpsSamples: number[] = []

let _imgBuf: ImageData | null = null
let _baseCanvas: HTMLCanvasElement | null = null
let _ruinedBuildingSource: WorldState['buildings']
let _ruinedBuildingTiles = new Set<string>()
// Shore-foam geometry is fully determined by the terrain grid, so it is
// baked into Path2Ds once per terrain rebuild instead of rescanning
// every tile twice per frame (that scan alone touched 360k+ tiles/frame
// on the 600x300 world).
interface FoamPaths {
  thin: Path2D
  thick: Path2D[]
}
interface BaseLayerKey {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]
  terrain_signature: number
  biomes?: number[][]
  depth_map?: number[][]
  season?: string
  foam?: FoamPaths
}
let _baseKey: BaseLayerKey | null = null

// Hut tiles are terrain-derived too; cache the positions per tiles array
// so the settlement-ring pass stops rescanning all 180k tiles per frame.
let _hutSource: number[][] | null = null
let _hutTiles: Array<[number, number]> = []
function hutTileList(tiles: number[][]): Array<[number, number]> {
  if (tiles === _hutSource) return _hutTiles
  const out: Array<[number, number]> = []
  for (let row = 0; row < tiles.length; row++) {
    const tr = tiles[row]
    if (!tr) continue
    for (let col = 0; col < tr.length; col++) {
      if (tr[col] === TILE_ID.HUT) out.push([col, row])
    }
  }
  _hutSource = tiles
  _hutTiles = out
  return out
}

interface HutCluster {
  cx: number
  cy: number
  count: number
}
let _hutClusterSource: Array<[number, number]> | null = null
let _hutClusters: HutCluster[] = []
function cachedHutClusters(hutPositions: Array<[number, number]>): HutCluster[] {
  if (hutPositions === _hutClusterSource) return _hutClusters
  const clusters: HutCluster[] = []
  const usedInCluster = new Set<number>()
  for (let i = 0; i < hutPositions.length; i++) {
    if (usedInCluster.has(i)) continue
    const [hx, hy] = hutPositions[i]
    const cluster = [i]
    for (let j = i + 1; j < hutPositions.length; j++) {
      const [jx, jy] = hutPositions[j]
      const d2 = (hx - jx) ** 2 + (hy - jy) ** 2
      if (d2 < 64) {
        cluster.push(j)
        usedInCluster.add(j)
      }
    }
    usedInCluster.add(i)
    if (cluster.length < 3) continue
    clusters.push({
      cx: cluster.reduce((s, k) => s + hutPositions[k][0], 0) / cluster.length,
      cy: cluster.reduce((s, k) => s + hutPositions[k][1], 0) / cluster.length,
      count: cluster.length,
    })
  }
  _hutClusterSource = hutPositions
  _hutClusters = clusters
  return clusters
}

function buildFoamPaths(tiles: number[][], width: number, height: number): FoamPaths {
  const thin = new Path2D()
  const thick = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const shore = permanentWaterLandEdgeMask(tiles, row, col)
      if (shore === 0) continue
      const px = col * TILE
      const py = row * TILE
      // Same hash the animated pulse used, bucketed four ways so the
      // shimmer keeps its spatial variety with four fills per frame.
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      const tp = thick[h & 3]
      if (shore & EDGE_NORTH) {
        thin.rect(px, py, TILE, 1)
        tp.rect(px, py, TILE, 2)
      }
      if (shore & EDGE_SOUTH) {
        thin.rect(px, py + TILE - 1, TILE, 1)
        tp.rect(px, py + TILE - 2, TILE, 2)
      }
      if (shore & EDGE_EAST) {
        thin.rect(px + TILE - 1, py, 1, TILE)
        tp.rect(px + TILE - 2, py, 2, TILE)
      }
      if (shore & EDGE_WEST) {
        thin.rect(px, py, 1, TILE)
        tp.rect(px, py, 2, TILE)
      }
    }
  }
  return { thin, thick }
}

function ruinedBuildingTiles(buildings: WorldState['buildings']): ReadonlySet<string> {
  if (buildings === _ruinedBuildingSource) return _ruinedBuildingTiles
  const tiles = new Set<string>()
  for (const building of buildings ?? []) {
    if (!isRuinedBuilding(building)) continue
    const footprintWidth = Math.max(1, Math.floor(building.footprint?.[0] ?? building.fw ?? 1))
    const footprintHeight = Math.max(1, Math.floor(building.footprint?.[1] ?? building.fh ?? 1))
    for (let dy = 0; dy < footprintHeight; dy++) {
      for (let dx = 0; dx < footprintWidth; dx++) {
        tiles.add(`${Math.floor(building.x + dx)},${Math.floor(building.y + dy)}`)
      }
    }
  }
  _ruinedBuildingSource = buildings
  _ruinedBuildingTiles = tiles
  return tiles
}

const MAX_TRADE_ROUTES_2D = 48
const MAX_CARAVANS_2D = 64

function cargoGlyph(cargo: string): string {
  const normalized = cargo.toLowerCase()
  if (normalized.includes('food') || normalized.includes('fruit')) return '🍎'
  if (normalized.includes('grain') || normalized.includes('wheat')) return '🌾'
  if (normalized.includes('wood') || normalized.includes('timber')) return '🪵'
  if (normalized.includes('stone') || normalized.includes('ore')) return '🪨'
  if (normalized.includes('water')) return '💧'
  if (normalized.includes('cloth') || normalized.includes('wool')) return '🧶'
  return '📦'
}

function isFinitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

function drawTradeNetwork2D(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  now: number,
) {
  if (!world.trade_routes?.length && !world.caravans?.length) return

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const margin = 8
  const isVisible = (x: number, y: number) =>
    x >= bounds.c0 - margin && x <= bounds.c1 + margin && y >= bounds.r0 - margin && y <= bounds.r1 + margin

  const visibleRoutes: NonNullable<WorldState['trade_routes']> = []
  for (const route of world.trade_routes ?? []) {
    if (!isFinitePoint(route.a_center) || !isFinitePoint(route.b_center)) continue
    const ax = route.a_center[0] - ox
    const ay = route.a_center[1] - oy
    const bx = route.b_center[0] - ox
    const by = route.b_center[1] - oy
    if (
      Math.max(ax, bx) < bounds.c0 - margin ||
      Math.min(ax, bx) > bounds.c1 + margin ||
      Math.max(ay, by) < bounds.r0 - margin ||
      Math.min(ay, by) > bounds.r1 + margin
    ) {
      continue
    }
    visibleRoutes.push(route)
    if (visibleRoutes.length >= MAX_TRADE_ROUTES_2D) break
  }

  type VisibleCaravan = {
    caravan: NonNullable<WorldState['caravans']>[number]
    localX: number
    localY: number
  }
  const visibleCaravans: VisibleCaravan[] = []
  for (const caravan of world.caravans ?? []) {
    if (!isFinitePoint(caravan.from) || !isFinitePoint(caravan.to)) continue
    const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
    const progress = Math.max(0, Math.min(1, (world.tick - caravan.departed_tick) / duration))
    const localX = caravan.from[0] + (caravan.to[0] - caravan.from[0]) * progress - ox
    const localY = caravan.from[1] + (caravan.to[1] - caravan.from[1]) * progress - oy
    if (!isVisible(localX, localY)) continue
    visibleCaravans.push({ caravan, localX, localY })
    if (visibleCaravans.length >= MAX_CARAVANS_2D) break
  }

  if (visibleRoutes.length === 0 && visibleCaravans.length === 0) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([Math.max(4, TILE * 0.75), Math.max(3, TILE * 0.5)])

  for (const route of visibleRoutes) {
    const ax = route.a_center[0] - ox
    const ay = route.a_center[1] - oy
    const bx = route.b_center[0] - ox
    const by = route.b_center[1] - oy

    const startX = (ax + 0.5) * TILE
    const startY = (ay + 0.5) * TILE
    const endX = (bx + 0.5) * TILE
    const endY = (by + 0.5) * TILE
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY)
    gradient.addColorStop(0, lineageColor(route.lineage_a))
    gradient.addColorStop(1, lineageColor(route.lineage_b))
    ctx.globalAlpha = 0.3 + Math.min(0.2, Math.log2(route.deliveries + route.volume + 1) * 0.035)
    ctx.strokeStyle = gradient
    ctx.lineWidth = Math.min(2.25, 0.9 + Math.log2(route.deliveries + 1) * 0.15)
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.globalAlpha = 0.55
    for (const [x, y, lineage] of [
      [startX, startY, route.lineage_a],
      [endX, endY, route.lineage_b],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(2.25, TILE * 0.2), 0, Math.PI * 2)
      ctx.fillStyle = lineageColor(lineage)
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(12, 15, 18, 0.82)'
      ctx.stroke()
    }
    ctx.setLineDash([Math.max(4, TILE * 0.75), Math.max(3, TILE * 0.5)])
  }

  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.max(10, Math.round(TILE * 0.9))}px sans-serif`
  for (const { caravan, localX, localY } of visibleCaravans) {
    const px = (localX + 0.5) * TILE
    const py = (localY + 0.5) * TILE + Math.sin(now / 170 + caravan.id * 0.73) * 1.2
    const angle = Math.atan2(caravan.to[1] - caravan.from[1], caravan.to[0] - caravan.from[0])
    const radius = Math.max(6, TILE * 0.48)
    ctx.save()
    ctx.translate(px, py)
    ctx.globalAlpha = 0.96
    ctx.fillStyle = 'rgba(11, 14, 16, 0.82)'
    ctx.beginPath()
    ctx.arc(0, 0, radius + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = lineageColor(caravan.sender_lineage)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.rotate(angle)
    ctx.fillStyle = lineageColor(caravan.sender_lineage)
    ctx.beginPath()
    ctx.moveTo(radius + 3, 0)
    ctx.lineTo(radius - 1, -3)
    ctx.lineTo(radius - 1, 3)
    ctx.closePath()
    ctx.fill()
    ctx.rotate(-angle)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(cargoGlyph(caravan.cargo), 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

onAnyAtlasLoaded(() => {
  _baseKey = null
})
function getReuseImgData(w: number, h: number): ImageData {
  if (!_imgBuf || _imgBuf.width !== w || _imgBuf.height !== h) {
    _imgBuf = new ImageData(w, h)
  }
  return _imgBuf
}

function baseLayerMatches(
  key: typeof _baseKey,
  width: number,
  height: number,
  origin_x: number,
  origin_y: number,
  tiles: number[][],
  terrain_signature: number,
  biomes?: number[][],
  depth_map?: number[][],
  season?: string,
) {
  return (
    !!key &&
    key.width === width &&
    key.height === height &&
    key.origin_x === origin_x &&
    key.origin_y === origin_y &&
    (key.tiles === tiles || key.terrain_signature === terrain_signature) &&
    key.biomes === biomes &&
    key.depth_map === depth_map &&
    key.season === season
  )
}

// Downscaled copy of the base terrain, rebuilt only when the terrain or
// the render scale changes. Drawing this 1:1 each frame is far cheaper
// than having the browser rescale the full 4800x2400 base every frame.
let _scaledBase: {
  key: BaseLayerKey
  scale: number
  canvas: HTMLCanvasElement
} | null = null

function getScaledBase(scale: number): HTMLCanvasElement | null {
  const baseCanvas = _baseCanvas
  const key = _baseKey
  if (!baseCanvas || !key) return null
  if (_scaledBase && _scaledBase.key === key && _scaledBase.scale === scale) {
    return _scaledBase.canvas
  }
  const w = Math.max(1, Math.round(baseCanvas.width * scale))
  const h = Math.max(1, Math.round(baseCanvas.height * scale))
  const canvas =
    _scaledBase && _scaledBase.canvas.width === w && _scaledBase.canvas.height === h
      ? _scaledBase.canvas
      : document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(baseCanvas, 0, 0, w, h)
  _scaledBase = { key, scale, canvas }
  return canvas
}

// Food patches and mineral outcrops only change when the terrain grid
// changes (full frames), but the naive loop was issuing ~6 fillRects
// per food tile EVERY FRAME - profiling showed 300k fillRects/frame on
// an ocean-heavy world. Bake them into a scaled overlay once per
// (terrain, scale) and blit it like the base layer.
let _tileDecor: {
  key: BaseLayerKey
  scale: number
  canvas: HTMLCanvasElement
} | null = null
function getTileDecorLayer(scale: number): HTMLCanvasElement | null {
  const key = _baseKey
  if (!key) return null
  if (_tileDecor && _tileDecor.key === key && _tileDecor.scale === scale) {
    return _tileDecor.canvas
  }
  const w = Math.max(1, Math.round(key.width * TILE * scale))
  const h = Math.max(1, Math.round(key.height * TILE * scale))
  const canvas =
    _tileDecor && _tileDecor.canvas.width === w && _tileDecor.canvas.height === h
      ? _tileDecor.canvas
      : document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, key.width * TILE, key.height * TILE)
  ctx.imageSmoothingEnabled = false
  const tiles = key.tiles
  const ox = key.origin_x
  const oy = key.origin_y
  for (let row = 0; row < key.height; row++) {
    const tileRow = tiles[row]
    if (!tileRow) continue
    for (let col = 0; col < key.width; col++) {
      const tile = tileRow[col]
      if (tile !== TILE_ID.FOOD && tile !== TILE_ID.MINERAL) continue
      const seed = visualTileHash(col + ox, row + oy)
      const px = col * TILE
      const py = row * TILE
      if (tile === TILE_ID.FOOD) drawFoodPatch(ctx, px, py, seed)
      else drawMineralOutcrop(ctx, px, py, seed)
    }
  }
  _tileDecor = { key, scale, canvas }
  return canvas
}

// Ocean shimmer + night star-glints: same story as food tiles. The
// dynamic loops issued thousands of 2x1 fillRects per frame over open
// water. Bake both into half-resolution layers (they're 1-2px dots;
// softness is invisible) and animate with two cheap alpha-blended
// blits. Zoomed-in frames keep the original per-tile loops - bounds
// make them tiny there.
interface WaterFxLayers {
  key: BaseLayerKey
  scale: number
  shimmer: HTMLCanvasElement
  stars: HTMLCanvasElement
}
let _waterFx: WaterFxLayers | null = null
function getWaterFxLayers(scale: number): WaterFxLayers | null {
  const key = _baseKey
  if (!key) return null
  if (_waterFx && _waterFx.key === key && _waterFx.scale === scale) return _waterFx
  const s = Math.max(0.05, scale / 2)
  const w = Math.max(1, Math.round(key.width * TILE * s))
  const h = Math.max(1, Math.round(key.height * TILE * s))
  const make = (prev: HTMLCanvasElement | null): HTMLCanvasElement => {
    const c = prev && prev.width === w && prev.height === h ? prev : document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  const prevShimmer = _waterFx?.shimmer ?? null
  const prevStars = _waterFx?.stars ?? null
  const shimmer = make(prevShimmer)
  const stars = make(prevStars)
  const shCtx = shimmer.getContext('2d')!
  const stCtx = stars.getContext('2d')!
  shCtx.setTransform(1, 0, 0, 1, 0, 0)
  shCtx.clearRect(0, 0, w, h)
  stCtx.setTransform(1, 0, 0, 1, 0, 0)
  stCtx.clearRect(0, 0, w, h)
  shCtx.fillStyle = 'rgba(180,230,255,1)'
  stCtx.fillStyle = 'rgba(255,255,255,1)'
  const tiles = key.tiles
  const dm = key.depth_map
  for (let row = 0; row < key.height; row++) {
    const tileRow = tiles[row]
    if (!tileRow) continue
    for (let col = 0; col < key.width; col++) {
      const d = permanentWaterDepth(tileRow[col], dm?.[row]?.[col])
      if (d === null) continue
      let hash = (col * 374761393 + row * 668265263) | 0
      hash = ((hash ^ (hash >>> 13)) * 1274126177) >>> 0
      const px = (col * TILE + ((hash >>> 8) & 3)) * s
      const py = (row * TILE + ((hash >>> 10) & 3)) * s
      const pw = Math.max(1, Math.round(2 * s))
      const ph = Math.max(1, Math.round(1 * s))
      // ~25% of deep-water tiles sparkle; ~6% of all water glints.
      if (d >= 180 && ((hash >>> 12) & 7) < 2) shCtx.fillRect(px, py, pw, ph)
      if (((hash >>> 15) & 15) === 0) stCtx.fillRect(px, py, pw, ph)
    }
  }
  _waterFx = { key, scale, shimmer, stars }
  return _waterFx
}

// Cache terrain and decoration layers at a resolution appropriate for
// the viewport. Quantized steps avoid rebuilding them on every zoom event.
// The visible canvas itself stays viewport-sized and uses Canvas 2D;
// presenting a 2D bitmap must not depend on WebGL availability.
function pickRenderScale(zoom: number, lowPerf: boolean): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const needed = zoom * dpr
  if (needed >= 1) return 1
  const stepped = Math.ceil(needed * 8) / 8
  const floor = lowPerf ? 0.5 : 0.25
  return Math.min(1, Math.max(floor, stepped))
}

function vnHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
  return ((h >>> 0) & 0xffff) / 0xffff
}

// Tiles repainted per incremental base-layer update before falling back
// to a full rebuild. Wildfires can touch thousands of tiles at once;
// beyond this a full rebuild is simpler and comparable in cost.
const MAX_INCREMENTAL_TILES = 6000

function varAmountForTile(tid: number): number {
  if (tid === 2 || tid === 9) return 2
  if (tid === 1 || tid === 3) return 2
  if (tid === 5) return 3
  if (tid === 6) return 9
  if (tid === 12) return 3
  if (tid === 13) return 2
  return 4
}

// Paint one tile's TILE x TILE pixel block into the base ImageData.
// Extracted from the full-grid rebuild loop so incremental updates can
// repaint individual tiles with byte-identical results.
function paintTileBlock(
  d: Uint8ClampedArray<ArrayBufferLike>,
  W: number,
  tiles: number[][],
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
  row: number,
  col: number,
) {
  const height = tiles.length
  const tileRow = tiles[row]
  const biomeRow = biomes?.[row]
  const depthRow = depth_map?.[row]
  const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
  const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
  const rawTid = tileRow?.[col] ?? TILE_ID.VOID
  const tid = baseTerrainTile(rawTid)
  const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
  let r = rgb[0]
  let g = rgb[1]
  let b = rgb[2]

  const isWater = isWaterTile(rawTid)
  const isPermanentWater = isPermanentWaterTile(rawTid)
  const wN = tileRowPrev?.[col]
  const wS = tileRowNext?.[col]
  const wW = col > 0 ? tileRow?.[col - 1] : undefined
  const wE = tileRow?.[col + 1]
  const touchesLand =
    (wN !== undefined && !isWaterTile(wN)) ||
    (wS !== undefined && !isWaterTile(wS)) ||
    (wW !== undefined && !isWaterTile(wW)) ||
    (wE !== undefined && !isWaterTile(wE))

  const visualDepth = permanentWaterDepth(rawTid, depthRow?.[col])
  if (visualDepth !== null) {
    ;[r, g, b] = oceanColor(visualDepth)
  }

  if (isPermanentWater && touchesLand) {
    r = (r * 0.68 + SHALLOW_RGB[0] * 0.32) | 0
    g = (g * 0.68 + SHALLOW_RGB[1] * 0.32) | 0
    b = (b * 0.68 + SHALLOW_RGB[2] * 0.32) | 0
  }

  if (!isWater && tid !== TILE_ID.ROCK && tid !== TILE_ID.SNOW) {
    const bm = biomeRow?.[col] ?? 0
    const bo = BIOME_RGBA[bm]
    if (bo) {
      const a = bo[3]
      if (a > 0) {
        const ia = 1 - a
        r = (r * ia + bo[0] * a) | 0
        g = (g * ia + bo[1] * a) | 0
        b = (b * ia + bo[2] * a) | 0
      }
    }
  }

  const macro = valueNoise(col / 42, row / 42) * 0.65 + valueNoise(col / 13 + 7, row / 13 + 7) * 0.35
  let shading = ((macro - 0.5) * (isWater ? 5 : 25)) | 0
  if (!isWater) {
    const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
    const landTint = SEASON_LAND_TINT[season ?? '']
    if (grassy && landTint) {
      let w = landTint.w * (0.55 + macro * 0.9)
      if (w > 0.85) w = 0.85
      const iw = 1 - w
      r = (r * iw + landTint.rgb[0] * w) | 0
      g = (g * iw + landTint.rgb[1] * w) | 0
      b = (b * iw + landTint.rgb[2] * w) | 0
      shading += ((macro - 0.5) * 8) | 0
    }
  }

  const varAmt = varAmountForTile(tid)
  const bx = col * TILE
  const by = row * TILE
  for (let ty = 0; ty < TILE; ty++) {
    const gy = by + ty
    let pi = (gy * W + bx) * 4
    for (let tx = 0; tx < TILE; tx++, pi += 4) {
      const gx = bx + tx
      // Texture in small pixel-art clusters instead of independent
      // per-pixel static. The macro field shapes broad biome patches;
      // this 2x2 dither keeps nearby terrain readable at game scale.
      const clusterX = gx >> 1
      const clusterY = gy >> 1
      let h = (clusterX * 374761393 + clusterY * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
      const dither = ((gx ^ gy) & 1) === 0 ? -1 : 1
      const k = (((((h >>> 0) & 0xff) - 128) * varAmt) >> 7) + dither + terrainDetail(tid, gx, gy)
      let rr = r + k + shading
      let gg = g + k + shading
      let bb = b + k + shading
      if (rr < 0) rr = 0
      else if (rr > 255) rr = 255
      if (gg < 0) gg = 0
      else if (gg > 255) gg = 255
      if (bb < 0) bb = 0
      else if (bb > 255) bb = 255
      d[pi] = rr
      d[pi + 1] = gg
      d[pi + 2] = bb
      d[pi + 3] = 255
    }
  }
}

// Repaint one tile of the baked food/mineral decor layer after an
// incremental terrain update.
function updateTileDecorTile(tid: number, col: number, row: number, ox: number, oy: number) {
  if (!_tileDecor) return
  const ctx = _tileDecor.canvas.getContext('2d')!
  const s = _tileDecor.scale
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.clearRect(col * TILE, row * TILE, TILE, TILE)
  if (tid !== TILE_ID.FOOD && tid !== TILE_ID.MINERAL) return
  const seed = visualTileHash(col + ox, row + oy)
  const px = col * TILE
  const py = row * TILE
  if (tid === TILE_ID.FOOD) drawFoodPatch(ctx, px, py, seed)
  else drawMineralOutcrop(ctx, px, py, seed)
}

// Refresh one region of the downscaled base copy after the full-res
// base changed underneath it.
function updateScaledBaseRegion(tx0: number, ty0: number, tx1: number, ty1: number) {
  if (!_scaledBase || !_baseCanvas) return
  const s = _scaledBase.scale
  const ctx = _scaledBase.canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  const sx = tx0 * TILE
  const sy = ty0 * TILE
  const sw = (tx1 - tx0 + 1) * TILE
  const sh = (ty1 - ty0 + 1) * TILE
  ctx.drawImage(
    _baseCanvas,
    sx,
    sy,
    sw,
    sh,
    Math.round(sx * s),
    Math.round(sy * s),
    Math.round(sw * s),
    Math.round(sh * s),
  )
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = vnHash(xi, yi)
  const b = vnHash(xi + 1, yi)
  const c = vnHash(xi, yi + 1)
  const d = vnHash(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

const SEASON_LAND_TINT: Record<string, { rgb: [number, number, number]; w: number }> = {
  abundance: { rgb: [58, 138, 66], w: 0.22 },
  recovery: { rgb: [92, 150, 64], w: 0.3 },
  decline: { rgb: [150, 118, 44], w: 0.42 },
  scarcity: { rgb: [128, 102, 56], w: 0.52 },
}

const SHALLOW_RGB: [number, number, number] = [116, 198, 208]

function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
  const { width, height, tiles, biomes } = world.grid
  if (!tiles || tiles.length < height) return null
  const depth_map = world.grid.depth_map as number[][] | undefined
  const origin_x = world.grid.origin_x ?? 0
  const origin_y = world.grid.origin_y ?? 0
  const W = width * TILE
  const H = height * TILE

  const season = world.season
  const terrain_signature =
    _baseKey?.tiles === tiles ? _baseKey.terrain_signature : terrainVisualSignature(tiles, width, height)
  if (
    _baseCanvas &&
    baseLayerMatches(
      _baseKey,
      width,
      height,
      origin_x,
      origin_y,
      tiles,
      terrain_signature,
      biomes,
      depth_map,
      season,
    )
  ) {
    if (_baseKey) _baseKey.tiles = tiles
    return _baseCanvas
  }

  // ── Incremental update path ─────────────────────────────────────────
  // The simulation re-sends the full tiles grid periodically (every 60
  // ticks). The array identity changes but usually only a handful of
  // tiles actually differ (fires, food, new huts). Diffing costs ~1ms;
  // repainting just those tiles beats a full 11.5M-pixel rebuild that
  // otherwise stalls the frame for hundreds of ms.
  if (
    _baseKey &&
    _baseCanvas &&
    _imgBuf &&
    _imgBuf.width === width * TILE &&
    _imgBuf.height === height * TILE &&
    _baseKey.width === width &&
    _baseKey.height === height &&
    _baseKey.origin_x === origin_x &&
    _baseKey.origin_y === origin_y &&
    _baseKey.season === season &&
    _baseKey.biomes === biomes &&
    _baseKey.depth_map === depth_map &&
    _baseKey.tiles !== tiles
  ) {
    const changes: Array<[number, number]> = []
    let diffOverflow = false
    const oldTiles = _baseKey.tiles
    for (let row = 0; row < height; row++) {
      const oldRow = oldTiles[row]
      const newRow = tiles[row]
      if (oldRow === newRow) continue
      if (!oldRow || !newRow) {
        diffOverflow = true
        break
      }
      for (let col = 0; col < width; col++) {
        if (oldRow[col] !== newRow[col]) {
          changes.push([row, col])
          if (changes.length > MAX_INCREMENTAL_TILES) {
            diffOverflow = true
            break
          }
        }
      }
      if (diffOverflow) break
    }

    if (!diffOverflow && changes.length > 0) {
      const canvas = _baseCanvas
      const baseCtx = canvas.getContext('2d')!
      // Repaint changed tile blocks into the shared ImageData buffer.
      for (const [row, col] of changes) {
        paintTileBlock(_imgBuf.data, W, tiles, biomes, depth_map, season, row, col)
        // Keep the baked decor layer in sync for food/mineral toggles.
        updateTileDecorTile(tiles[row][col], col, row, origin_x, origin_y)
      }
      // Expanded dirty bounds (+3 tile margin covers tree canopies and
      // foam edges). One region blit erases old sprites there; the
      // filtered redraws below repaint whatever still belongs.
      let bx0 = width
      let by0 = height
      let bx1 = 0
      let by1 = 0
      for (const [row, col] of changes) {
        if (col < bx0) bx0 = col
        if (col > bx1) bx1 = col
        if (row < by0) by0 = row
        if (row > by1) by1 = row
      }
      const m = Math.min(4, width, height)
      bx0 = Math.max(0, bx0 - m)
      by0 = Math.max(0, by0 - m)
      bx1 = Math.min(width - 1, bx1 + m)
      by1 = Math.min(height - 1, by1 + m)
      baseCtx.imageSmoothingEnabled = false
      baseCtx.putImageData(
        _imgBuf,
        0,
        0,
        bx0 * TILE,
        by0 * TILE,
        (bx1 - bx0 + 1) * TILE,
        (by1 - by0 + 1) * TILE,
      )
      const only = { x0: bx0, y0: by0, x1: bx1, y1: by1 }
      baseCtx.save()
      baseCtx.beginPath()
      baseCtx.rect(bx0 * TILE, by0 * TILE, (bx1 - bx0 + 1) * TILE, (by1 - by0 + 1) * TILE)
      baseCtx.clip()
      if (biomes) {
        drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only)
      }
      if (biomes && ATLAS_TOWN.complete) {
        drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only, season)
      }
      baseCtx.restore()
      // Refresh derived layers for the affected region.
      updateScaledBaseRegion(bx0, by0, bx1, by1)
      // Foam geometry is cheap to rebuild relative to pixels and keeps
      // shoreline highlights correct after land/water flips.
      _baseKey.foam = buildFoamPaths(tiles, width, height)
      _baseKey.tiles = tiles
      _baseKey.terrain_signature = terrainVisualSignature(tiles, width, height)
      return canvas
    }
    if (!diffOverflow && changes.length === 0) {
      // Fresh arrays, identical content - just re-point the cache.
      _baseKey.tiles = tiles
      return _baseCanvas
    }
    // diff overflow (or nothing changed): fall through to full rebuild.
  }

  const canvas =
    _baseCanvas && _baseCanvas.width === W && _baseCanvas.height === H
      ? _baseCanvas
      : document.createElement('canvas')
  canvas.width = W
  canvas.height = H

  const imgData = getReuseImgData(W, H)
  const d = imgData.data
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      paintTileBlock(d, W, tiles, biomes, depth_map, season, row, col)
    }
  }

  const baseCtx = canvas.getContext('2d')!
  baseCtx.imageSmoothingEnabled = false
  baseCtx.putImageData(imgData, 0, 0)
  if (biomes) {
    drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y)
  }
  if (biomes && ATLAS_TOWN.complete) {
    drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y, undefined, season)
  }
  _baseCanvas = canvas
  _baseKey = {
    width,
    height,
    origin_x,
    origin_y,
    tiles,
    terrain_signature,
    biomes,
    depth_map,
    season,
    foam: buildFoamPaths(tiles, width, height),
  }
  return canvas
}

function drawWorldOnCanvas(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  bounds?: { c0: number; c1: number; r0: number; r1: number },
  cameraZoom = 1,
  renderScale = 1,
) {
  const { width, height, tiles, fire_intensity, structure } = world.grid
  const { food_trail, water_trail, path_trail, fertility, hazard } = world.grid
  if (!tiles || tiles.length < height) return
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  // Clip per-tile overlay loops to the visible window when bounds is
  // provided. Bounds is computed by the caller from camera + dims and
  // already includes a margin. When zoomed out (whole world visible)
  // the bounds collapse to the full grid, so this is a no-op.
  const r0 = bounds?.r0 ?? 0
  const r1 = bounds?.r1 ?? height
  const c0 = bounds?.c0 ?? 0
  const c1 = bounds?.c1 ?? width
  // Prefer the viewport-filtered list (smaller) but fall back to the
  // full cache when it's empty. `??` alone returns [] when viewport is
  // an empty array, which silently hid all animals if the wire ever
  // shipped a frame with `animals: []` even though the cache held many.
  const orgPick =
    world.viewport_organisms && world.viewport_organisms.length > 0
      ? world.viewport_organisms
      : (world.organisms ?? [])
  const animalPick =
    world.viewport_animals && world.viewport_animals.length > 0
      ? world.viewport_animals
      : (world.animals ?? [])
  const organisms = orgPick
  const animals = animalPick
  const W = width * TILE
  const H = height * TILE
  const t = Date.now()
  // Zoomed-out frames skip the per-tile eye candy (fire glow gradients,
  // hut smoke, wavelets): hundreds of gradient/particle draws over
  // sub-2px tiles are invisible there but dominated frame time.
  const overview = zoomDetailLevel(cameraZoom) === 'overview'
  const ruinedTiles = ruinedBuildingTiles(world.buildings)
  // Below full resolution the frame is a minification, so bilinear
  // filtering matches what the GPU's LINEAR texture sampling showed
  // before; at 1:1 keep hard pixel-art edges.
  ctx.imageSmoothingEnabled = renderScale < 1

  const base = getBaseLayerCanvas(world)
  if (!base) return
  if (renderScale < 1) {
    const scaled = getScaledBase(renderScale)
    if (scaled) {
      ctx.drawImage(scaled, 0, 0, W, H)
    } else {
      ctx.drawImage(base, 0, 0)
    }
  } else {
    ctx.drawImage(base, 0, 0)
  }

  const sp = world.season_progress ?? 0.5
  const seasonTints: Record<string, [number, number, number, number]> = {
    decline: [180, 110, 30, 0.05 + sp * 0.06],
    scarcity: [95, 70, 40, 0.07 + sp * 0.07],
    recovery: [40, 130, 150, 0.04 + (1 - sp) * 0.05],
  }
  const skyTint = seasonTints[world.season]
  if (skyTint) {
    ctx.fillStyle = `rgba(${skyTint[0]},${skyTint[1]},${skyTint[2]},${skyTint[3]})`
    ctx.fillRect(0, 0, W, H)
  }

  {
    const dp = world.day_progress ?? 0.5
    if (!world.is_day) {
      const mid = Math.max(0, 1 - Math.abs(dp - 0.85) * 4)
      ctx.fillStyle = `rgba(14,20,58,${0.22 + mid * 0.1})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(80,110,200,${0.05 + mid * 0.03})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp < 0.12) {
      const k = (0.12 - dp) / 0.12
      ctx.fillStyle = `rgba(255,160,80,${k * 0.14})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(120,80,160,${k * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else if (dp > 0.55) {
      const k = Math.min(1, (dp - 0.55) / 0.15)
      ctx.fillStyle = `rgba(235,120,60,${k * 0.15})`
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(150,70,140,${k * 0.05})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  if (world.weather && world.weather.kind !== 'clear') {
    const wi = Math.max(0, Math.min(1, world.weather.intensity ?? 0))
    const kind = world.weather.kind
    if (kind === 'storm') {
      ctx.fillStyle = `rgba(40,55,90,${0.06 + wi * 0.1})`
      ctx.fillRect(0, 0, W, H)
    } else if (kind === 'rain') {
      ctx.fillStyle = `rgba(70,90,130,${0.04 + wi * 0.06})`
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = 'rgba(35,45,60,0.07)'
      ctx.fillRect(0, 0, W, H)
    }
    if (kind === 'rain' || kind === 'storm') {
      const isStorm = kind === 'storm'
      const wx = world.weather.wind_x ?? 0.4
      const wy = world.weather.wind_y ?? 0.0
      if (world.season === 'scarcity' && !isStorm) {
        ctx.fillStyle = `rgba(240,246,255,${0.35 + wi * 0.3})`
        const flakes = Math.round(90 * (0.4 + wi * 0.6))
        for (let i = 0; i < flakes; i++) {
          const drift = Math.sin(t * 0.0012 + i * 1.7) * 6 + wx * 10
          const sxp = (i * 137 + t * 0.12 + drift) % W
          const syp = (i * 251 + t * 0.25) % H
          const sz = 1 + ((i * 7) % 2)
          ctx.fillRect(sxp, syp, sz, sz)
        }
      } else {
        ctx.strokeStyle = isStorm
          ? `rgba(180,195,230,${0.1 + wi * 0.1})`
          : `rgba(170,190,225,${0.08 + wi * 0.08})`
        ctx.lineWidth = 1
        const streaks = Math.round((isStorm ? 80 : 50) * (0.4 + wi * 0.6))
        const baseSlant = isStorm ? 10 : 6
        const slantX = wx * baseSlant
        const slantY = (1 + wy * 0.5) * 8
        ctx.beginPath()
        for (let i = 0; i < streaks; i++) {
          const sxp = (i * 137 + t * 0.7) % W
          const syp = (i * 251 + t * (isStorm ? 1.4 : 1.0)) % H
          ctx.moveTo(sxp, syp)
          ctx.lineTo(sxp + slantX, syp + slantY)
        }
        ctx.stroke()
      }
    }
  }

  if (world.drought === true) {
    const shimmer = (Math.sin(t * 0.001) * 0.5 + 0.5) * 0.04
    ctx.fillStyle = `rgba(255,180,80,${shimmer})`
    ctx.fillRect(0, 0, W, H)
  }

  if (!world.is_day || (world.day_progress ?? 0) > 0.05) {
    const waterFx = renderScale < 1 ? getWaterFxLayers(renderScale) : null
    if (waterFx) {
      // Baked star layer: one alpha-animated blit instead of a
      // stride-2 scan over every water tile issuing thousands of
      // 2x1 fillRects.
      const blink = 0.5 + 0.5 * Math.sin(t * 0.0017)
      ctx.globalAlpha = (world.is_day ? 0.55 : 0.42) * (0.35 + 0.65 * blink)
      ctx.drawImage(waterFx.stars, 0, 0, W, H)
      ctx.globalAlpha = 1
    } else {
      const tt = t * 0.001
      ctx.fillStyle = world.is_day ? 'rgba(255,255,255,0.55)' : 'rgba(180,200,240,0.30)'
      // Align to even boundaries so the star-on-water pattern stays
      // stable as the camera pans (stride-2 sampling must visit the
      // same cells from frame to frame).
      for (let row = r0 & ~1; row < r1; row += 2) {
        for (let col = c0 & ~1; col < c1; col += 2) {
          if (!isPermanentWaterTile(tiles[row]?.[col])) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
          const phase = ((h & 0xff) / 255) * Math.PI * 2
          const blink = Math.sin(tt * 1.7 + phase) + Math.sin(tt * 0.9 + phase * 1.3)
          if (blink < 1.3) continue
          const px = col * TILE + ((h >>> 8) & 3)
          const py = row * TILE + ((h >>> 10) & 3)
          ctx.fillRect(px, py, 2, 1)
        }
      }
    }
  }

  // Shore foam: geometry is precomputed per terrain rebuild; each frame
  // just fills the paths with animated alpha. The old version rescanned
  // the visible grid twice per frame computing edge masks.
  {
    const foam = _baseKey?.foam
    if (foam) {
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.3
      ctx.fill(foam.thin)
      const foamT = t * 0.0014
      for (let bucket = 0; bucket < foam.thick.length; bucket++) {
        const pulse = Math.sin(foamT + (bucket * Math.PI) / 2)
        if (pulse <= 0.25) continue
        ctx.globalAlpha = 0.55 * Math.min(1, (pulse - 0.25) / 0.75)
        ctx.fill(foam.thick[bucket])
      }
      ctx.globalAlpha = 1
    }
  }

  // Lake shimmer - animated sparkle on shallow water tiles (depth 180-253)
  {
    const dm = world.grid.depth_map
    const shimmerT = t * 0.0015
    const waterFx = renderScale < 1 ? getWaterFxLayers(renderScale) : null
    if (waterFx) {
      // Baked shimmer layer: one blit instead of a full-grid scan
      // issuing a fillRect for every pulsing deep-water tile.
      const pulse = 0.5 + 0.5 * Math.sin(shimmerT * 2.1)
      ctx.globalAlpha = 0.28 * (0.3 + 0.7 * pulse)
      ctx.drawImage(waterFx.shimmer, 0, 0, W, H)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = 'rgba(180,230,255,0.28)'
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
          if (d === null || d < 180) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
          const pulse = Math.sin(shimmerT * 2.1 + ((h & 0xff) / 255) * Math.PI * 2)
          if (pulse < 0.6) continue
          ctx.fillRect(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
        }
      }
    }

    // Integer-aligned wavelets stay within the camera window instead of
    // scanning and antialiasing paths across the whole world.
    if (!LOW_PERF && !overview) {
      ctx.fillStyle = 'rgba(140,200,240,0.2)'
      const wavePhase = Math.floor(shimmerT * 3)
      for (let row = r0; row < r1; row += 2) {
        for (let col = c0; col < c1; col++) {
          const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
          if (d === null || d < 180) continue
          let h = (col * 374761393 + row * 668265263) | 0
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
          if ((h + wavePhase) % 7 !== 0) continue
          const wx = col * TILE + 1 + ((h >>> 8) & 1)
          const wy = row * TILE + 2 + ((wavePhase + (h >>> 10)) & 3)
          ctx.fillRect(wx, wy, 3, 1)
        }
      }
    }
  }

  // Food patches and minerals are baked per (terrain, scale); zoomed-out
  // frames blit that layer and only iterate for the animated tiles
  // (fire/campfire/hut). The naive loop was ~6 fillRects per food tile
  // every frame - hundreds of thousands of calls on grown worlds.
  const bakedDecor = renderScale < 1 ? getTileDecorLayer(renderScale) : null
  if (bakedDecor) ctx.drawImage(bakedDecor, 0, 0, W, H)
  for (let row = r0; row < r1; row++) {
    for (let col = c0; col < c1; col++) {
      const tile = tiles[row][col]
      if (bakedDecor) {
        if (tile !== TILE_ID.FIRE && tile !== TILE_ID.CAMPFIRE && tile !== TILE_ID.HUT) {
          continue
        }
      } else if (
        tile !== TILE_ID.FOOD &&
        tile !== TILE_ID.FIRE &&
        tile !== TILE_ID.CAMPFIRE &&
        tile !== TILE_ID.HUT &&
        tile !== TILE_ID.MINERAL
      ) {
        continue
      }
      const px = col * TILE
      const py = row * TILE
      const seed = visualTileHash(col + ox, row + oy)

      if (!bakedDecor && tile === TILE_ID.FOOD) {
        drawFoodPatch(ctx, px, py, seed)
      }

      if (!bakedDecor && tile === TILE_ID.MINERAL) {
        drawMineralOutcrop(ctx, px, py, seed)
      }

      if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE) {
        const fi = fire_intensity?.[row]?.[col] ?? 1
        const isCampfire = tile === TILE_ID.CAMPFIRE
        if (!world.is_day && !overview) {
          const fcx = px + TILE / 2
          const fcy = py + TILE / 2
          const flicker = 0.88 + Math.sin(t * 0.011 + col * 3.1 + row * 1.7) * 0.12
          const lr = TILE * (isCampfire ? 4.2 : 3.2) * flicker
          const grad = ctx.createRadialGradient(fcx, fcy, TILE * 0.4, fcx, fcy, lr)
          grad.addColorStop(0, `rgba(255,190,90,${0.36 * fi})`)
          grad.addColorStop(0.45, `rgba(255,150,50,${0.14 * fi})`)
          grad.addColorStop(1, 'rgba(255,120,30,0)')
          ctx.fillStyle = grad
          ctx.fillRect(fcx - lr, fcy - lr, lr * 2, lr * 2)
        }
        drawPixelFire(ctx, px, py, fi, Math.floor(t / 170 + (seed & 7)), isCampfire)
      }

      if (tile === TILE_ID.HUT && !ruinedTiles.has(`${col + ox},${row + oy}`)) {
        const BW = TILE
        const BH = TILE
        const bx = px
        const by = py
        const dp = world.day_progress ?? 0.5
        const nightFactor = world.is_day ? 0 : 1 - Math.abs(dp - 0.5) * 2
        const glowAlpha = 0.04 + 0.18 * nightFactor
        ctx.fillStyle = `rgba(255,215,110,${glowAlpha})`
        ctx.fillRect(bx - TILE / 2, by - TILE / 2, BW + TILE, BH + TILE)
        const hutVariant = (((col * 73856093) ^ (row * 19349663)) >>> 0) & 7
        const hutNight = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
        const hutSprite = getBuildingSprite('Hut', 1, 1, TILE, hutVariant, hutNight, 1)
        if (hutSprite) {
          ctx.drawImage(
            hutSprite,
            Math.round(bx - SPRITE_PAD),
            Math.round(by + BH + SPRITE_PAD_BOT - hutSprite.height),
          )
        }
        const now = Date.now()
        const smokeAlpha = !world.is_day && !overview ? 0.25 : 0
        if (smokeAlpha > 0) {
          for (let s = 0; s < 3; s++) {
            const phase = (now * 0.0008 + s * 0.4) % 1
            ctx.fillStyle = `rgba(180,180,185,${smokeAlpha * (1 - phase)})`
            const smokeSize = 1 + Math.floor(phase * 2)
            ctx.fillRect(
              Math.round(bx + BW / 2 + Math.sin(phase * Math.PI) * 2),
              Math.round(by - phase * 10),
              smokeSize + 1,
              smokeSize,
            )
          }
        }
      }
    }
  }

  // Settlement markers: draw a subtle ring around clusters of 3+ huts.
  // Hut tile positions are cached per terrain grid, and the clustering
  // itself (an O(n^2) scan) is cached with them - only the ring drawing
  // is animated per frame.
  {
    const hutPositions = hutTileList(tiles)
    if (hutPositions.length >= 3) {
      const clusters = cachedHutClusters(hutPositions)
      for (const { cx: cx2, cy: cy2, count: clusterLength } of clusters) {
        const r2 = Math.sqrt(clusterLength) * TILE * 2.2 + TILE * 3
        const px2 = cx2 * TILE + TILE / 2
        const py2 = cy2 * TILE + TILE / 2
        ctx.save()
        // Settlement ring
        ctx.strokeStyle = `rgba(200,170,80,${Math.min(0.45, 0.2 + clusterLength * 0.04)})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(px2, py2, r2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        // Town hall icon for large settlements (5+ huts)
        if (clusterLength >= 5) {
          const TH = TILE * 3.5 // town hall icon size
          const tx = px2 - TH / 2
          const ty = py2 - TH / 2
          // Glow
          ctx.fillStyle = 'rgba(255,220,130,0.22)'
          ctx.fillRect(tx - TILE, ty - TILE, TH + TILE * 2, TH + TILE * 2)
          // Main body
          ctx.fillStyle = '#d4b87a'
          ctx.fillRect(tx + 2, ty + TH * 0.36, TH - 4, TH * 0.64 - 1)
          // Main roof
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty)
          ctx.lineTo(tx + TH, ty + TH * 0.38)
          ctx.lineTo(tx, ty + TH * 0.38)
          ctx.closePath()
          ctx.fill()
          // Central tower
          const tw = TH * 0.22
          const th2 = TH * 0.85
          ctx.fillStyle = '#c0a870'
          ctx.fillRect(px2 - tw / 2, ty - th2 * 0.2, tw, th2 * 0.65)
          ctx.fillStyle = '#6a3820'
          ctx.beginPath()
          ctx.moveTo(px2, ty - th2 * 0.28)
          ctx.lineTo(px2 + tw / 2 + 1, ty - th2 * 0.2)
          ctx.lineTo(px2 - tw / 2 - 1, ty - th2 * 0.2)
          ctx.closePath()
          ctx.fill()
          // Door
          ctx.fillStyle = '#2a1000'
          ctx.fillRect(px2 - TH * 0.06, ty + TH * 0.55, TH * 0.12, TH * 0.45 - 1)
          // Windows
          ctx.fillStyle = 'rgba(255,235,150,0.65)'
          ctx.fillRect(tx + 4, ty + TH * 0.42, 4, 4)
          ctx.fillRect(tx + TH - 8, ty + TH * 0.42, 4, 4)
        }
        ctx.restore()
      }
    }
  }

  if (structure) {
    for (let row = r0; row < r1; row++) {
      for (let col = c0; col < c1; col++) {
        const s = structure[row][col]
        if (s < 0.05) continue
        const t = tiles[row][col]
        if (t === 8) continue
        const px = col * TILE
        const py = row * TILE
        const alpha = Math.min(0.95, 0.4 + s * 0.55)
        if (TILE >= 8) {
          const cx2 = px + TILE / 2
          if (s >= 0.7) {
            ctx.fillStyle = `rgba(120,90,60,${0.6 + s * 0.3})`
            ctx.fillRect(px + 1, py + TILE * 0.5, TILE - 2, TILE * 0.5 - 1)
            ctx.fillStyle = `rgba(90,70,50,${0.7 + s * 0.25})`
            ctx.beginPath()
            ctx.moveTo(cx2, py + 2)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.52)
            ctx.lineTo(px + 2, py + TILE * 0.52)
            ctx.closePath()
            ctx.fill()
            ctx.fillStyle = 'rgba(160,140,110,0.5)'
            ctx.fillRect(px + 2, py + TILE * 0.55, 3, 3)
            ctx.fillRect(px + TILE - 5, py + TILE * 0.65, 3, 3)
          } else if (s >= 0.35) {
            ctx.fillStyle = `rgba(100,65,30,${0.45 + s * 0.4})`
            ctx.fillRect(px + 2, py + TILE * 0.45, TILE - 4, TILE * 0.55 - 1)
            ctx.fillStyle = `rgba(80,50,20,${0.5 + s * 0.35})`
            ctx.beginPath()
            ctx.moveTo(cx2 - 1, py + 3)
            ctx.lineTo(px + TILE - 2, py + TILE * 0.47)
            ctx.lineTo(px + 2, py + TILE * 0.47)
            ctx.closePath()
            ctx.fill()
          } else {
            ctx.fillStyle = `rgba(130,95,45,${s * 2.5})`
            ctx.fillRect(px + 1, py + TILE * 0.6, TILE - 2, TILE * 0.35)
          }
        } else {
          const r = s >= 0.7 ? 120 : s >= 0.35 ? 100 : 130
          const g = s >= 0.7 ? 90 : s >= 0.35 ? 65 : 95
          const b = s >= 0.7 ? 60 : s >= 0.35 ? 30 : 45
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }

  if (overlay === 'hazard' && world.grid.hazard) {
    const haz = world.grid.hazard
    for (let row = r0; row < r1; row++) {
      const r = haz[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(220,40,30,${Math.min(0.75, v * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'fertility' && world.grid.fertility) {
    const fer = world.grid.fertility
    for (let row = r0; row < r1; row++) {
      const r = fer[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.1) continue
        ctx.fillStyle = `rgba(80,200,80,${Math.min(0.55, v * 0.6)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'structures' && world.grid.structure) {
    const str = world.grid.structure
    for (let row = r0; row < r1; row++) {
      const r = str[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const v = r[col] ?? 0
        if (v < 0.05) continue
        ctx.fillStyle = `rgba(255,170,60,${Math.min(0.7, v * 0.8)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'trails') {
    const ft = world.grid.food_trail
    const wt = world.grid.water_trail
    const pt = world.grid.path_trail
    for (let row = r0; row < r1; row++) {
      const fr = ft?.[row]
      const wr = wt?.[row]
      const pr = pt?.[row]
      for (let col = c0; col < c1; col++) {
        const f = fr?.[col] ?? 0
        const w = wr?.[col] ?? 0
        const p = pr?.[col] ?? 0
        if (f < 0.05 && w < 0.05 && p < 0.05) continue
        const r = Math.round(255 * f + 70 * w + 40 * p)
        const g = Math.round(200 * f + 130 * w + 200 * p)
        const b = Math.round(40 * f + 220 * w + 70 * p)
        const a = Math.min(0.65, (f + w + p) * 0.5)
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'age') {
    const n = height * width
    const sum = scratchA(n)
    const cnt = scratchB(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx = Math.round(org.x - ox),
        ty = Math.round(org.y - oy)
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx,
            ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const idx = ny * width + nx
          sum[idx] += org.age
          cnt[idx] += 1
        }
      }
    }
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const idx = rowBase + col
        const c = cnt[idx]
        if (c === 0) continue
        const t = Math.min(1, sum[idx] / c / 3000)
        const r = Math.round(80 + t * 175)
        const g = Math.round(220 - t * 140)
        const b = Math.round(180 - t * 160)
        ctx.fillStyle = `rgba(${r},${g},${b},0.55)`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'threat') {
    const n = height * width
    const heat = scratchA(n)
    for (const org of organisms) {
      if (!org.alive || (org.fear_level ?? 0) < 0.3) continue
      const tx = Math.round(org.x - ox),
        ty = Math.round(org.y - oy)
      const R = 3
      const f = org.fear_level ?? 0
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx + dx,
            ny = ty + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          heat[ny * width + nx] += (f * (R - d + 1)) / (R + 1)
        }
      }
    }
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const v = heat[rowBase + col]
        if (v < 0.15) continue
        const t = Math.min(1, v / 2)
        ctx.fillStyle = `rgba(255,${Math.round(140 - t * 100)},${Math.round(60 - t * 40)},${(0.3 + t * 0.4).toFixed(2)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (overlay === 'density') {
    const n = height * width
    const grid2d = scratchA(n)
    for (const org of organisms) {
      if (!org.alive) continue
      const tx2 = Math.round(org.x - ox),
        ty2 = Math.round(org.y - oy)
      const R = 4
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > R) continue
          const nx = tx2 + dx,
            ny = ty2 + dy
          if (nx >= 0 && ny >= 0 && ny < height && nx < width) {
            grid2d[ny * width + nx] += R - d + 1
          }
        }
      }
    }
    let maxD = 1
    for (let k = 0; k < n; k++) if (grid2d[k] > maxD) maxD = grid2d[k]
    for (let row = r0; row < r1; row++) {
      const rowBase = row * width
      for (let col = c0; col < c1; col++) {
        const v = grid2d[rowBase + col]
        if (v < 1) continue
        const t2 = Math.min(v / maxD, 1)
        ctx.fillStyle = `rgba(${Math.round(80 + t2 * 175)},${Math.round(200 - t2 * 100)},${Math.round(255 - t2 * 200)},${0.25 + t2 * 0.45})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
  }

  if (viewFlags.territory && world.territory) {
    const index = buildTerritoryIndex(world.territory)
    const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null

    for (const claim of world.territory.claimed) {
      const standing = territoryStanding(claim.lid, focusedLineage, world.tribal_relations)
      const emphasis = territoryEmphasis(standing)
      const color = lineageColor(claim.lid)
      const fill = color.replace('hsl(', 'hsla(').replace(')', `, ${emphasis.fillAlpha})`)
      const border =
        emphasis.borderColor ??
        color
          .replace(/(\d+)%\)$/, (_, lightness) => `${Math.max(15, Number(lightness) - 24)}%, 0.9)`)
          .replace('hsl(', 'hsla(')

      ctx.beginPath()
      for (const [worldTileX, worldTileY] of claim.tiles) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        ctx.rect(col * TILE, row * TILE, TILE, TILE)
      }
      ctx.fillStyle = fill
      ctx.fill()

      ctx.beginPath()
      const owns = (x: number, y: number) =>
        index.ownersByTile.get(territoryTileKey(x, y))?.includes(claim.lid) === true
      for (const [worldTileX, worldTileY] of claim.tiles) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        const px = col * TILE
        const py = row * TILE
        if (!owns(worldTileX, worldTileY - 1)) {
          ctx.moveTo(px, py)
          ctx.lineTo(px + TILE, py)
        }
        if (!owns(worldTileX + 1, worldTileY)) {
          ctx.moveTo(px + TILE, py)
          ctx.lineTo(px + TILE, py + TILE)
        }
        if (!owns(worldTileX, worldTileY + 1)) {
          ctx.moveTo(px + TILE, py + TILE)
          ctx.lineTo(px, py + TILE)
        }
        if (!owns(worldTileX - 1, worldTileY)) {
          ctx.moveTo(px, py + TILE)
          ctx.lineTo(px, py)
        }
      }
      ctx.strokeStyle = border
      ctx.lineWidth = emphasis.borderWidth
      ctx.stroke()
    }

    if (world.territory.contested.length > 0) {
      const pulse = 0.12 + Math.abs(Math.sin(t / 420)) * 0.16
      ctx.beginPath()
      for (const [worldTileX, worldTileY] of world.territory.contested) {
        const col = worldTileX - ox
        const row = worldTileY - oy
        if (col < c0 || col >= c1 || row < r0 || row >= r1) continue
        ctx.rect(col * TILE, row * TILE, TILE, TILE)
      }
      ctx.fillStyle = `rgba(255,255,255,${pulse})`
      ctx.fill()
    }
  }

  drawClouds(ctx, W, H, world.weather, t)

  if (viewFlags.history && world.lineage_centroid_history) {
    ctx.save()
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [lid, samples] of Object.entries(world.lineage_centroid_history)) {
      if (!samples || samples.length < 2) continue
      const hsl = lineageColor(lid)
      for (let i = 1; i < samples.length; i++) {
        const [, x0, y0] = samples[i - 1]
        const [, x1, y1] = samples[i]
        const a = 0.15 + 0.7 * (i / samples.length)
        ctx.strokeStyle = hsl.replace('hsl(', 'hsla(').replace(')', `, ${a.toFixed(2)})`)
        ctx.beginPath()
        ctx.moveTo((x0 - ox) * TILE + TILE / 2, (y0 - oy) * TILE + TILE / 2)
        ctx.lineTo((x1 - ox) * TILE + TILE / 2, (y1 - oy) * TILE + TILE / 2)
        ctx.stroke()
      }
      const [, lx, ly] = samples[samples.length - 1]
      ctx.fillStyle = hsl.replace('hsl(', 'hsla(').replace(')', ', 0.95)')
      ctx.beginPath()
      ctx.arc((lx - ox) * TILE + TILE / 2, (ly - oy) * TILE + TILE / 2, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  if (viewFlags.fertility && fertility) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const r = fertility[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const f = r[col]
        if (f == null) continue
        if (f > 0.55) {
          ctx.fillStyle = `rgba(80,180,80,${Math.min(0.45, (f - 0.55) * 1.2)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        } else if (f < 0.25) {
          ctx.fillStyle = `rgba(150,90,50,${Math.min(0.45, (0.25 - f) * 1.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.hazard && hazard) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const r = hazard[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        const h = r[col]
        if (h == null || h < 0.02) continue
        ctx.fillStyle = `rgba(200,40,40,${Math.min(0.55, h * 0.9)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    ctx.restore()
  }

  // Always show high-traffic paths subtly (helps map feel lived-in)
  if (path_trail) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      const pr = path_trail[row]
      if (!pr) continue
      for (let col = c0; col < c1; col++) {
        const p = pr[col] ?? 0
        if (p < 0.55) continue
        ctx.fillStyle = `rgba(160,130,80,${Math.min(0.28, p * 0.3)})`
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    ctx.restore()
  }

  if (viewFlags.trails && (food_trail || water_trail || path_trail)) {
    ctx.save()
    for (let row = r0; row < r1; row++) {
      for (let col = c0; col < c1; col++) {
        const f = food_trail?.[row]?.[col] ?? 0
        const w = water_trail?.[row]?.[col] ?? 0
        const p = path_trail?.[row]?.[col] ?? 0
        if (f < 0.1 && w < 0.1 && p < 0.1) continue
        if (p >= 0.1) {
          ctx.fillStyle = `rgba(220,220,220,${Math.min(0.35, p * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (f >= 0.1) {
          ctx.fillStyle = `rgba(240,220,80,${Math.min(0.4, f * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
        if (w >= 0.1) {
          ctx.fillStyle = `rgba(100,170,240,${Math.min(0.4, w * 0.5)})`
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.structures && structure) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,210,140,0.7)'
    ctx.lineWidth = 1
    for (let row = r0; row < r1; row++) {
      const r = structure[row]
      if (!r) continue
      for (let col = c0; col < c1; col++) {
        if (r[col] && r[col] > 0.1) {
          ctx.strokeRect(col * TILE + 0.5, row * TILE + 0.5, TILE - 1, TILE - 1)
        }
      }
    }
    ctx.restore()
  }

  if (viewFlags.partners) {
    // Pre-filter to partnered orgs before building the lookup map.
    // Most orgs are unpartnered; building a full byId map of all
    // organisms is wasted work each frame.
    const partnered: WorldState['organisms'] = []
    for (const o of organisms) {
      if (o.alive && o.partner_id) partnered.push(o)
    }
    if (partnered.length >= 2) {
      const byId = new Map<string, (typeof partnered)[number]>()
      for (const o of partnered) byId.set(o.id, o)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,170,200,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const org of partnered) {
        if (!org.partner_id) continue
        if (org.id >= org.partner_id) continue
        const partner = byId.get(org.partner_id)
        if (!partner) continue
        const ax = (org.x - ox) * TILE + TILE / 2
        const ay = (org.y - oy) * TILE + TILE / 2
        const bx = (partner.x - ox) * TILE + TILE / 2
        const by = (partner.y - oy) * TILE + TILE / 2
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
      }
      // Single stroke() at the end instead of per-edge - cuts state-
      // change overhead when there are many partnered pairs.
      ctx.stroke()
      ctx.restore()
    }
  }

  if (world.farms && world.farms.length > 0) {
    ctx.save()
    for (const farm of world.farms) {
      const localX = farm.x - ox
      const localY = farm.y - oy
      if (localX < c0 - 1 || localX > c1 || localY < r0 - 1 || localY > r1) continue
      const x = localX * TILE
      const y = localY * TILE
      const progress = farmProgress(farm, world.tick)
      const stage = farmStage(farm, world.tick)
      const cropColor = farmCropColor(farm.crop)

      ctx.fillStyle = '#3f2c21'
      ctx.fillRect(x, y, TILE, TILE)
      ctx.fillStyle = stage === 'fallow' ? '#6b4c32' : '#705335'
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
      ctx.fillStyle = stage === 'mature' ? '#b98b45' : '#4a3326'
      for (let row = 2; row < TILE - 1; row += 3) {
        ctx.fillRect(x + 1, y + row, TILE - 2, 1)
      }
      if (stage !== 'fallow') {
        ctx.fillStyle = cropColor
        const plantHeight = Math.max(1, Math.round(1 + progress * 4))
        const cropOffset = (farm.crop?.length ?? 0) % 2
        for (let plantX = 2 + cropOffset; plantX < TILE - 1; plantX += 3) {
          ctx.fillRect(x + plantX, y + TILE - plantHeight - 1, 1, plantHeight)
          if (plantHeight >= 3) ctx.fillRect(x + plantX + 1, y + TILE - plantHeight, 1, 1)
        }
      }
      if (stage === 'mature') {
        ctx.fillStyle = 'rgba(255, 232, 145, 0.9)'
        ctx.fillRect(x, y, TILE, 1)
        ctx.fillRect(x, y + TILE - 1, TILE, 1)
        ctx.fillRect(x, y, 1, TILE)
        ctx.fillRect(x + TILE - 1, y, 1, TILE)
      }
    }
    ctx.restore()
  }

  if (world.buildings && world.buildings.length > 0) {
    // Viewport-clip the building loop. Buildings are world-positioned;
    // c0/r0/c1/r1 are the tile-aligned visible window already computed
    // by the camera step. A generous 6-tile margin covers the tallest
    // building footprints without false-negative culling.
    const BLDG_MARGIN = 6
    const cxLo = c0 - BLDG_MARGIN
    const cxHi = c1 + BLDG_MARGIN
    const ryLo = r0 - BLDG_MARGIN
    const ryHi = r1 + BLDG_MARGIN
    const bdp = world.day_progress ?? 0.5
    const bNight = world.is_day ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(bdp - 0.5) * 2))
    const buildingDetail = zoomDetailLevel(cameraZoom)
    const sorted = [...world.buildings].sort(compareBuildingsByDepth)
    for (const b of sorted) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
      if (b.x < cxLo || b.x > cxHi || b.y < ryLo || b.y > ryHi) continue
      drawBuilding(
        ctx,
        {
          id: b.id,
          kind: b.kind,
          x: b.x,
          y: b.y,
          condition: b.condition,
          damage: b.damage,
          integrity: b.integrity,
          ruined: b.ruined,
          repairing: b.repairing,
          footprint: b.footprint,
          fw: b.fw,
          fh: b.fh,
        },
        ox,
        oy,
        TILE,
        bNight,
        buildingDetail,
      )
    }
    type Cluster = {
      cx: number
      cy: number
      count: number
      lineage: string
      name?: string
      tier?: number
      tierName?: string
      population?: number
    }
    const clusters: Cluster[] = []
    const CITY_RADIUS_SQ = 14 * 14
    if (world.settlements?.length) {
      for (const settlement of world.settlements) {
        const [cx, cy] = settlement.center
        if (cx < cxLo || cx > cxHi || cy < ryLo || cy > ryHi) continue
        clusters.push({
          cx,
          cy,
          count: settlement.building_count,
          lineage: settlement.lineage_id,
          name: settlement.name,
          tier: settlement.tier,
          tierName: settlement.tier_name,
          population: settlement.population,
        })
      }
    } else {
      // Legacy snapshots lack authoritative settlements. Retain the old
      // visual clustering as a compatibility fallback only.
      for (const b of world.buildings) {
        if (!getBuildingState(b).isOperational) continue
        const lid = (b as { lineage_id?: string }).lineage_id ?? ''
        if (!lid) continue
        const bx = b.x
        const by = b.y
        if (bx < cxLo || bx > cxHi || by < ryLo || by > ryHi) continue
        const existing = clusters.find(
          (c) => c.lineage === lid && (c.cx - bx) ** 2 + (c.cy - by) ** 2 < CITY_RADIUS_SQ,
        )
        if (existing) {
          existing.cx = (existing.cx * existing.count + bx) / (existing.count + 1)
          existing.cy = (existing.cy * existing.count + by) / (existing.count + 1)
          existing.count++
        } else {
          clusters.push({ cx: bx, cy: by, count: 1, lineage: lid })
        }
      }
    }
    const lineageNames = world.lineage_names ?? {}
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const c of clusters) {
      const major = (c.tier ?? (c.count >= 12 ? 5 : 0)) >= 5
      const showSettlementLabel =
        c.tier !== 0 && !(c.tier === undefined && c.count < 4) && (buildingDetail !== 'overview' || major)
      if (!showSettlementLabel) continue
      const name = c.name ?? lineageNames[c.lineage] ?? c.lineage.slice(0, 6)
      const label =
        c.tier !== undefined
          ? c.tier >= 5
            ? `${name.toUpperCase()} CITY`
            : `${name} ${c.tierName ?? 'settlement'}`
          : c.count >= 12
            ? `${name.toUpperCase()} CITY`
            : c.count >= 8
              ? `${name} town`
              : `${name} village`
      // Font must be set before measuring; clamp so edge settlements
      // don't render half-off the world canvas.
      ctx.font = major ? 'bold 12px monospace' : '10px monospace'
      const halfW = ctx.measureText(label).width / 2
      const lx = Math.min(Math.max((c.cx - ox) * TILE, halfW + 4), Math.max(W - halfW - 4, halfW + 4))
      const ly = Math.max((c.cy - oy) * TILE - TILE * 2, 10)
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillText(label, lx + 1, ly + 1)
      ctx.fillStyle = major ? '#ffd28a' : (c.tier ?? 0) >= 4 || c.count >= 8 ? '#e5c89a' : '#c8b890'
      ctx.fillText(label, lx, ly)
      ctx.font = '8px monospace'
      ctx.fillStyle = '#8a8170'
      ctx.fillText(
        c.population !== undefined ? `${c.population} people · ${c.count} buildings` : `${c.count} bldgs`,
        lx,
        ly + 10,
      )
    }
    ctx.restore()
  }

  drawTradeNetwork2D(ctx, world, { c0, c1, r0, r1 }, t)

  if (viewFlags.animals && animals.length > 0) {
    ctx.save()
    const atlasReady = ATLAS_CREATURE.complete && ATLAS_CREATURE.naturalWidth > 0
    if (_animalLastPos.size > Math.max(256, animals.length * 3)) {
      const visibleIds = new Set(animals.map((animal) => animal.id))
      for (const id of _animalLastPos.keys()) {
        if (!visibleIds.has(id)) _animalLastPos.delete(id)
      }
    }
    for (const animal of [...animals].sort((a, b) => a.y - b.y || a.id - b.id)) {
      if (
        animal.x - ox < c0 - 3 ||
        animal.x - ox > c1 + 3 ||
        animal.y - oy < r0 - 3 ||
        animal.y - oy > r1 + 3
      )
        continue
      const motion = characterMotion(_animalLastPos.get(animal.id), animal.x, animal.y, t, 0)
      _animalLastPos.set(animal.id, motion)
      const small = animal.kind === 'fish' || animal.kind === 'bird' || animal.kind === 'rabbit'
      const size = small ? 14 : 20
      const moving = animal.kind === 'fish' || animal.kind === 'bird' || t - motion.movedAt < 320
      const speed =
        animal.kind === 'fish'
          ? 0.0028
          : animal.kind === 'bird'
            ? 0.005
            : animal.kind === 'wolf' || animal.kind === 'dog'
              ? 0.0042
              : 0.0036
      const amp = animal.kind === 'fish' ? 1.4 : animal.kind === 'bird' ? 1.6 : moving ? 0.55 : 0
      const phase = t * speed + animal.id * 0.7
      const yOff = Math.sin(phase) * amp
      const cx = (animal.x - ox) * TILE + TILE / 2
      const cy = (animal.y - oy) * TILE + TILE / 2 + yOff
      if (animal.kind !== 'fish' && animal.kind !== 'bird') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(cx, cy + size * 0.42, size * 0.32, size * 0.14, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      const flip = motion.flipped
      if (drawFaunaSprite(ctx, animal.kind, animal.id, cx, cy, size, flip)) continue
      if (animal.kind === 'wolf' || animal.kind === 'dog') {
        drawCanineSprite(
          ctx,
          cx,
          cy,
          size,
          animal.kind,
          flip,
          moving ? Math.floor(t / 220 + animal.id) & 1 : 0,
        )
      } else if (atlasReady) {
        // Tiny Creatures is a catalogue, not an animation strip. Keep each
        // animal on one deterministic variant so deer never morph into boar.
        const tile = pickAnimalTile(animal.kind, animal.id)
        const dx = Math.round(cx - size / 2)
        const dy = Math.round(cy - size / 2)
        if (!tile) {
          continue
        } else if (flip) {
          ctx.save()
          ctx.translate(dx + size, 0)
          ctx.scale(-1, 1)
          drawTile(ctx, ATLAS_CREATURE, tile, 0, dy, size)
          ctx.restore()
        } else {
          drawTile(ctx, ATLAS_CREATURE, tile, dx, dy, size)
        }
      } else {
        ctx.fillStyle = animal.kind === 'fish' ? '#6f9fb0' : '#8a6a4a'
        ctx.beginPath()
        ctx.ellipse(cx, cy, size * 0.32, size * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  const lineageErasMap = normalizeLineageEras(world.lineage_eras)

  const isFocused = (org: WorldState['organisms'][0]) => {
    if (focus === 'all') return true
    if (focus.startsWith('lineage:')) return org.lineage_id === focus.slice(8)
    if (focus === 'sick') return org.infection > 0.15
    if (focus === 'hungry') return org.energy < 0.3
    if (focus === 'elders') return !!org.is_elder
    if (focus === 'builders')
      return !!(org.discoveries ?? []).some((d) =>
        ['shelter', 'fire', 'masonry', 'stone_tools', 'spear'].includes(d),
      )
    if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
    return true
  }

  if (_orgLastPos.size > Math.max(512, organisms.length * 3)) {
    const visibleIds = new Set(organisms.map((organism) => organism.id))
    for (const id of _orgLastPos.keys()) {
      if (!visibleIds.has(id)) _orgLastPos.delete(id)
    }
  }

  const characterDetail = zoomDetailLevel(cameraZoom)
  // Batch every organism shadow into two paths (focused / dimmed) so the
  // whole population costs two fills instead of hundreds of separate
  // beginPath/ellipse/fill draw calls per frame.
  {
    const focusedShadows = new Path2D()
    const dimShadows = new Path2D()
    let any = false
    for (const org of organisms) {
      if (!org.alive) continue
      if (org.home_x && org.home_y) {
        const ddx = org.x - org.home_x
        const ddy = org.y - org.home_y
        if (ddx * ddx + ddy * ddy < 2.0) {
          if ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15) continue
        }
      }
      const px = (org.x - ox) * TILE + TILE / 2
      const py = (org.y - oy) * TILE + TILE / 2
      const variant = orgVariant(org.id)
      const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
      const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
      const target = isFocused(org) ? focusedShadows : dimShadows
      const shadowCx = px + 1
      const shadowCy = py + spriteSize * 0.2
      const shadowRx = spriteSize * 0.27
      // moveTo to the ellipse's own start point first - ellipse()/arc() on a
      // Path2D that already has a current point implicitly draws a straight
      // line from there to the new arc's start. Without this, consecutive
      // organisms' shadows in this shared path get bridged by an invisible
      // edge (and the final fill's implicit close), which at low zoom reads
      // as huge black wedges connecting unrelated organisms across the map.
      target.moveTo(shadowCx + shadowRx, shadowCy)
      target.ellipse(shadowCx, shadowCy, shadowRx, spriteSize * 0.1, 0, 0, Math.PI * 2)
      any = true
    }
    if (any) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.globalAlpha = 0.12
      ctx.fill(dimShadows)
      ctx.globalAlpha = 1
      ctx.fill(focusedShadows)
    }
  }
  for (const org of [...organisms].sort(compareCharacterDepth)) {
    if (!org.alive) continue
    // Data-driven house entry: use actual sleep_debt, energy, health fields - no text matching
    if (org.home_x && org.home_y) {
      const ddx = org.x - org.home_x
      const ddy = org.y - org.home_y
      if (ddx * ddx + ddy * ddy < 2.0) {
        if ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15) continue
      }
    }
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const focused = isFocused(org)
    const isSelected = org.id === selectedOrgId
    const fullDetail = isSelected || characterDetail === 'detail'
    const standardDetail = isSelected || characterDetail !== 'overview'
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const orgSex: 'male' | 'female' = org.sex === 'female' ? 'female' : 'male'
    const stage = resolveAgeStage(org)
    // The atlas owns age-specific proportions. Keeping one destination box
    // prevents infants and children from being scaled down twice.
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78
    ctx.globalAlpha = focused ? 1 : 0.12

    const isSignaling = org.thought.startsWith('"') || org.thought.startsWith("'")
    if (standardDetail && (isSignaling || org.thought === 'sounding alarm')) {
      ctx.strokeStyle =
        org.thought.includes('!') || org.thought === 'sounding alarm'
          ? 'rgba(255,68,136,0.6)'
          : 'rgba(255,255,68,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
    } else if (standardDetail && (org.thought === 'challenging' || org.thought === 'challenging alone')) {
      ctx.strokeStyle = org.thought === 'challenging' ? 'rgba(255,34,0,0.85)' : 'rgba(204,68,34,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py - 11)
      ctx.lineTo(px + 11, py)
      ctx.lineTo(px, py + 11)
      ctx.lineTo(px - 11, py)
      ctx.closePath()
      ctx.stroke()
    }

    if (standardDetail && org.infection > 0.15) {
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    if (isSelected) {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(px, py + 2, spriteSize * 0.42, spriteSize * 0.24, 0, 0, Math.PI * 2)
      // soft warm halo makes the selection readable over any biome
      ctx.strokeStyle = 'rgba(255, 210, 138, 0.35)'
      ctx.lineWidth = 3.5
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.lineDashOffset = -t * 0.01
      ctx.stroke()
      ctx.restore()
    }

    if (standardDetail && org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 0.75 + org.traits.resilience : 1
      ctx.beginPath()
      ctx.ellipse(px, py + 3, spriteSize * 0.34, spriteSize * 0.17, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Keep simulation state visible as a restrained aura, not an opaque shape
    // painted over the character art.
    let bodyFill: string
    if (org.infection > 0.38) bodyFill = 'hsl(85,60%,48%)'
    else if ((org.fear_level ?? 0) > 0.72) bodyFill = 'hsl(10,70%,48%)'
    else if ((org.grief_ticks ?? 0) > 12) bodyFill = 'hsl(220,50%,50%)'
    else if ((org.joy_ticks ?? 0) > 30) bodyFill = 'hsl(45,80%,62%)'
    else if (org.energy < 0.12) bodyFill = 'hsl(38,55%,38%)'
    else bodyFill = THOUGHT_COLORS[org.thought] ?? '#cccccc'

    if (viewFlags.health) {
      const h = Math.max(0, Math.min(1, org.health))
      const r = Math.round(220 * (1 - h) + 80 * h)
      const g = Math.round(80 * (1 - h) + 200 * h)
      const b = Math.round(80 * (1 - h) + 100 * h)
      bodyFill = `rgb(${r},${g},${b})`
    } else if (viewFlags.age) {
      if (stage === 'elder') bodyFill = '#e9c87a'
      else if (stage === 'infant' || stage === 'child') bodyFill = '#8db5d6'
      else bodyFill = '#b8b8a8'
    }
    ctx.save()
    ctx.globalAlpha *= viewFlags.health || viewFlags.age ? 0.3 : standardDetail ? 0.16 : 0.1
    ctx.fillStyle = bodyFill
    ctx.beginPath()
    ctx.arc(px, py, bodyR + 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    if (standardDetail && viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
      const fa = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,70,70,${fa})`
      ctx.fill()
    }

    if (standardDetail && viewFlags.lineageDot && org.lineage_id) {
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.beginPath()
      ctx.arc(px, py + bodyR * 0.4, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    if (standardDetail && viewFlags.pregnancy && org.pregnant) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 2.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const motion = orgMotion(org.id, org.x, org.y, t)
    const frame = characterFrame(motion, t)
    const drew = drawPeopleTile(
      ctx,
      pickHumanSprite(orgSex, stage, frame, deterministicAppearanceIndex(org.id)),
      Math.round(px - spriteSize / 2),
      Math.round(spriteTop),
      spriteSize,
      motion.flipped,
    )
    if (!drew) {
      ctx.fillStyle = variant.hairColor
      ctx.beginPath()
      ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = variant.accent
      ctx.fillRect(Math.round(px - bodyR * 0.7), Math.round(py + bodyR * 0.15), bodyR * 1.4, 2)
    }

    const era = lineageErasMap[org.lineage_id] ?? ''
    if (standardDetail && era && era !== 'pre-stone' && era !== 'stone') {
      ctx.save()
      ctx.fillStyle = ERA_STRIPE_COLOR[era] ?? 'rgba(255,255,255,0.0)'
      ctx.globalAlpha *= 0.75
      ctx.fillRect(Math.round(px - bodyR), Math.round(py + bodyR + 1), Math.round(bodyR * 2), 1)
      ctx.restore()
    }
    if (org.is_leader) {
      const crownX = Math.round(px - 4)
      const crownY = Math.round(spriteTop - 2)
      ctx.fillStyle = '#f2c84b'
      ctx.fillRect(crownX, crownY, 8, 2)
      ctx.fillRect(crownX, crownY - 2, 2, 2)
      ctx.fillRect(crownX + 3, crownY - 3, 2, 3)
      ctx.fillRect(crownX + 6, crownY - 2, 2, 2)
    }
    const specEmoji = SPECIALTY_EMOJI[org.specialty ?? ''] ?? ''
    if (fullDetail && specEmoji) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(specEmoji, px + bodyR + 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (standardDetail && org.diseases && org.diseases.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F912}', px - bodyR - 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (fullDetail && org.tools) {
      const toolEmoji = pickToolEmoji(org.tools)
      if (toolEmoji) {
        ctx.save()
        ctx.font = '8px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(toolEmoji, px + bodyR + 4, py + bodyR * 0.6)
        ctx.restore()
      }
    }
    if (fullDetail && org.degrees && org.degrees.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F393}', px - bodyR - 4, py + bodyR * 0.6)
      ctx.restore()
    }

    if (standardDetail && org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(Math.round(px + spriteSize * 0.2), Math.round(py - 1), 5, 4)
    }

    const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
    if (showVitals) {
      const barW = Math.max(8, Math.round(spriteSize * 0.55))
      const bx = Math.round(px - barW / 2)
      const by = Math.round(spriteTop - 5)
      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      ctx.fillRect(bx - 1, by - 1, barW + 2, 6)
      ctx.fillStyle = '#55dd55'
      ctx.fillRect(bx, by, Math.round(barW * Math.max(0, Math.min(1, org.energy))), 1)
      ctx.fillStyle = '#4499ff'
      ctx.fillRect(bx, by + 2, Math.round(barW * Math.max(0, Math.min(1, org.hydration))), 1)
      ctx.fillStyle = '#ff665c'
      ctx.fillRect(bx, by + 4, Math.round(barW * Math.max(0, Math.min(1, org.health))), 1)
    }

    const showName = isSelected || (standardDetail && viewFlags.names)
    const showThought =
      (isSelected || (fullDetail && viewFlags.thoughts)) && org.thought && org.thought !== 'observing'
    const labelY = spriteTop - (showVitals ? 10 : 2)

    if (showName) {
      ctx.font = isSelected ? 'bold 10px monospace' : '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(org.name, px, labelY)
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
      ctx.fillText(org.name, px, labelY)
    }

    if (showThought) {
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      const thoughtY = labelY - (showName ? 10 : 0)
      ctx.strokeText(org.thought, px, thoughtY)
      ctx.fillStyle = isSelected ? 'rgba(180,220,255,1)' : 'rgba(180,220,255,0.9)'
      ctx.fillText(org.thought, px, thoughtY)
    }
  }
  ctx.globalAlpha = 1

  // Player strategy beacons are a HUD overlay, so draw them after all
  // organisms and buildings. Otherwise a busy settlement can bury the
  // guidance label under hundreds of sprites.
  if (world.lineage_strategies) {
    const settlementsByLineage = new Map(
      (world.settlements ?? []).map((settlement) => [settlement.lineage_id, settlement]),
    )
    for (const [lineage, entry] of Object.entries(world.lineage_strategies)) {
      const strategy = activeStrategy(entry, world.tick)
      if (!strategy) continue
      const settlement = settlementsByLineage.get(lineage)
      const home = world.lineage_homes?.[lineage]
      const members = organisms.filter((organism) => organism.alive && organism.lineage_id === lineage)
      if (!settlement && !home && members.length === 0) continue
      const wx =
        settlement?.center[0] ??
        home?.[0] ??
        members.reduce((sum, organism) => sum + organism.x, 0) / members.length
      const wy =
        settlement?.center[1] ??
        home?.[1] ??
        members.reduce((sum, organism) => sum + organism.y, 0) / members.length
      const centerX = (wx - ox) * TILE + TILE / 2
      const centerY = (wy - oy) * TILE + TILE / 2
      if (centerX < -32 || centerX > W + 32 || centerY < -32 || centerY > H + 32) continue

      const pulse = 22 + Math.sin(t * 0.003 + wx * 0.11 + wy * 0.07) * 4
      ctx.save()
      ctx.globalAlpha = 0.82
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse + 7, 0, Math.PI * 2)
      ctx.stroke()

      const label = `${strategy.symbol} ${strategy.label} · ${strategyTimeLabel(strategy.ticksRemaining)}`
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelWidth = ctx.measureText(label).width + 12
      const labelY = centerY - pulse - 12
      ctx.globalAlpha = 0.92
      ctx.fillStyle = '#11181c'
      ctx.fillRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.globalAlpha = 1
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 1
      ctx.strokeRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.fillStyle = strategy.color
      ctx.fillText(label, centerX, labelY + 0.5)
      ctx.restore()
    }
  }

  if (viewFlags.fps) {
    fpsSamples.push(t)
    if (fpsSamples.length > 60) fpsSamples.shift()
    let fps = 0
    if (fpsSamples.length >= 2) {
      const span = fpsSamples[fpsSamples.length - 1] - fpsSamples[0]
      if (span > 0) fps = ((fpsSamples.length - 1) * 1000) / span
    }
    const text = `${fps.toFixed(0)} fps · ${organisms.filter((o) => o.alive).length} org`
    ctx.save()
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'right'
    const padX = 6
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(W - tw - padX * 2 - 4, 4, tw + padX * 2, 16)
    ctx.fillStyle = '#aaffdd'
    ctx.fillText(text, W - padX - 4, 16)
    ctx.restore()
  }

  if (viewFlags.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * TILE, 0)
      ctx.lineTo(x * TILE, H)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * TILE)
      ctx.lineTo(W, y * TILE)
      ctx.stroke()
    }
  }
}

function WorldCanvas({
  world,
  interp,
  selectedOrgId,
  overlay,
  focus,
  viewFlags,
  rendererPaused,
  onFirstDraw,
  onDrawError,
  cameraStateRef,
  viewportDims,
}: {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  rendererPaused: boolean
  onFirstDraw: () => void
  onDrawError: (message: string) => void
  cameraStateRef?: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims?: { w: number; h: number }
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const hasDrawn = useRef(false)
  const cachedDepth = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)
  const orgInterpCache = useRef<OrgInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })
  const animalInterpCache = useRef<AnimalInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })

  const worldRef = useRef<WorldState | null>(world)
  const selectedOrgIdRef = useRef<string | null>(selectedOrgId)
  const overlayRef = useRef<string | null>(overlay)
  const focusRef = useRef<string>(focus)
  const viewFlagsRef = useRef<ViewFlags>(viewFlags)
  worldRef.current = world
  selectedOrgIdRef.current = selectedOrgId
  overlayRef.current = overlay
  focusRef.current = focus
  viewFlagsRef.current = viewFlags

  useEffect(() => {
    if (rendererPaused || !viewportDims || !cameraStateRef) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      onDrawError('The browser could not create a 2D canvas. Try reloading this page.')
      return
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(viewportDims.w * dpr))
    canvas.height = Math.max(1, Math.round(viewportDims.h * dpr))
    let raf = 0
    let stopped = false
    let lastDrawnAt: number = 0
    let lastDrawnT: number = -1
    let lastDrawnUI: string = ''
    let lowPerfFrameSkip = 0

    const tick = () => {
      if (stopped) return
      raf = requestAnimationFrame(tick)

      if (LOW_PERF) {
        lowPerfFrameSkip = (lowPerfFrameSkip + 1) % 2
        if (lowPerfFrameSkip === 1) return
      }

      const w = worldRef.current
      if (!w) return

      if (w.grid.depth_map) cachedDepth.current = w.grid.depth_map as number[][]
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]

      const cur = interp?.current.current
      const prev = interp?.prev.current
      const curServerAt = interp?.currentServerAt.current ?? 0
      const prevServerAt = interp?.prevServerAt.current ?? 0
      const currentReceivedAt = interp?.currentReceivedAt.current ?? 0
      const slowMo = viewFlagsRef.current.slowMo
      const fastMo = viewFlagsRef.current.fastMo
      const speedDiv = slowMo ? 0.5 : fastMo ? 2.0 : 1.0
      const interval = Math.max(50, curServerAt - prevServerAt) / speedDiv
      const RENDER_LAG_MS = Math.min(120, interval * 0.5)
      const PREDICT_CAP = 2.0
      const t =
        cur && prev && interval > 0
          ? Math.max(
              0,
              Math.min(PREDICT_CAP, (performance.now() - currentReceivedAt - RENDER_LAG_MS) / interval),
            )
          : 1

      const renderZoom = cameraStateRef?.current.zoom ?? 1
      // Adapt canvas resolution to the camera: zoomed-out views need a
      // fraction of the world-sized bitmap, so skip uploading pixels the
      // screen can't display anyway.
      const detailBucket = zoomDetailLevel(renderZoom)
      const uiKey = `${selectedOrgIdRef.current ?? ''}|${overlayRef.current ?? ''}|${focusRef.current}|${viewFlagsRef.current.territory ? 't' : ''}${viewFlagsRef.current.names ? 'n' : ''}${viewFlagsRef.current.thoughts ? 'h' : ''}${viewFlagsRef.current.animals ? 'a' : ''}${viewFlagsRef.current.grid ? 'g' : ''}|${detailBucket}|${cameraStateRef.current.x}|${cameraStateRef.current.y}|${renderZoom}`
      const settled =
        t >= PREDICT_CAP && lastDrawnT >= PREDICT_CAP && curServerAt === lastDrawnAt && uiKey === lastDrawnUI
      if (settled) return

      let renderOrgs = w.viewport_organisms ?? w.organisms
      if (prev && cur === w) {
        const prevOrgs = prev.viewport_organisms ?? prev.organisms
        const cache = orgInterpCache.current
        if (cache.prevSource !== prevOrgs) {
          cache.prevSource = prevOrgs
          cache.prevById.clear()
          for (const o of prevOrgs) cache.prevById.set(o.id, o)
        }
        if (cache.source !== renderOrgs || cache.frameId !== w.frame_id) {
          cache.source = renderOrgs
          cache.frameId = w.frame_id
          cache.items = renderOrgs.map((o) => ({ ...o }))
        }
        const items = cache.items
        for (let i = 0; i < renderOrgs.length; i++) {
          const o = renderOrgs[i]
          const out = items[i]
          const p = cache.prevById.get(o.id)
          if (p && p.alive && o.alive) {
            out.x = p.x + (o.x - p.x) * t
            out.y = p.y + (o.y - p.y) * t
          } else {
            out.x = o.x
            out.y = o.y
          }
        }
        renderOrgs = items
      }
      let renderAnimals = w.viewport_animals ?? w.animals
      if (prev && cur === w) {
        const prevAnimals = prev.viewport_animals ?? prev.animals
        const cache = animalInterpCache.current
        if (cache.prevSource !== prevAnimals) {
          cache.prevSource = prevAnimals
          cache.prevById.clear()
          for (const a of prevAnimals) cache.prevById.set(a.id, a)
        }
        if (cache.source !== renderAnimals || cache.frameId !== w.frame_id) {
          cache.source = renderAnimals
          cache.frameId = w.frame_id
          cache.items = renderAnimals.map((a) => ({ ...a }))
        }
        const items = cache.items
        for (let i = 0; i < renderAnimals.length; i++) {
          const a = renderAnimals[i]
          const out = items[i]
          const p = cache.prevById.get(a.id)
          if (p) {
            out.x = p.x + (a.x - p.x) * t
            out.y = p.y + (a.y - p.y) * t
          } else {
            out.x = a.x
            out.y = a.y
          }
        }
        renderAnimals = items
      }

      const lerpCycle = (a: number, b: number, k: number) => {
        let diff = b - a
        if (diff > 0.5) diff -= 1
        if (diff < -0.5) diff += 1
        const out = a + diff * k
        return ((out % 1) + 1) % 1
      }
      const lerpedDay = prev ? lerpCycle(prev.day_progress, w.day_progress, t) : w.day_progress
      const lerpedSeason = prev ? lerpCycle(prev.season_progress, w.season_progress, t) : w.season_progress

      const enrichedGrid = {
        ...w.grid,
        depth_map: cachedDepth.current ?? w.grid.depth_map,
        biomes: cachedBiomes.current ?? w.grid.biomes,
      }
      const enrichedWorld: WorldState = {
        ...w,
        grid: enrichedGrid,
        viewport_organisms: renderOrgs,
        viewport_animals: renderAnimals,
        day_progress: lerpedDay,
        season_progress: lerpedSeason,
      }

      // Compute the visible-tile window so per-tile overlay loops can
      // skip rows/cols off-screen. We give a 4-tile margin so panning
      // doesn't reveal blank borders before the next frame redraws.
      let bounds: { c0: number; c1: number; r0: number; r1: number } | undefined
      if (cameraStateRef && viewportDims && viewportDims.w > 0 && viewportDims.h > 0) {
        const cam = cameraStateRef.current
        const zoom = renderZoom > 0 ? renderZoom : 1
        const halfW = viewportDims.w / (2 * zoom)
        const halfH = viewportDims.h / (2 * zoom)
        const MARGIN = 4
        const wG = w.grid.width
        const hG = w.grid.height
        const c0 = Math.max(0, Math.floor((cam.x - halfW) / TILE) - MARGIN)
        const c1 = Math.min(wG, Math.ceil((cam.x + halfW) / TILE) + MARGIN)
        const r0 = Math.max(0, Math.floor((cam.y - halfH) / TILE) - MARGIN)
        const r1 = Math.min(hG, Math.ceil((cam.y + halfH) / TILE) + MARGIN)
        if (c1 > c0 && r1 > r0) bounds = { c0, c1, r0, r1 }
      }

      const scale = pickRenderScale(renderZoom, LOW_PERF)
      const cam = cameraStateRef.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#1a4a80'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(
        dpr * renderZoom,
        0,
        0,
        dpr * renderZoom,
        dpr * (viewportDims.w / 2 - cam.x * renderZoom),
        dpr * (viewportDims.h / 2 - cam.y * renderZoom),
      )
      try {
        drawWorldOnCanvas(
          ctx,
          enrichedWorld,
          selectedOrgIdRef.current,
          overlayRef.current,
          focusRef.current,
          viewFlagsRef.current,
          bounds,
          renderZoom,
          scale,
        )
      } catch (error) {
        stopped = true
        cancelAnimationFrame(raf)
        logger.error('2d-world', 'Drawing failed', error)
        onDrawError('The world could not be drawn. Retry the renderer to restore the map.')
        return
      }

      lastDrawnAt = curServerAt
      lastDrawnT = t
      lastDrawnUI = uiKey

      if (!hasDrawn.current) {
        hasDrawn.current = true
        onFirstDraw()
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      // NOTE: deliberately do NOT reset the module-level terrain caches
      // (_baseCanvas/_baseKey/_tileDecor/_waterFx/...) here. They are
      // keyed by world-data identity and invalidate themselves when the
      // grid changes. This effect re-runs whenever any dep identity
      // changes (e.g. a new interp wrapper or viewport measure), and
      // wiping the caches here used to force a full 11.5M-pixel base
      // rebuild several times per second - the single biggest source of
      // frame stalls in the whole app.
    }
  }, [interp, onFirstDraw, onDrawError, cameraStateRef, viewportDims, rendererPaused])

  return (
    <canvas
      ref={canvasRef}
      aria-label="World terrain and inhabitants"
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

interface Props {
  world: WorldState
  interp?: InterpRefs
  rendererPaused?: boolean
  sandboxArmed?: boolean
  sandboxLabel?: string | null
  sandboxStatus?: string | null
  sandboxRadius?: number
  onSandboxApply?: (worldX: number, worldY: number) => void
}

export function WorldView({
  world,
  interp,
  rendererPaused = false,
  sandboxArmed,
  sandboxLabel,
  sandboxStatus,
  sandboxRadius,
  onSandboxApply,
}: Props) {
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const followOrgId = useUIStore((s) => s.followOrgId)
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const onOrgSelect = useUIStore((s) => s.selectOrg)
  const territoryIndex = useMemo(() => buildTerritoryIndex(world.territory), [world.territory])
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<MapCommand | null>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [mapReady, setMapReady] = useState(false)
  // Stable identity: WorldCanvas's frame-loop effect depends on this
  // callback - an inline arrow restarted that loop on every publish.
  const handleFirstDraw = useCallback(() => setMapReady(true), [])
  const [drawError, setDrawError] = useState<string | null>(null)
  const [rendererKey, setRendererKey] = useState(0)

  const followTarget = followOrgId
    ? (() => {
        const org = world.organisms.find((o) => o.id === followOrgId && o.alive)
        return org ? { x: (org.x - ox) * TILE, y: (org.y - oy) * TILE } : null
      })()
    : null

  // Track pointer-down position so we can distinguish a tap (select)
  // from a drag-then-release (pan). Without this every pan ends with
  // an accidental org-select on the tile under the release point -
  // especially painful on touch where finger jitter is large.
  const pointerDownPos = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMapControl(e.target)) return
    if (!e.isPrimary) {
      if (pointerDownPos.current) pointerDownPos.current.moved = true
      return
    }
    pointerDownPos.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMapControl(e.target)) return
    const down = pointerDownPos.current
    pointerDownPos.current = null
    if (down) {
      const dx = e.clientX - down.x
      const dy = e.clientY - down.y
      if (down.moved || dx * dx + dy * dy > 36) return
    }
    const rect = containerRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: camX, y: camY, zoom } = cameraStateRef.current
    const canvasTileX = (camX + (sx - dims.w / 2) / zoom) / TILE
    const canvasTileY = (camY + (sy - dims.h / 2) / zoom) / TILE
    const worldX = canvasTileX + ox
    const worldY = canvasTileY + oy

    if (
      canvasTileX < 0 ||
      canvasTileY < 0 ||
      canvasTileX >= world.grid.width ||
      canvasTileY >= world.grid.height
    )
      return

    if (sandboxArmed && onSandboxApply) {
      if (
        Math.round(worldX) < ox ||
        Math.round(worldX) >= ox + world.grid.width ||
        Math.round(worldY) < oy ||
        Math.round(worldY) >= oy + world.grid.height
      )
        return
      onSandboxApply(worldX, worldY)
      return
    }

    const tx = Math.floor(worldX)
    const ty = Math.floor(worldY)

    if (viewFlags.territory) {
      const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
      const lineageId = lineageAtTerritoryTile(territoryIndex, tx, ty, focusedLineage)
      onOrgSelect(null)
      useUIStore.setState({ panelOpen: false })
      setFocus(lineageId ? `lineage:${lineageId}` : 'all')
      return
    }

    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

    let nearestOrg: { id: string; dist: number } | null = null
    let nearestOrgDist = Math.min(5, Math.max(1.2, (isCoarse ? 26 : 16) / (TILE * zoom)))
    for (const org of world.viewport_organisms?.length ? world.viewport_organisms : world.organisms) {
      if (!org.alive) continue
      const d = Math.hypot(org.x - worldX, org.y - worldY)
      if (d < nearestOrgDist) {
        nearestOrgDist = d
        nearestOrg = { id: org.id, dist: d }
      }
    }
    if (nearestOrg && nearestOrg.dist < 1.2) {
      onOrgSelect(nearestOrg.id)
      return
    }

    const ruinedBuildingAtTile = hasRuinedBuildingAtWorldTile(world.buildings, tx, ty)
    const localCol = tx - ox
    const localRow = ty - oy
    const tileRow = world.grid?.tiles?.[localRow]
    const tileVal = tileRow ? tileRow[localCol] : undefined
    if (isWaterTile(tileVal) && (!nearestOrg || nearestOrg.dist >= 2.5)) {
      onOrgSelect(null)
      return
    }
    const isHut = tileVal === TILE_ID.HUT
    const structRow = world.grid?.structure?.[localRow]
    const structVal = (structRow && structRow[localCol]) || 0
    if (!ruinedBuildingAtTile && (isHut || structVal >= 0.35)) {
      let bestHost: { id: string; age: number } | null = null
      for (const org of world.organisms) {
        if (!org.alive) continue
        const hx = Math.floor(org.home_x)
        const hy = Math.floor(org.home_y)
        if (hx === tx && hy === ty) {
          if (!bestHost || org.age > bestHost.age) {
            bestHost = { id: org.id, age: org.age }
          }
        }
      }
      if (bestHost) {
        useSceneStore.getState().enter({ kind: 'home', orgId: bestHost.id })
        return
      }
    }

    onOrgSelect(nearestOrg ? nearestOrg.id : null)
  }

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { clientWidth, clientHeight } = el
      if (clientWidth > 0 && clientHeight > 0) {
        setDims({ w: clientWidth, h: clientHeight })
      }
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="map2d-world"
      tabIndex={0}
      aria-label="Interactive world map"
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        cursor: sandboxArmed ? 'crosshair' : 'grab',
        position: 'relative',
        // touch-action: none stops the browser from claiming
        // two-finger pinch as page-zoom; the gesture handler
        // gets the events instead.
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={(e) => {
        const down = pointerDownPos.current
        if (down && ((e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2 > 36 || e.pointerId !== down.id))
          down.moved = true
      }}
      onPointerCancel={() => {
        if (pointerDownPos.current) pointerDownPos.current.moved = true
      }}
      onClick={handleClick}
    >
      {dims.w > 0 && dims.h > 0 && (
        <>
          <WorldCanvas
            key={rendererKey}
            world={world}
            interp={interp}
            selectedOrgId={selectedOrgId}
            overlay={overlay}
            focus={focus}
            viewFlags={viewFlags}
            rendererPaused={rendererPaused}
            onFirstDraw={handleFirstDraw}
            onDrawError={setDrawError}
            cameraStateRef={cameraStateRef}
            viewportDims={dims}
          />
          <MapCameraController
            commandRef={commandRef}
            worldW={W}
            worldH={H}
            containerW={dims.w}
            containerH={dims.h}
            containerEl={containerRef.current}
            cameraStateRef={cameraStateRef}
            followTarget={followTarget}
          />
        </>
      )}
      {drawError && (
        <div
          role="alert"
          data-map-ui
          style={{
            position: 'absolute',
            inset: '35% 15%',
            padding: 24,
            background: '#241f19',
            color: '#fff',
            zIndex: 20,
          }}
        >
          <p>{drawError}</p>
          <button
            onClick={() => {
              setDrawError(null)
              setRendererKey((key) => key + 1)
            }}
          >
            Retry renderer
          </button>
        </div>
      )}
      {mapReady && !viewFlags.hideUI && (
        <WorldMapHud
          world={world}
          cameraRef={cameraStateRef}
          commandRef={commandRef}
          viewport={dims}
          container={containerRef.current}
          toolLabel={sandboxArmed ? sandboxLabel : null}
          toolRadius={sandboxRadius}
          toolStatus={sandboxStatus}
        />
      )}
    </div>
  )
}
