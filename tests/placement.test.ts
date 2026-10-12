import { describe, expect, it } from 'vitest'
import { computeIconPosition, computePlacement, type Box } from '../src/content/placement'

const vp = { width: 1200, height: 800 }
const box = (top: number, left: number, height = 20, width = 100): Box => ({ top, left, bottom: top + height, right: left + width })
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('computePlacement', () => {
  it('goes below the selection by default, centred on it', () => {
    const p = computePlacement(box(300, 500), { width: 300, height: 120 }, vp)
    expect(p.side).toBe('below')
    expect(p.top).toBe(328)
    expect(p.left).toBe(400)
  })

  it('flips above near the bottom edge', () => {
    const p = computePlacement(box(740, 500), { width: 300, height: 120 }, vp)
    expect(p.side).toBe('above')
    expect(p.top + 120).toBeLessThanOrEqual(740)
  })

  it('never covers the selection when either side has room, whatever the popover height', () => {
    for (const height of [60, 150, 300]) {
      for (const top of [40, 300, 600]) {
        const anchor = box(top, 400)
        const p = computePlacement(anchor, { width: 320, height }, vp)
        const shown = Math.min(height, p.maxHeight)
        expect(overlaps({ top: p.top, left: p.left, bottom: p.top + shown, right: p.left + 320 }, anchor)).toBe(false)
      }
    }
  })

  it('stays fully inside the viewport at the right edge', () => {
    const p = computePlacement(box(300, 1150, 20, 40), { width: 300, height: 100 }, vp)
    expect(p.left + 300).toBeLessThanOrEqual(vp.width - 8)
  })

  it('stays fully inside the viewport at the left edge', () => {
    const p = computePlacement(box(300, 0, 20, 30), { width: 300, height: 100 }, vp)
    expect(p.left).toBeGreaterThanOrEqual(8)
  })

  it('shrinks to the larger side when it fits on neither', () => {
    const p = computePlacement(box(250, 400, 300), { width: 300, height: 600 }, vp)
    expect(p.side).toBe('below') // 242px below vs 242px above → below wins ties
    expect(p.maxHeight).toBeLessThanOrEqual(vp.height - 550 - 16)
    expect(p.top + Math.min(600, p.maxHeight)).toBeLessThanOrEqual(vp.height - 8)
  })

  it('keeps a popover on screen when the anchor has scrolled off the top', () => {
    const p = computePlacement(box(-200, 400), { width: 300, height: 100 }, vp)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })

  it('is narrower than the viewport on tiny windows', () => {
    const p = computePlacement(box(100, 50), { width: 500, height: 100 }, { width: 320, height: 600 })
    expect(p.left).toBe(8)
  })

  it('centres on a custom x (end of a multi-line selection)', () => {
    const p = computePlacement(box(300, 100, 60, 800), { width: 200, height: 100 }, vp, { centerX: 250 })
    expect(p.left).toBe(150)
  })
})

describe('computeIconPosition', () => {
  it('sits just past the pointer', () => expect(computeIconPosition({ x: 100, y: 100 }, 30, vp)).toEqual({ left: 110, top: 110 }))
  it('flips to stay on screen at the bottom-right corner', () => {
    const p = computeIconPosition({ x: 1195, y: 795 }, 30, vp)
    expect(p.left + 30).toBeLessThanOrEqual(vp.width - 8)
    expect(p.top + 30).toBeLessThanOrEqual(vp.height - 8)
  })
})
