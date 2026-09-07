import { describe, expect, it } from 'vitest'
import { interpolationFactor, shouldRenderFrame, worldRenderScale } from './render-timing'

describe('world render pacing', () => {
  it('caps drawing at 30fps on both 60Hz and 120Hz displays', () => {
    for (const hz of [60, 120]) {
      let previous = -Infinity
      let count = 0
      for (let frame = 0; frame < hz; frame++) {
        const now = (frame * 1000) / hz
        if (shouldRenderFrame(now, previous, 30)) {
          previous = now
          count++
        }
      }
      expect(count).toBe(30)
    }
  })

  it('low-perf mode never increases the texture resolution', () => {
    for (const zoom of [0.05, 0.12, 0.2, 0.5, 1, 2, 8]) {
      expect(worldRenderScale(zoom, 2, true)).toBeLessThanOrEqual(worldRenderScale(zoom, 2, false))
    }
  })

  it('reaches the current snapshot before the next one arrives without a half-tick jump', () => {
    expect(interpolationFactor(1000, 1000, 120)).toBe(0)
    expect(interpolationFactor(1060, 1000, 120)).toBe(0.5)
    expect(interpolationFactor(1120, 1000, 120)).toBe(1)
    expect(interpolationFactor(2000, 1000, 120)).toBe(2)
  })
})
