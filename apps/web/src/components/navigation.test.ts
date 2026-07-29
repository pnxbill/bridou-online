import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, isActiveTab } from './navigation'

const activeLabel = (pathname: string) =>
  NAV_ITEMS.find((item) => isActiveTab(pathname, item.href))?.label ?? null

describe('isActiveTab', () => {
  it('lights the tab you are on', () => {
    expect(activeLabel('/')).toBe('Início')
    expect(activeLabel('/mesas')).toBe('Mesas')
    expect(activeLabel('/diaria')).toBe('Diária')
    expect(activeLabel('/ranking')).toBe('Ranking')
  })

  it('keeps a tab lit inside its own subtree', () => {
    expect(activeLabel('/mesas/BRIDU')).toBe('Mesas')
  })

  // the singular/plural split is load-bearing: /mesa/CODE is the ephemeral
  // lobby, which belongs to no tab
  it('does not let a prefix match across a path boundary', () => {
    expect(activeLabel('/mesa/BRIDU')).toBe(null)
    expect(isActiveTab('/mesas-antigas', '/mesas')).toBe(false)
  })

  it('leaves the bar unlit on screens no tab owns', () => {
    expect(activeLabel('/resenha/game-1')).toBe(null)
    expect(activeLabel('/conquistas')).toBe(null)
  })

  it('never lights Início from another route', () => {
    expect(isActiveTab('/ranking', '/')).toBe(false)
    expect(isActiveTab('/mesas/BRIDU', '/')).toBe(false)
  })
})
