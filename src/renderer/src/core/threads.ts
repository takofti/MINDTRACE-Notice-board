import type { Card, Group, Point, Space, Thread } from '@shared/types'
import type { AppSettings } from '@shared/settings'
import {
  groupBounds,
  pinNormal,
  pinPoint,
  threadGeometry,
  type CurveGeometry
} from './geometry'

export interface ResolvedEnd {
  point: Point
  normal: Point
  key: string
  card: Card
  collapsedGroup: boolean
}

function edgeAnchor(rect: { x: number; y: number; w: number; h: number }, other: Point): { point: Point; normal: Point } {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = other.x - cx
  const dy = other.y - cy
  if (Math.abs(dx / (rect.w || 1)) > Math.abs(dy / (rect.h || 1))) {
    return dx >= 0
      ? { point: { x: rect.x + rect.w, y: cy }, normal: { x: 1, y: 0 } }
      : { point: { x: rect.x, y: cy }, normal: { x: -1, y: 0 } }
  }
  return dy >= 0
    ? { point: { x: cx, y: rect.y + rect.h }, normal: { x: 0, y: 1 } }
    : { point: { x: cx, y: rect.y }, normal: { x: 0, y: -1 } }
}

export function resolveThreadEnd(
  cardId: string,
  pinId: string,
  cards: Record<string, Card>,
  groups: Record<string, Group>,
  otherPoint: Point
): ResolvedEnd | null {
  const card = cards[cardId]
  if (!card) return null
  const group = card.groupId ? groups[card.groupId] : undefined
  if (group?.collapsed) {
    const bounds = groupBounds(group, cards)
    const anchor = edgeAnchor(bounds, otherPoint)
    return {
      point: anchor.point,
      normal: anchor.normal,
      key: `group:${group.id}`,
      card,
      collapsedGroup: true
    }
  }
  return {
    point: pinPoint(card, pinId),
    normal: pinNormal(card, pinId),
    key: `${card.id}:${pinId}`,
    card,
    collapsedGroup: false
  }
}

/** Group threads by their starting pin so they can fan out instead of stack. */
export function computeThreadLanes(threads: Thread[]): Map<string, { lane: number; count: number }> {
  const groups = new Map<string, Thread[]>()
  for (const thread of threads) {
    const key = `${thread.from.cardId}:${thread.from.pinId}`
    const list = groups.get(key) ?? []
    list.push(thread)
    groups.set(key, list)
  }
  const result = new Map<string, { lane: number; count: number }>()
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const ax = `${a.to.cardId}:${a.to.pinId}`
      const bx = `${b.to.cardId}:${b.to.pinId}`
      return ax.localeCompare(bx)
    })
    list.forEach((thread, index) => {
      result.set(thread.id, { lane: index, count: list.length })
    })
  }
  return result
}

export function threadCurveFor(
  thread: Thread,
  space: Space,
  lane: { lane: number; count: number } | undefined,
  settings: AppSettings,
  zoom: number
): CurveGeometry | null {
  const fromCard = space.cards[thread.from.cardId]
  const toCard = space.cards[thread.to.cardId]
  if (!fromCard || !toCard) return null
  const fromCenter = { x: fromCard.x + fromCard.w / 2, y: fromCard.y + fromCard.h / 2 }
  const toCenter = { x: toCard.x + toCard.w / 2, y: toCard.y + toCard.h / 2 }
  const from = resolveThreadEnd(thread.from.cardId, thread.from.pinId, space.cards, space.groups, toCenter)
  const to = resolveThreadEnd(thread.to.cardId, thread.to.pinId, space.cards, space.groups, fromCenter)
  if (!from || !to) return null
  return threadGeometry(from.point, from.normal, to.point, to.normal, {
    curve: thread.curve,
    lane: lane?.lane,
    laneCount: lane?.count,
    reduceOverlap: settings.board.reduceThreadOverlap,
    zoom,
    connectionType: thread.connectionType ?? 'curved'
  })
}

export function threadMidpoint(thread: Thread, space: Space, settings: AppSettings): Point | null {
  const curve = threadCurveFor(thread, space, undefined, settings, 1)
  return curve?.mid ?? null
}
