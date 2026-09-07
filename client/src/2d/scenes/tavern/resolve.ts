import type { SceneContext, SceneFixture, SceneId, SceneOccupant } from '../../../scenes/core/types'
import type { WorldState } from '../../../types'
import { getBuildingState } from '../../../world/building-state'

export const TAVERN_RADIUS = 18

function findTavernAnchor(world: WorldState, lineageId: string): { x: number; y: number } | null {
  const buildings = world.buildings ?? []
  let best: { x: number; y: number; score: number } | null = null
  let hasMatchingTavern = false
  for (const b of buildings) {
    if (b.kind.toLowerCase() !== 'tavern') continue
    const owner = b.owner_lineage ?? b.lineage_id
    if (owner && owner !== lineageId) continue
    hasMatchingTavern = true
    if (!getBuildingState(b).isOperational) continue
    const score = b.condition ?? 1
    if (!best || score > best.score) best = { x: b.x, y: b.y, score }
  }
  if (best) return best
  // The legacy fallback is only for worlds that never serialized taverns.
  // A known but unfinished or ruined tavern must not conjure a usable
  // interior elsewhere.
  if (hasMatchingTavern) return null

  let cx = 0
  let cy = 0
  let n = 0
  for (const o of world.organisms) {
    if (!o.alive || o.lineage_id !== lineageId) continue
    cx += o.x
    cy += o.y
    n++
  }
  if (n === 0) return null
  return { x: cx / n, y: cy / n }
}

export function resolveTavernScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'tavern') return null
  const anchor = findTavernAnchor(world, scene.lineageId)
  if (!anchor) return null

  const lineageName = world.lineage_names?.[scene.lineageId] ?? scene.lineageId.slice(0, 6)

  const inside: SceneOccupant[] = []
  const away: SceneOccupant[] = []
  for (const o of world.organisms) {
    if (!o.alive) continue
    if (o.lineage_id !== scene.lineageId) continue
    if (o.age_stage === 'infant' || o.age_stage === 'child') continue
    const d = Math.abs(o.x - anchor.x) + Math.abs(o.y - anchor.y)
    if (d > TAVERN_RADIUS) continue
    const drinkerThought = /drink|beer|brew|ale|spirit|toast|tavern/i.test(o.thought ?? '')
    const knowsBrewing = (o.discoveries ?? []).includes('brewing')
    const hasSpirit = ((o.tools ?? {}).spirit ?? 0) > 0 || ((o.tools ?? {}).bottle ?? 0) > 0
    const eligible = knowsBrewing || drinkerThought || hasSpirit || o.is_leader
    if (!eligible) continue
    const role: SceneOccupant['role'] = o.is_leader ? 'host' : hasSpirit ? 'brewer' : 'patron'
    const activity = hasSpirit
      ? 'serving'
      : drinkerThought
        ? o.thought!
        : knowsBrewing
          ? 'drinking'
          : 'looking in'
    const entry: SceneOccupant = { org: o, role, activity }
    if (d <= 3) inside.push(entry)
    else away.push(entry)
  }

  inside.sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0))

  const fixtures: SceneFixture[] = [
    { id: 'fireplace', kind: 'fireplace', x: 2, y: 6, label: 'fireplace' },
    { id: 'bar', kind: 'bar', x: 1, y: 2, label: 'bar' },
    { id: 'barrel-1', kind: 'barrel', x: 12, y: 2 },
    { id: 'barrel-2', kind: 'barrel', x: 12, y: 3 },
    { id: 'long-table', kind: 'long_table', x: 5, y: 4, label: 'table' },
    { id: 'stool-1', kind: 'stool', x: 5, y: 3 },
    { id: 'stool-2', kind: 'stool', x: 7, y: 3 },
    { id: 'stool-3', kind: 'stool', x: 9, y: 3 },
    { id: 'stool-4', kind: 'stool', x: 5, y: 7 },
    { id: 'stool-5', kind: 'stool', x: 7, y: 7 },
    { id: 'stool-6', kind: 'stool', x: 9, y: 7 },
  ]

  const totalSpirit = world.organisms.reduce(
    (s, o) => (o.alive && o.lineage_id === scene.lineageId ? s + ((o.tools ?? {}).spirit ?? 0) : s),
    0,
  )
  const brewerCount = world.organisms.filter(
    (o) => o.alive && o.lineage_id === scene.lineageId && (o.discoveries ?? []).includes('brewing'),
  ).length
  const timeOfDay = world.is_day
    ? inside.length > 3
      ? 'busy lunch crowd'
      : 'quiet daytime hours'
    : inside.length > 3
      ? 'rowdy evening'
      : 'late-night regulars'
  const subtitle = [
    `${inside.length} drinking · ${away.length} nearby`,
    timeOfDay,
    brewerCount > 0 ? `${brewerCount} brewer${brewerCount === 1 ? '' : 's'}` : null,
    totalSpirit > 0 ? `${totalSpirit} on the shelf` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    scene,
    world,
    title: `${lineageName} tavern`,
    subtitle,
    isDay: !!world.is_day,
    occupants: inside.slice(0, 8),
    away: away.slice(0, 12),
    fixtures,
  }
}
