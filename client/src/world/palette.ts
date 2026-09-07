/**
 * Static palette tables for the 2D WorldView renderer. Extracted from
 * WorldView.tsx so the renderer file stays focused on draw orchestration.
 * These are pure-data modules - no side effects, no React, safe to
 * import from anywhere.
 */

export const TILE = 8

export const TILE_COLORS: Record<number, string> = {
  0: '#0a0a0a',
  1: '#789657',
  2: '#2e6db4',
  3: '#8eae61',
  4: '#e8450a',
  5: '#878e87',
  6: '#555544',
  7: '#cc6600',
  8: '#8b6914',
  9: '#3a6688',
  10: '#c8a020',
  11: '#2a2018',
  12: '#e2edf0',
  13: '#dec48c',
}

export const BIOME_OVERLAYS: Record<number, string> = {
  0: 'rgba(80,140,60,0.08)',
  1: 'rgba(30,79,58,0.24)',
  2: 'rgba(200,160,60,0.28)',
  3: 'rgba(36,111,103,0.23)',
  4: 'rgba(200,230,255,0.10)',
  5: 'rgba(160,40,20,0.18)',
}

export function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

export function parseRgbaStr(s: string): [number, number, number, number] {
  const m = s.match(/[\d.]+/g)!
  return [+m[0], +m[1], +m[2], +m[3]]
}

export const TILE_RGB: Record<number, [number, number, number]> = Object.fromEntries(
  Object.entries(TILE_COLORS).map(([k, v]) => [+k, parseHex(v)]),
)

export const BIOME_RGBA: Record<number, [number, number, number, number]> = Object.fromEntries(
  Object.entries(BIOME_OVERLAYS).map(([k, v]) => [+k, parseRgbaStr(v)]),
)

export const THOUGHT_COLORS: Record<string, string> = {
  eating: '#6abf45',
  drinking: '#4499ff',
  'heat dangerous': '#e8450a',
  'hungry - searching': '#cc8800',
  'thirsty - searching': '#0099cc',
  'moving to known food': '#aadd55',
  'moving to known water': '#55aaff',
  'avoiding danger': '#ff6644',
  dying: '#ff0000',
  satisfied: '#ffffff',
  socializing: '#ffdd88',
  wary: '#ff9900',
  'signaling food': '#ffff44',
  'sounding alarm': '#ff4488',
  challenging: '#ff2200',
  'challenging alone': '#cc4422',
  exploring: '#888888',
  observing: '#555555',
  'feeling weak': '#bbff44',
  'coexisting peacefully': '#55ff88',
  hunting: '#ffaa22',
  gathering: '#c8a050',
  building: '#ffcc44',
  'building shelter': '#ffd700',
  'digging for water': '#3a9bd4',
  'digging in the sand': '#d9c07a',
  'struck water': '#33ddff',
  'tilling the soil': '#8a6a3a',
  'foraging wild food': '#7ed957',
  'foraging the brush': '#9bc850',
  'searching the brush': '#a8b86a',
  'dancing with kin': '#ff7fd4',
  'dancing by the fire': '#ff9ae0',
  'dancing alone': '#c885b0',
  singing: '#a98fff',
  'singing by the fire': '#bda6ff',
  'reflecting quietly': '#8fd4c4',
  'taking a quiet moment': '#9fd9ca',
  'storing food': '#d4b34a',
  'eating stored food': '#c8d96a',
  'scouting the area': '#6fc0e8',
  'surveying the land': '#7fcaf0',
  'marking territory': '#e0a040',
  'marking the homeland': '#e8b050',
}
