import type { Card, Group, Project, Space, Stroke, Thread } from '@shared/types'
import { PROJECT_FORMAT_VERSION } from '@shared/types'

/** Tolerant import/migration for projects produced by older builds. */
export function normalizeProject(input: Project): Project {
  const project: Project = structuredClone(input)
  const now = Date.now()
  project.format = PROJECT_FORMAT_VERSION
  project.createdAt = project.createdAt || now
  project.updatedAt = project.updatedAt || now
  project.name = project.name?.trim() || 'Untitled project'
  project.description = project.description ?? ''
  project.categories = Array.isArray(project.categories) ? project.categories : []
  const rawSpaces = Array.isArray(project.spaces) ? project.spaces : []
  const spaces: Space[] = rawSpaces.map((raw, index) => {
    const rawCards = raw.cards as unknown
    const cardRecord: Record<string, Card> = Array.isArray(rawCards)
      ? Object.fromEntries((rawCards as Card[]).map((card) => [card.id, card]))
      : { ...((raw.cards as Record<string, Card>) ?? {}) }
    const cards: Record<string, Card> = {}
    for (const [id, card] of Object.entries(cardRecord)) {
      if (!card || !card.kind) continue
      const normalized: Card = {
        ...card,
        id: card.id || id,
        x: Number.isFinite(card.x) ? card.x : 0,
        y: Number.isFinite(card.y) ? card.y : 0,
        w: Number.isFinite(card.w) && card.w > 0 ? card.w : 300,
        h: Number.isFinite(card.h) && card.h > 0 ? card.h : 200,
        z: Number.isFinite(card.z) ? card.z : 1,
        title: card.title ?? '',
        body: card.body ?? '',
        categories: Array.isArray(card.categories) ? card.categories : [],
        pins: Array.isArray(card.pins) ? card.pins : [],
        createdAt: card.createdAt || now,
        updatedAt: card.updatedAt || now
      }
      cards[normalized.id] = normalized
    }
    const threads: Space['threads'] = {}
    for (const [id, thread] of Object.entries((raw.threads as Space['threads']) ?? {})) {
      if (!thread?.from?.cardId || !thread?.to?.cardId) continue
      if (!cards[thread.from.cardId] || !cards[thread.to.cardId]) continue
      const normalizedThread: Thread = {
        ...thread,
        id: thread.id || id,
        color: thread.color || '#b33a3a',
        width: thread.width || 2,
        style: thread.style || 'thread',
        curve: Number.isFinite(thread.curve) ? thread.curve : 0.3,
        opacity: Number.isFinite(thread.opacity) ? thread.opacity : 0.95,
        createdAt: thread.createdAt || now
      }
      threads[normalizedThread.id] = normalizedThread
    }
    const strokes: Space['strokes'] = {}
    for (const [id, stroke] of Object.entries((raw.strokes as Space['strokes']) ?? {})) {
      if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) continue
      const normalizedStroke: Stroke = {
        ...stroke,
        id: stroke.id || id,
        color: stroke.color || '#e9e6dd',
        width: stroke.width || 3,
        opacity: Number.isFinite(stroke.opacity) ? stroke.opacity : 0.85,
        seed: stroke.seed ?? Math.random() * 1000,
        createdAt: stroke.createdAt || now
      }
      strokes[normalizedStroke.id] = normalizedStroke
    }
    const groups: Space['groups'] = {}
    for (const [id, group] of Object.entries((raw.groups as Space['groups']) ?? {})) {
      if (!group) continue
      const normalizedGroup: Group = {
        ...group,
        id: group.id || id,
        title: group.title || 'Group',
        color: group.color || '#c99a3d',
        collapsed: Boolean(group.collapsed),
        createdAt: group.createdAt || now
      }
      groups[normalizedGroup.id] = normalizedGroup
    }
    return {
      id: raw.id || `sp_${index}_${now}`,
      name: raw.name || `Board ${String(index + 1).padStart(2, '0')}`,
      description: raw.description ?? '',
      camera: {
        x: Number.isFinite(raw.camera?.x) ? raw.camera.x : 0,
        y: Number.isFinite(raw.camera?.y) ? raw.camera.y : 0,
        zoom: Number.isFinite(raw.camera?.zoom) && raw.camera.zoom > 0 ? raw.camera.zoom : 1
      },
      cards,
      threads,
      strokes,
      groups,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now
    }
  })
  project.spaces = spaces.length ? spaces : []
  project.activeSpaceId =
    project.activeSpaceId && project.spaces.some((space) => space.id === project.activeSpaceId)
      ? project.activeSpaceId
      : project.spaces[0]?.id ?? ''
  return project
}
