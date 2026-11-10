import type { Camera, Point, Rect } from '@shared/types'
import { clamp } from './geometry'

export const MIN_ZOOM = 0.06
export const MAX_ZOOM = 4

export function worldToScreen(point: Point, camera: Camera, viewport: { w: number; h: number }): Point {
  return {
    x: (point.x - camera.x) * camera.zoom + viewport.w / 2,
    y: (point.y - camera.y) * camera.zoom + viewport.h / 2
  }
}

export function screenToWorld(point: Point, camera: Camera, viewport: { w: number; h: number }): Point {
  return {
    x: (point.x - viewport.w / 2) / camera.zoom + camera.x,
    y: (point.y - viewport.h / 2) / camera.zoom + camera.y
  }
}

export function visibleWorldRect(camera: Camera, viewport: { w: number; h: number }, margin = 0): Rect {
  const w = viewport.w / camera.zoom + margin * 2
  const h = viewport.h / camera.zoom + margin * 2
  return { x: camera.x - w / 2, y: camera.y - h / 2, w, h }
}

export function zoomAround(
  camera: Camera,
  viewport: { w: number; h: number },
  screenPoint: Point,
  factor: number
): Camera {
  const nextZoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const before = screenToWorld(screenPoint, camera, viewport)
  const after = {
    x: (screenPoint.x - viewport.w / 2) / nextZoom + camera.x,
    y: (screenPoint.y - viewport.h / 2) / nextZoom + camera.y
  }
  return {
    x: camera.x + (before.x - after.x),
    y: camera.y + (before.y - after.y),
    zoom: nextZoom
  }
}

export function fitBounds(
  rect: Rect | null,
  viewport: { w: number; h: number },
  padding = 120,
  maxZoom = 1
): Camera {
  if (!rect || rect.w <= 0 || rect.h <= 0) {
    return { x: 0, y: 0, zoom: 1 }
  }
  const zoom = clamp(
    Math.min((viewport.w - padding * 2) / rect.w, (viewport.h - padding * 2) / rect.h),
    MIN_ZOOM,
    maxZoom
  )
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    zoom
  }
}
