import { describe, expect, it } from 'vitest'
import { fitBounds, screenToWorld, visibleWorldRect, worldToScreen, zoomAround } from './camera'

describe('camera', () => {
  it('round-trips world and screen coordinates', () => {
    const camera = { x: 120, y: -40, zoom: 0.75 }
    const viewport = { w: 1200, h: 800 }
    const world = { x: 300, y: 200 }
    const screen = worldToScreen(world, camera, viewport)
    expect(screenToWorld(screen, camera, viewport).x).toBeCloseTo(world.x)
    expect(screenToWorld(screen, camera, viewport).y).toBeCloseTo(world.y)
  })

  it('keeps the point under the cursor stable while zooming', () => {
    const camera = { x: 0, y: 0, zoom: 1 }
    const viewport = { w: 1000, h: 600 }
    const cursor = { x: 240, y: 150 }
    const before = screenToWorld(cursor, camera, viewport)
    const next = zoomAround(camera, viewport, cursor, 1.8)
    const after = screenToWorld(cursor, next, viewport)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('fits content and never exceeds the maximum zoom', () => {
    const camera = fitBounds({ x: 0, y: 0, w: 200, h: 100 }, { w: 1000, h: 700 }, 100, 1)
    expect(camera.zoom).toBeLessThanOrEqual(1)
    expect(camera.x).toBe(100)
    expect(camera.y).toBe(50)
  })

  it('computes a visible world rectangle', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, zoom: 2 }, { w: 800, h: 600 })
    expect(rect).toEqual({ x: -200, y: -150, w: 400, h: 300 })
  })
})
