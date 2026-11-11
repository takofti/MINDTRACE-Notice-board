import type {
  AnchorId,
  Card,
  Group,
  Point,
  Project,
  Rect,
  Space,
  Stroke
} from '@shared/types'
import { ANCHOR_IDS } from '@shared/types'

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

export function cardRect(card: Card): Rect {
  return { x: card.x, y: card.y, w: card.w, h: card.h }
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.w < 0 ? rect.x + rect.w : rect.x,
    y: rect.h < 0 ? rect.y + rect.h : rect.y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h)
  }
}

export function expandRect(rect: Rect, amount: number): Rect {
  return { x: rect.x - amount, y: rect.y - amount, w: rect.w + amount * 2, h: rect.h + amount * 2 }
}

export const ANCHOR_NORM: Record<AnchorId, Point> = {
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
  nw: { x: 0, y: 0 }
}

const ANCHOR_NORMAL: Record<AnchorId, Point> = {
  n: { x: 0, y: -1 },
  ne: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  e: { x: 1, y: 0 },
  se: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  s: { x: 0, y: 1 },
  sw: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  w: { x: -1, y: 0 },
  nw: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
}

export function isAnchorId(id: string): id is AnchorId {
  return (ANCHOR_IDS as readonly string[]).includes(id)
}

export function pinNorm(card: Card, pin: string): Point {
  if (isAnchorId(pin)) return ANCHOR_NORM[pin]
  const custom = card.pins.find((p) => p.id === pin)
  return custom ? { x: custom.x, y: custom.y } : ANCHOR_NORM.e
}

export function pinPoint(card: Card, pin: string): Point {
  const norm = pinNorm(card, pin)
  return { x: card.x + norm.x * card.w, y: card.y + norm.y * card.h }
}

export function pinNormal(card: Card, pin: string): Point {
  if (isAnchorId(pin)) return ANCHOR_NORMAL[pin]
  const norm = pinNorm(card, pin)
  const dx = norm.x - 0.5
  const dy = norm.y - 0.5
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

export function nearestPin(card: Card, point: Point): string {
  let best = 'n'
  let bestDist = Infinity
  const candidates: { id: string; p: Point }[] = ANCHOR_IDS.map((id) => ({ id, p: pinPoint(card, id) }))
  for (const custom of card.pins) candidates.push({ id: custom.id, p: pinPoint(card, custom.id) })
  for (const candidate of candidates) {
    const d = (candidate.p.x - point.x) ** 2 + (candidate.p.y - point.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = candidate.id
    }
  }
  return best
}

export function strokeBBox(stroke: Stroke): Rect {
  if (stroke.points.length < 2) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < stroke.points.length; i += 2) {
    const x = stroke.points[i]
    const y = stroke.points[i + 1]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const pad = stroke.width / 2 + 4
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

export function groupMemberCards(groupId: string, cards: Record<string, Card>): Card[] {
  return Object.values(cards).filter((card) => card.groupId === groupId)
}

export function groupBounds(group: Group, cards: Record<string, Card>): Rect {
  const members = groupMemberCards(group.id, cards)
  if (!members.length) return { x: 0, y: 0, w: 200, h: 48 }
  const bounds = unionRects(members.map(cardRect)) ?? { x: 0, y: 0, w: 200, h: 100 }
  if (group.collapsed) {
    return { x: bounds.x - 20, y: bounds.y - 48, w: Math.max(190, bounds.w + 40), h: 40 }
  }
  return {
    x: bounds.x - 22,
    y: bounds.y - 48,
    w: bounds.w + 44,
    h: bounds.h + 70
  }
}

export function contentBounds(space: Space, options: { includeStrokes?: boolean; includeHidden?: boolean } = {}): Rect | null {
  const rects: Rect[] = []
  for (const card of Object.values(space.cards)) {
    if (!options.includeHidden && card.hidden) continue
    rects.push(cardRect(card))
  }
  if (options.includeStrokes !== false) {
    for (const stroke of Object.values(space.strokes)) {
      if (!options.includeHidden && stroke.hidden) continue
      rects.push(strokeBBox(stroke))
    }
  }
  return unionRects(rects)
}

export function projectContentBounds(project: Project): Rect | null {
  return contentBounds(
    {
      id: 'all',
      name: '',
      description: '',
      camera: { x: 0, y: 0, zoom: 1 },
      cards: Object.assign({}, ...project.spaces.map((s) => s.cards)),
      threads: {},
      strokes: Object.assign({}, ...project.spaces.map((s) => s.strokes)),
      groups: {},
      createdAt: 0,
      updatedAt: 0
    },
    { includeStrokes: true }
  )
}

/* ------------------------------- curves -------------------------------- */

export function cubicPoint(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
  }
}

export function cubicBBox(p0: Point, c1: Point, c2: Point, p1: Point): Rect {
  const points = [p0, p1]
  for (let i = 1; i < 12; i++) points.push(cubicPoint(p0, c1, c2, p1, i / 12))
  return unionRects(points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))) ?? { x: 0, y: 0, w: 0, h: 0 }
}

export interface CurveGeometry {
  p0: Point
  c1: Point
  c2: Point
  p1: Point
  mid: Point
  bbox: Rect
  path: string
}

/**
 * Threads behave like gently sagging string: control points are pushed out
 * along each pin's normal, bowed sideways by the user curve, and fanned by a
 * lane index so parallel threads do not lie on top of each other.
 */
export function threadGeometry(
  a: Point,
  aNormal: Point,
  b: Point,
  bNormal: Point,
  opts: {
    curve: number
    lane?: number
    laneCount?: number
    reduceOverlap?: boolean
    zoom?: number
    connectionType?: 'curved' | 'straight' | 'elbow'
  }
): CurveGeometry {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.hypot(dx, dy) || 1
  if (opts.connectionType === 'straight') {
    return {
      p0: a,
      c1: a,
      c2: b,
      p1: b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      bbox: {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(dx),
        h: Math.abs(dy)
      },
      path: `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
    }
  }
  if (opts.connectionType === 'elbow') {
    const bend1 = Math.abs(dx) > Math.abs(dy) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
    const path =
      Math.abs(dx) > Math.abs(dy)
        ? `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${bend1.x.toFixed(2)} ${bend1.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
        : `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${bend1.x.toFixed(2)} ${bend1.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
    return {
      p0: a,
      c1: bend1,
      c2: bend1,
      p1: b,
      mid: bend1,
      bbox: {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(dx),
        h: Math.abs(dy)
      },
      path
    }
  }

  const bend = clamp(opts.curve ?? 0.3, -1.5, 1.5)
  const reach = clamp(distance * 0.34, 22, 190)
  const perp = { x: -dy / distance, y: dx / distance }

  // Lanes fan parallel threads out at the pin. Alternating direction avoids
  // a one-sided bundle, which reads as a single thick cable.
  const lane = opts.lane ?? 0
  const laneCount = opts.laneCount ?? 1
  const laneOffset =
    opts.reduceOverlap && laneCount > 1
      ? (lane - (laneCount - 1) / 2) * Math.min(16, 4 + laneCount * 1.6)
      : 0

  const bow = distance * bend * 0.16
  const sag = Math.min(54, distance * 0.07) * (bend >= 0 ? 1 : -0.35)

  const c1 = {
    x: a.x + aNormal.x * reach + perp.x * (bow + laneOffset),
    y: a.y + aNormal.y * reach + perp.y * (bow + laneOffset) + sag
  }
  const c2 = {
    x: b.x + bNormal.x * reach + perp.x * (bow + laneOffset),
    y: b.y + bNormal.y * reach + perp.y * (bow + laneOffset) + sag
  }

  const mid = cubicPoint(a, c1, c2, b, 0.5)
  return {
    p0: a,
    c1,
    c2,
    p1: b,
    mid,
    bbox: cubicBBox(a, c1, c2, b),
    path: `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
  }
}

/* ------------------------------- drawing ------------------------------- */

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = clamp(t, 0, 1)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function distanceToStroke(point: Point, stroke: Stroke): number {
  if (stroke.points.length < 2) return Infinity
  let best = Infinity
  for (let i = 0; i < stroke.points.length - 2; i += 2) {
    best = Math.min(
      best,
      distanceToSegment(
        point,
        { x: stroke.points[i], y: stroke.points[i + 1] },
        { x: stroke.points[i + 2], y: stroke.points[i + 3] }
      )
    )
  }
  if (stroke.points.length === 2) {
    return Math.hypot(point.x - stroke.points[0], point.y - stroke.points[1])
  }
  return best
}

/**
 * Split a freehand stroke around an eraser point. Points that fall within the
 * eraser radius are removed and the remaining points are emitted as separate
 * strokes, so erasing genuinely cuts a line instead of deleting all of it.
 */
export function splitStrokeAt(
  stroke: Stroke,
  point: Point,
  radius: number,
  shape: 'circle' | 'square' = 'circle'
): { keep: Stroke[]; removed: boolean } {
  const points = stroke.points
  if (!points.length) return { keep: [], removed: false }
  const inside = (p: Point): boolean =>
    shape === 'square'
      ? Math.abs(p.x - point.x) <= radius && Math.abs(p.y - point.y) <= radius
      : Math.hypot(point.x - p.x, point.y - p.y) <= radius
  if (stroke.tool === 'rect' || stroke.tool === 'ellipse' || stroke.tool === 'line' || stroke.tool === 'arrow') {
    const b = strokeBBox(stroke)
    const hit =
      stroke.tool === 'line' || stroke.tool === 'arrow'
        ? distanceToStroke(point, stroke) < radius
        : pointInRect(point, expandRect(b, radius))
    return hit ? { keep: [], removed: true } : { keep: [stroke], removed: false }
  }

  const runs: number[][] = []
  let current: number[] = []
  for (let i = 0; i < points.length; i += 2) {
    const p = { x: points[i], y: points[i + 1] }
    const px = i >= 2 ? { x: points[i - 2], y: points[i - 1] } : p
    const nearLine = i >= 2 && distanceToSegment(point, px, p) < radius
    if (inside(p) || nearLine) {
      if (current.length >= 4) runs.push(current)
      current = []
    } else {
      if (!current.length && i >= 2) current.push(px.x, px.y)
      current.push(p.x, p.y)
    }
  }
  if (current.length >= 2) runs.push(current)
  const removed = runs.length !== 1 || runs[0]?.length !== points.length
  const keep = runs
    .filter((run) => run.length >= 2)
    .map((run) => ({ ...stroke, id: `${stroke.id}_${Math.random().toString(36).slice(2, 6)}`, points: run }))
  return { keep, removed }
}

/* ------------------------------ formatting ----------------------------- */

export function plainTextFromHtml(html: string): string {
  if (!html) return ''
  if (!/[<>&]/.test(html)) return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.body.textContent ?? ''
  } catch {
    return html.replace(/<[^>]+>/g, ' ')
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function formatDate(ts: number, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
