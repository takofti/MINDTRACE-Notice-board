import { describe, expect, it } from 'vitest'
import type { Card, Group, Stroke } from '@shared/types'
import {
  ANCHOR_NORM,
  cardRect,
  groupBounds,
  nearestPin,
  pinNormal,
  pinPoint,
  rectContains,
  rectsIntersect,
  splitStrokeAt,
  unionRects
} from './geometry'

function card(partial: Partial<Card> = {}): Card {
  return {
    id: 'card_1',
    kind: 'text',
    x: 100,
    y: 100,
    w: 200,
    h: 100,
    z: 1,
    title: 'Test',
    body: '',
    categories: [],
    pins: [],
    createdAt: 1,
    updatedAt: 1,
    ...partial
  }
}

function stroke(partial: Partial<Stroke> = {}): Stroke {
  return {
    id: 'stroke_1',
    tool: 'chalk',
    color: '#fff',
    width: 2,
    opacity: 1,
    points: [0, 0, 50, 0, 100, 0, 150, 0, 200, 0],
    seed: 1,
    createdAt: 1,
    ...partial
  }
}

describe('pin anchors', () => {
  it('maps implicit anchors to card borders', () => {
    const c = card()
    expect(pinPoint(c, 'n')).toEqual({ x: 200, y: 100 })
    expect(pinPoint(c, 'se')).toEqual({ x: 300, y: 200 })
    expect(pinPoint(c, 'w')).toEqual({ x: 100, y: 150 })
  })

  it('uses custom pins anywhere on the card', () => {
    const c = card({ pins: [{ id: 'pin_x', x: 0.25, y: 0.75 }] })
    expect(pinPoint(c, 'pin_x')).toEqual({ x: 150, y: 175 })
    expect(pinNormal(c, 'pin_x').x).toBeLessThan(0)
  })

  it('finds the nearest anchor or custom pin', () => {
    const c = card({ pins: [{ id: 'pin_c', x: 0.5, y: 0.5 }] })
    expect(nearestPin(c, { x: 200, y: 150 })).toBe('pin_c')
    expect(nearestPin(c, { x: 95, y: 95 })).toBe('nw')
    expect(ANCHOR_NORM.nw).toEqual({ x: 0, y: 0 })
  })
})

describe('rect helpers', () => {
  it('unions and tests rectangles', () => {
    const a = cardRect(card())
    const b = cardRect(card({ id: 'card_2', x: 0, y: 0, w: 50, h: 50 }))
    const union = unionRects([a, b])
    expect(union).toEqual({ x: 0, y: 0, w: 300, h: 200 })
    expect(rectsIntersect(a, b)).toBe(false)
    expect(rectContains(a, { x: 120, y: 120, w: 10, h: 10 })).toBe(true)
  })

  it('builds a compact collapsed group frame', () => {
    const c1 = card({ id: 'a', x: 0, y: 0, w: 100, h: 100 })
    const c2 = card({ id: 'b', x: 300, y: 0, w: 100, h: 100 })
    const group: Group = {
      id: 'g',
      title: 'Group',
      color: '#fff',
      collapsed: true,
      createdAt: 1
    }
    const bounds = groupBounds(group, { a: { ...c1, groupId: 'g' }, b: { ...c2, groupId: 'g' } })
    expect(bounds.h).toBe(40)
    expect(bounds.w).toBeGreaterThanOrEqual(190)
    expect(bounds.y).toBe(-48)
  })
})

describe('eraser splitting', () => {
  it('cuts a freehand stroke into pieces instead of deleting it', () => {
    const result = splitStrokeAt(stroke(), { x: 100, y: 0 }, 12)
    expect(result.removed).toBe(true)
    expect(result.keep.length).toBe(2)
    expect(result.keep[0].points.length).toBeLessThan(10)
  })

  it('leaves a distant stroke intact', () => {
    const result = splitStrokeAt(stroke(), { x: 100, y: 80 }, 10)
    expect(result.removed).toBe(false)
    expect(result.keep).toHaveLength(1)
  })

  it('removes a shape when the eraser touches it', () => {
    const line = stroke({ tool: 'line', points: [0, 0, 100, 100] })
    const result = splitStrokeAt(line, { x: 50, y: 50 }, 8)
    expect(result.removed).toBe(true)
    expect(result.keep).toHaveLength(0)
  })
})
