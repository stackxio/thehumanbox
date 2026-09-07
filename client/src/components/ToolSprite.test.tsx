import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../simulation/sandbox'
import { ToolSprite } from './ToolSprite'

describe('hand-drawn toolbar sprites', () => {
  it('renders every category and tool as pixel artwork without emoji text', () => {
    const cursor = renderToStaticMarkup(<ToolSprite icon="🖱️" />)
    for (const category of SANDBOX_CATEGORIES) {
      for (const { icon } of [category, ...category.tools]) {
        const markup = renderToStaticMarkup(<ToolSprite icon={icon} />)
        expect(markup).toContain('<rect')
        expect(markup).toContain('shape-rendering="crispEdges"')
        expect(markup).not.toContain(icon)
        expect(markup).not.toBe(cursor)
        expect(markup).not.toContain('fill="undefined"')
      }
    }
  })
})
