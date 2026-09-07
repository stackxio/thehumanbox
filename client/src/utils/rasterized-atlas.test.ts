import { afterEach, describe, expect, it, vi } from 'vitest'
import { rasterizedAtlas } from './rasterized-atlas'

afterEach(() => vi.unstubAllGlobals())

describe('rasterized sprite atlas', () => {
  it('rasterizes an SVG only once for repeated character draws', () => {
    const drawImage = vi.fn()
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ drawImage }) }))
    vi.stubGlobal('document', { createElement })
    const image = {
      complete: true,
      naturalWidth: 128,
      naturalHeight: 1920,
      src: 'people.svg',
    } as HTMLImageElement
    const first = rasterizedAtlas(image)
    for (let i = 0; i < 350; i++) expect(rasterizedAtlas(image)).toBe(first)
    expect(createElement).toHaveBeenCalledTimes(1)
    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(first?.width).toBe(128)
    expect(first?.height).toBe(1920)
    image.src = 'replacement.svg'
    expect(rasterizedAtlas(image)).not.toBe(first)
    expect(drawImage).toHaveBeenCalledTimes(2)
  })

  it('does not cache an unloaded atlas', () => {
    expect(rasterizedAtlas({ complete: false } as HTMLImageElement)).toBeNull()
    expect(rasterizedAtlas({ complete: true, naturalWidth: 0 } as HTMLImageElement)).toBeNull()
  })
})
