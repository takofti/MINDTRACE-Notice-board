import type { Point, Rect, Stroke } from '@shared/types'
import { strokeBBox } from './geometry'

function pointAt(stroke: Stroke, index: number): Point {
  return { x: stroke.points[index * 2] ?? 0, y: stroke.points[index * 2 + 1] ?? 0 }
}

export function freehandPathD(points: number[], smoothing: number): string {
  if (points.length < 4) {
    if (points.length < 2) return ''
    return `M ${points[0]} ${points[1]} L ${points[0]} ${points[1]}`
  }
  let d = `M ${points[0].toFixed(2)} ${points[1].toFixed(2)}`
  const count = points.length / 2
  if (smoothing <= 0.02 || count < 4) {
    for (let i = 1; i < count; i++) {
      d += ` L ${points[i * 2].toFixed(2)} ${points[i * 2 + 1].toFixed(2)}`
    }
    return d
  }
  for (let i = 1; i < count - 1; i++) {
    const cx = points[i * 2]
    const cy = points[i * 2 + 1]
    const nx = points[(i + 1) * 2]
    const ny = points[(i + 1) * 2 + 1]
    const mx = (cx + nx) / 2
    const my = (cy + ny) / 2
    const strength = Math.min(1, smoothing)
    const qx = cx + (mx - cx) * (1 - strength * 0.35)
    const qy = cy + (my - cy) * (1 - strength * 0.35)
    d += ` Q ${qx.toFixed(2)} ${qy.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`
  }
  d += ` L ${points[(count - 1) * 2].toFixed(2)} ${points[(count - 1) * 2 + 1].toFixed(2)}`
  return d
}

export function strokeSvgPathD(stroke: Stroke, smoothing = 0.62, cornerRadius = 0): string {
  if (stroke.points.length < 2) return ''
  switch (stroke.tool) {
    case 'line':
    case 'arrow': {
      const a = pointAt(stroke, 0)
      const b = pointAt(stroke, stroke.points.length / 2 - 1)
      return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
    }
    case 'rect': {
      const a = pointAt(stroke, 0)
      const b = pointAt(stroke, stroke.points.length / 2 - 1)
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const w = Math.abs(a.x - b.x)
      const h = Math.abs(a.y - b.y)
      const r = Math.min(cornerRadius, w / 2, h / 2)
      return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
    }
    case 'ellipse': {
      const a = pointAt(stroke, 0)
      const b = pointAt(stroke, stroke.points.length / 2 - 1)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const rx = Math.abs(a.x - b.x) / 2
      const ry = Math.abs(a.y - b.y) / 2
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
    }
    default:
      return freehandPathD(stroke.points, smoothing)
  }
}

export function arrowHeadPathD(stroke: Stroke): string | null {
  if (stroke.tool !== 'arrow' || stroke.points.length < 4) return null
  const a = pointAt(stroke, 0)
  const b = pointAt(stroke, stroke.points.length / 2 - 1)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const length = Math.max(9, stroke.width * 4.2)
  const spread = 0.42
  const p1 = {
    x: b.x - length * Math.cos(angle - spread),
    y: b.y - length * Math.sin(angle - spread)
  }
  const p2 = {
    x: b.x - length * Math.cos(angle + spread),
    y: b.y - length * Math.sin(angle + spread)
  }
  return `M ${b.x} ${b.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`
}

export function strokePointsBBox(stroke: Stroke): Rect {
  return strokeBBox(stroke)
}

export function shapeFromDrag(tool: Stroke['tool'], start: Point, end: Point, freehand: number[]): number[] {
  if (tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse') {
    return [start.x, start.y, end.x, end.y]
  }
  return freehand
}

export function isShapeTool(tool: Stroke['tool']): boolean {
  return tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'
}
