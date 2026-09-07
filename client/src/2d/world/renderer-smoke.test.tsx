// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { WorldState } from '../../types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { WorldView } from './WorldView'
import { logger } from '../../lib/logger'

// Canvas commands are recorded here; this test exercises React mounting,
// first-frame readiness, camera invalidation and error recovery without a GPU.
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('shows the map HUD without WebGL and redraws a settled world when the camera moves', async () => {
  const harness = setup()
  const state = world()
  const interp = {
    current: { current: state },
    prev: { current: state },
    currentServerAt: { current: 100 },
    prevServerAt: { current: 50 },
    currentReceivedAt: { current: -10000 },
  } as InterpRefs
  await act(async () => harness.root.render(<WorldView world={state} interp={interp} />))
  await harness.flush(5)
  expect(harness.contextTypes.every((type) => type === '2d')).toBe(true)
  expect(document.querySelector('[role="alert"]')).toBeNull()
  expect(document.querySelector('[aria-label="World terrain and inhabitants"]')).not.toBeNull()
  expect(document.body.textContent).toContain('Fit')
  const mainCanvas = document.querySelector(
    'canvas[aria-label="World terrain and inhabitants"]',
  ) as HTMLCanvasElement
  const drawMain = vi.mocked(harness.contexts.get(mainCanvas)!.drawImage)
  const calls = drawMain.mock.calls.length
  await harness.flush(2)
  expect(drawMain.mock.calls.length).toBe(calls)
  const zoom = document.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement
  expect(zoom).not.toBeNull()
  await act(async () => zoom.click())
  await harness.flush(3)
  expect(drawMain.mock.calls.length).toBeGreaterThan(calls)
  await act(async () => harness.root.unmount())
  expect(harness.frames.size).toBe(0)
})

it('renders a snapshot without interpolation and offers a working retry after a draw failure', async () => {
  const harness = setup()
  const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {})
  harness.drawImage.mockImplementation(() => {
    throw new Error('Drawing failed')
  })
  await act(async () => harness.root.render(<WorldView world={world()} />))
  await harness.flush(2)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Retry renderer')
  expect(errorLog).toHaveBeenCalledOnce()
  harness.drawImage.mockImplementation(() => {})
  const retry = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Retry renderer',
  )!
  await act(async () => retry.click())
  await harness.flush(5)
  expect(document.querySelector('[role="alert"]')).toBeNull()
  expect(document.body.textContent).toContain('Fit')
  await act(async () => harness.root.unmount())
  expect(harness.frames.size).toBe(0)
})

function world(): WorldState {
  const width = 16,
    height = 10
  const matrix = (value: number) => Array.from({ length: height }, () => Array(width).fill(value))
  return {
    grid: {
      width,
      height,
      tiles: matrix(1),
      fertility: matrix(0.7),
      structure: matrix(0),
      fire_intensity: matrix(0),
      food_trail: matrix(0),
      water_trail: matrix(0),
      path_trail: matrix(0),
      hazard: matrix(0),
    },
    tick: 100,
    frame_id: 1,
    organisms: [],
    animals: [],
    buildings: [],
    settlements: [],
    is_day: true,
    day_progress: 0.4,
    season: 'abundance',
    season_progress: 0.5,
    lineage_names: {},
    weather: { kind: 'clear', intensity: 0 },
  } as unknown as WorldState
}

function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
  const noop = () => {}
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo = noop
      lineTo = noop
      closePath = noop
    },
  )
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray
      constructor(width: number, height: number) {
        this.data = new Uint8ClampedArray(width * height * 4)
      }
    },
  )
  const drawImage = vi.fn()
  const contextTypes: string[] = []
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    type: string,
  ) {
    contextTypes.push(type)
    if (type !== '2d') throw new Error('WebGL unavailable')
    if (!contexts.has(this)) {
      const properties: Record<string, unknown> = {
        canvas: this,
        drawImage: vi.fn((...args: unknown[]) => drawImage(...args)),
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        measureText: () => ({ width: 20 }),
      }
      contexts.set(
        this,
        new Proxy(properties, {
          get: (target, key: string) => target[key] ?? noop,
        }) as unknown as CanvasRenderingContext2D,
      )
    }
    return contexts.get(this)!
  } as HTMLCanvasElement['getContext'])
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++id, fn)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  const flush = async (count: number) => {
    for (let i = 0; i < count; i++)
      await act(async () => {
        const pending = [...frames.values()]
        frames.clear()
        for (const fn of pending) fn(performance.now())
      })
  }
  return { root, frames, flush, drawImage, contextTypes, contexts }
}
