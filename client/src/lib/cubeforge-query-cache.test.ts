import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

interface World {
  createEntity(): number
  addComponent(id: number, component: { type: string }): void
  removeComponent(id: number, type: string): void
  query(...types: string[]): number[]
}

// CubeForge does not export its ECS constructor. Exercise the installed bundle
// so this regression checks the installed release, including split bundles.
const bundleDirectory = dirname(createRequire(import.meta.url).resolve('cubeforge'))
const source =
  readdirSync(bundleDirectory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(bundleDirectory, name), 'utf8'))
    .find((source) => source.includes('var ECSWorld = class {')) ?? ''
const start = source.indexOf('var ECSWorld = class {')
const end = source.indexOf('// ../../packages/core/src/ecs/worldQueries.ts', start)
if (start < 0 || end < 0) throw new Error('CubeForge bundle changed; update the ECS test loader')
const ECSWorld = runInNewContext(`${source.slice(start, end)}; ECSWorld`) as new () => World

describe('CubeForge render query cache', () => {
  it('finds a sprite mounted after the first empty render query', () => {
    const world = new ECSWorld()
    expect(world.query('Transform', 'Sprite')).toEqual([])
    const id = world.createEntity()
    world.addComponent(id, { type: 'Transform' })
    expect(world.query('Transform', 'Sprite')).toEqual([])
    world.addComponent(id, { type: 'Sprite' })
    expect(world.query('Transform', 'Sprite')).toEqual([id])
  })

  it('invalidates render queries when a sprite is removed and remounted', () => {
    const world = new ECSWorld()
    const id = world.createEntity()
    world.addComponent(id, { type: 'Transform' })
    world.addComponent(id, { type: 'Sprite' })
    expect(world.query('Transform', 'Sprite')).toEqual([id])
    world.removeComponent(id, 'Sprite')
    expect(world.query('Transform', 'Sprite')).toEqual([])
    world.addComponent(id, { type: 'Sprite' })
    expect(world.query('Transform', 'Sprite')).toEqual([id])
  })
})
