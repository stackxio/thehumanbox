import { describe, expect, it } from 'vitest'
import { searchWorldTools } from './tool-search'
import { SANDBOX_CATEGORIES } from '../simulation/sandbox'

describe('searchable world tools', () => {
  it('makes the entire existing catalogue discoverable without duplicate commands', () => {
    const all = searchWorldTools('')
    expect(all.length).toBe(SANDBOX_CATEGORIES.reduce((count, category) => count + category.tools.length, 0))
    expect(new Set(all.map(({ tool }) => tool.id)).size).toBe(all.length)
  })
  it('matches category and tool words together, ignoring case and whitespace', () => {
    expect(searchWorldTools(' LIFE   heal ').map(({ tool }) => tool.id)).toEqual(['heal'])
    expect(searchWorldTools('terrain water').some(({ tool }) => tool.id === 'water')).toBe(true)
  })
  it('does not offer invented commands for unmatched requests', () => {
    expect(searchWorldTools('teleport planet')).toEqual([])
  })
})
