import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import type { Card, CardKind, Category, ClipboardPayload, Group, Point, Project, Space, Stroke, Thread, ToolId, SpaceMode } from '@shared/types'
import { useSettings } from './settings'
import {
  makeGroup,
  newCard,
  newSpace,
  newThread,
  classifyFile,
  customPin
} from '@/core/defaults'
import { uid } from '@/core/id'
import {
  cardRect,
  distanceToStroke,
  groupBounds,
  groupMemberCards,
  plainTextFromHtml,
  splitStrokeAt,
  strokeBBox,
  unionRects
} from '@/core/geometry'

export interface Selection {
  cards: string[]
  threads: string[]
  strokes: string[]
  groups: string[]
}

export interface BoardFilter {
  active: boolean
  query: string
  categories: string[]
  kinds: CardKind[]
}

export interface HistoryEntry {
  label: string
  snapshot: BoardSnapshot
}

interface BoardSnapshot {
  spaces: Space[]
  categories: Category[]
  activeSpaceId: string
}

type Get = () => BoardState
type Set = StoreApi<BoardState>['setState']

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface BoardState {
  project: Project | null
  activeSpaceId: string | null
  selection: Selection
  editingCardId: string | null
  tool: ToolId
  mode: SpaceMode
  history: { past: HistoryEntry[]; future: HistoryEntry[] }
  clipboard: ClipboardPayload | null
  filter: BoardFilter
  showHidden: boolean
  saveState: SaveState
  lastSavedAt: number | null
  saveError: string | null
  isLoading: boolean

  /* project / space */
  openProject: (project: Project) => void
  closeProject: () => void
  updateProjectMeta: (patch: Partial<Pick<Project, 'name' | 'description'>>) => void
  switchSpace: (spaceId: string) => void
  addSpace: (name?: string) => string | null
  duplicateSpace: (spaceId: string) => void
  renameSpace: (spaceId: string, name: string) => void
  updateSpaceDescription: (spaceId: string, description: string) => void
  deleteSpace: (spaceId: string) => void
  setCamera: (spaceId: string, camera: Partial<Space['camera']>) => void

  /* cards */
  createCard: (
    kind: CardKind,
    at: Point,
    opts?: Partial<Pick<Card, 'title' | 'body' | 'assetUrl' | 'assetName' | 'mime' | 'caption' | 'color' | 'w' | 'h' | 'categories'>> & {
      edit?: boolean
    }
  ) => Card | null
  insertCards: (cards: Card[], select?: boolean) => void
  createCardsFromAssets: (
    assets: { name: string; url: string; mime: string; size?: number }[],
    at: Point
  ) => void
  updateCard: (id: string, patch: Partial<Card>, record?: boolean) => void
  updateCards: (ids: string[], patch: Partial<Card>, record?: boolean) => void
  translateCards: (ids: string[], dx: number, dy: number, record?: boolean) => void
  translateStrokes: (ids: string[], dx: number, dy: number, record?: boolean) => void
  addPin: (cardId: string, x: number, y: number) => string | null
  removePin: (cardId: string, pinId: string) => void
  deleteCard: (id: string) => void
  deleteSelection: () => void

  /* selection */
  setSelection: (selection: Partial<Selection>) => void
  selectCard: (id: string, additive?: boolean) => void
  selectThread: (id: string, additive?: boolean) => void
  selectStroke: (id: string, additive?: boolean) => void
  selectGroup: (id: string, additive?: boolean) => void
  clearSelection: () => void
  selectAll: () => void
  selectConnected: (depth?: number) => void
  setEditingCard: (id: string | null) => void
  setTool: (tool: ToolId) => void
  setMode: (mode: SpaceMode) => void

  /* threads */
  createThread: (from: { cardId: string; pinId: string }, to: { cardId: string; pinId: string }) => string | null
  addThread: (thread: Thread, record?: boolean) => void
  updateThread: (id: string, patch: Partial<Thread>, record?: boolean) => void
  updateThreads: (ids: string[], patch: Partial<Thread>, record?: boolean) => void
  deleteThreads: (ids: string[]) => void
  hideThreads: (ids: string[], hidden: boolean) => void

  /* strokes */
  addStroke: (stroke: Stroke, record?: boolean) => void
  updateStroke: (id: string, patch: Partial<Stroke>, record?: boolean) => void
  deleteStrokes: (ids: string[]) => void
  eraseStrokesAt: (point: Point, radius: number, shape?: 'circle' | 'square') => number

  /* groups */
  groupSelection: (title?: string) => string | null
  addGroup: (group: Group, cardIds: string[], record?: boolean) => void
  updateGroup: (id: string, patch: Partial<Group>, record?: boolean) => void
  ungroup: (ids: string[]) => void
  toggleGroupCollapsed: (id: string) => void
  moveGroup: (id: string, dx: number, dy: number) => void

  /* categories */
  addCategory: (name: string, color: string) => string | null
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string) => void
  toggleCategoryOnSelection: (categoryId: string) => void

  /* clipboard */
  copySelection: () => number
  pasteClipboard: (at?: Point) => number
  duplicateSelection: () => void
  setClipboard: (payload: ClipboardPayload | null) => void

  /* layers / locking */
  bringForward: (direction: 'forward' | 'backward' | 'front' | 'back') => void
  nudgeSelection: (dx: number, dy: number) => void
  toggleLockSelection: () => void
  toggleHiddenSelection: () => void

  /* history */
  beginHistory: (label: string) => void
  commitHistory: () => void
  cancelHistory: () => void
  undo: () => void
  redo: () => void
  clearHistory: () => void

  /* filtering */
  setFilter: (patch: Partial<BoardFilter>) => void
  clearFilter: () => void
  setShowHidden: (value: boolean) => void

  /* persistence state */
  setSaveState: (state: SaveState, savedAt?: number, error?: string | null) => void
  setLoading: (value: boolean) => void
}

let pending: { snapshot: BoardSnapshot; label: string } | null = null

function capture(project: Project): BoardSnapshot {
  return {
    spaces: structuredClone(project.spaces),
    categories: structuredClone(project.categories),
    activeSpaceId: project.activeSpaceId
  }
}

function boardSignature(snapshot: BoardSnapshot): string {
  return JSON.stringify(snapshot, (key, value) => {
    if (key === 'camera' || key === 'updatedAt') return undefined
    return value
  })
}

function pushEntry(get: Get, set: Set, entry: HistoryEntry): void {
  const max = Math.max(5, useSettings.getState().settings.data.maxUndo || 60)
  set((state) => ({
    history: {
      past: [...state.history.past, entry].slice(-max),
      future: []
    }
  }))
  void get
}

function activeSpace(state: BoardState): Space | null {
  if (!state.project) return null
  return state.project.spaces.find((s) => s.id === state.activeSpaceId) ?? state.project.spaces[0] ?? null
}

export function getActiveSpace(state: BoardState): Space | null {
  return activeSpace(state)
}

export function updateSpace(
  project: Project,
  spaceId: string,
  updater: (space: Space) => Partial<Space>
): Project {
  return {
    ...project,
    spaces: project.spaces.map((space) => {
      if (space.id !== spaceId) return space
      return { ...space, ...updater(space), updatedAt: Date.now() }
    }),
    updatedAt: Date.now()
  }
}

function maxZ(space: Space): number {
  let max = 0
  for (const card of Object.values(space.cards)) max = Math.max(max, card.z)
  return max
}

export function cardMatchesFilter(card: Card, filter: BoardFilter, categories: Category[]): boolean {
  if (!filter.active) return true
  if (filter.kinds.length && !filter.kinds.includes(card.kind)) return false
  if (filter.categories.length) {
    const has = card.categories.some((id) => filter.categories.includes(id))
    if (!has) return false
  }
  if (filter.query.trim()) {
    const haystack = [
      card.title,
      plainTextFromHtml(card.body),
      card.assetName ?? '',
      card.caption ?? '',
      card.kind,
      card.categories
        .map((id) => categories.find((c) => c.id === id)?.name ?? '')
        .join(' ')
    ]
      .join(' ')
      .toLowerCase()
    const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.every((term) => haystack.includes(term))) return false
  }
  return true
}

function pruneSelection(project: Project, spaceId: string, selection: Selection): Selection {
  const space = project.spaces.find((s) => s.id === spaceId)
  if (!space) return { cards: [], threads: [], strokes: [], groups: [] }
  return {
    cards: selection.cards.filter((id) => space.cards[id]),
    threads: selection.threads.filter((id) => space.threads[id]),
    strokes: selection.strokes.filter((id) => space.strokes[id]),
    groups: selection.groups.filter((id) => space.groups[id])
  }
}

interface PayloadResult {
  cards: Card[]
  threads: Thread[]
  strokes: Stroke[]
  groups: Group[]
}

function remapPayload(payload: ClipboardPayload, dx: number, dy: number): PayloadResult {
  const groupMap = new Map<string, string>()
  for (const group of payload.groups) groupMap.set(group.id, uid('grp'))
  const cardMap = new Map<string, Card>()
  const pinMaps = new Map<string, Map<string, string>>()
  for (const card of payload.cards) {
    const pinMap = new Map<string, string>()
    for (const pin of card.pins) pinMap.set(pin.id, uid('pin'))
    pinMaps.set(card.id, pinMap)
    cardMap.set(card.id, {
      ...structuredClone(card),
      id: uid('card'),
      x: card.x + dx,
      y: card.y + dy,
      pins: card.pins.map((pin) => ({ ...pin, id: pinMap.get(pin.id) as string })),
      groupId: card.groupId ? groupMap.get(card.groupId) ?? card.groupId : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  }
  const threads: Thread[] = []
  for (const thread of payload.threads) {
    const from = cardMap.get(thread.from.cardId)
    const to = cardMap.get(thread.to.cardId)
    if (!from || !to) continue
    const pinFrom = pinMaps.get(thread.from.cardId)?.get(thread.from.pinId) ?? thread.from.pinId
    const pinTo = pinMaps.get(thread.to.cardId)?.get(thread.to.pinId) ?? thread.to.pinId
    threads.push({
      ...structuredClone(thread),
      id: uid('thr'),
      from: { cardId: from.id, pinId: pinFrom },
      to: { cardId: to.id, pinId: pinTo },
      createdAt: Date.now()
    })
  }
  const strokes = payload.strokes.map((stroke) => ({
    ...structuredClone(stroke),
    id: uid('str'),
    points: stroke.points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy)),
    createdAt: Date.now()
  }))
  const groups = payload.groups.map((group) => ({
    ...structuredClone(group),
    id: groupMap.get(group.id) as string,
    title: group.title,
    createdAt: Date.now()
  }))
  return { cards: [...cardMap.values()], threads, strokes, groups }
}

function buildClipboard(space: Space, selection: Selection): ClipboardPayload | null {
  const cards = selection.cards.map((id) => space.cards[id]).filter(Boolean)
  const strokes = selection.strokes.map((id) => space.strokes[id]).filter(Boolean)
  if (!cards.length && !strokes.length) return null
  const cardIds = new Set(cards.map((c) => c.id))
  const threads = Object.values(space.threads).filter(
    (thread) => cardIds.has(thread.from.cardId) && cardIds.has(thread.to.cardId)
  )
  const groupIds = new Set<string>(selection.groups)
  for (const card of cards) if (card.groupId) groupIds.add(card.groupId)
  const groups = Array.from(groupIds)
    .map((id) => space.groups[id])
    .filter(Boolean)
  return {
    cards: structuredClone(cards),
    threads: structuredClone(threads),
    groups: structuredClone(groups),
    strokes: structuredClone(strokes),
    categoryIds: Array.from(new Set(cards.flatMap((c) => c.categories))),
    sourceSpaceId: space.id
  }
}

function payloadBounds(payload: ClipboardPayload): { x: number; y: number; w: number; h: number } | null {
  const rects = [
    ...payload.cards.map(cardRect),
    ...payload.strokes.map(strokeBBox)
  ]
  return unionRects(rects)
}

export const useBoard = create<BoardState>((set, get) => {
  const record = (label: string, mutate: (state: BoardState) => Partial<BoardState> | null): void => {
    // Close any open interaction transaction (e.g. text editing) first.
    if (pending) {
      const open = pending
      pending = null
      const currentProject = get().project
      if (currentProject && boardSignature(open.snapshot) !== boardSignature(capture(currentProject))) {
        pushEntry(get, set, open)
      }
    }
    if (!get().project) return
    const before = capture(get().project as Project)
    const patch = mutate(get())
    if (!patch) return
    set(patch)
    const after = get().project
    if (!after) return
    if (boardSignature(before) === boardSignature(capture(after))) return
    pushEntry(get, set, { label, snapshot: before })
  }

  return {
    project: null,
    activeSpaceId: null,
    selection: { cards: [], threads: [], strokes: [], groups: [] },
    editingCardId: null,
    tool: 'select',
    mode: 'normal',
    history: { past: [], future: [] },
    clipboard: null,
    filter: { active: false, query: '', categories: [], kinds: [] },
    showHidden: false,
    saveState: 'idle',
    lastSavedAt: null,
    saveError: null,
    isLoading: true,

    /* ------------------------------ project ------------------------------ */

    openProject: (project) => {
      pending = null
      const spaceId =
        project.activeSpaceId && project.spaces.some((s) => s.id === project.activeSpaceId)
          ? project.activeSpaceId
          : project.spaces[0]?.id ?? null
      set({
        project,
        activeSpaceId: spaceId,
        selection: { cards: [], threads: [], strokes: [], groups: [] },
        editingCardId: null,
        history: { past: [], future: [] },
        clipboard: null,
        filter: { active: false, query: '', categories: [], kinds: [] },
        tool: 'select',
        mode: 'normal',
        saveState: 'idle',
        saveError: null,
        isLoading: false
      })
    },

    closeProject: () => {
      pending = null
      set({
        project: null,
        activeSpaceId: null,
        selection: { cards: [], threads: [], strokes: [], groups: [] },
        history: { past: [], future: [] },
        editingCardId: null,
        isLoading: false
      })
    },

    updateProjectMeta: (patch) => {
      set((state) =>
        state.project
          ? { project: { ...state.project, ...patch, updatedAt: Date.now() } }
          : {}
      )
    },

    switchSpace: (spaceId) => {
      const state = get()
      if (!state.project?.spaces.some((s) => s.id === spaceId)) return
      set({
        activeSpaceId: spaceId,
        project: { ...state.project, activeSpaceId: spaceId },
        selection: { cards: [], threads: [], strokes: [], groups: [] },
        editingCardId: null
      })
    },

    addSpace: (name) => {
      const state = get()
      if (!state.project) return null
      const space = newSpace(name?.trim() || `Board ${String(state.project.spaces.length + 1).padStart(2, '0')}`)
      record('New space', (current) => {
        if (!current.project) return null
        const project: Project = {
          ...current.project,
          spaces: [...current.project.spaces, space],
          activeSpaceId: space.id,
          updatedAt: Date.now()
        }
        return {
          project,
          activeSpaceId: space.id,
          selection: { cards: [], threads: [], strokes: [], groups: [] },
          editingCardId: null
        }
      })
      return space.id
    },

    duplicateSpace: (spaceId) => {
      const state = get()
      const source = state.project?.spaces.find((s) => s.id === spaceId)
      if (!state.project || !source) return
      const clone = structuredClone(source)
      const newSpaceId = uid('sp')
      const groupMap = new Map<string, string>()
      for (const group of Object.values(clone.groups)) groupMap.set(group.id, uid('grp'))
      const cardMap = new Map<string, string>()
      const pinMaps = new Map<string, Map<string, string>>()
      const newCards: typeof clone.cards = {}
      for (const card of Object.values(clone.cards)) {
        const newId = uid('card')
        cardMap.set(card.id, newId)
        const pinMap = new Map<string, string>()
        for (const pin of card.pins) pinMap.set(pin.id, uid('pin'))
        pinMaps.set(card.id, pinMap)
        card.id = newId
        card.pins = card.pins.map((pin) => ({ ...pin, id: pinMap.get(pin.id) as string }))
        card.groupId = card.groupId ? groupMap.get(card.groupId) : undefined
        newCards[newId] = card
      }
      const newGroups: typeof clone.groups = {}
      for (const group of Object.values(clone.groups)) {
        group.id = groupMap.get(group.id) as string
        newGroups[group.id] = group
      }
      const newThreads: typeof clone.threads = {}
      for (const thread of Object.values(clone.threads)) {
        const fromCard = cardMap.get(thread.from.cardId)
        const toCard = cardMap.get(thread.to.cardId)
        if (!fromCard || !toCard) continue
        thread.id = uid('thr')
        thread.from = {
          cardId: fromCard,
          pinId: pinMaps.get(thread.from.cardId)?.get(thread.from.pinId) ?? thread.from.pinId
        }
        thread.to = {
          cardId: toCard,
          pinId: pinMaps.get(thread.to.cardId)?.get(thread.to.pinId) ?? thread.to.pinId
        }
        newThreads[thread.id] = thread
      }
      const newStrokes: typeof clone.strokes = {}
      for (const stroke of Object.values(clone.strokes)) {
        stroke.id = uid('str')
        newStrokes[stroke.id] = stroke
      }
      clone.cards = newCards
      clone.groups = newGroups
      clone.threads = newThreads
      clone.strokes = newStrokes
      clone.id = newSpaceId
      clone.name = `${source.name} copy`
      clone.createdAt = Date.now()
      clone.updatedAt = Date.now()
      record('Duplicate space', (current) => {
        if (!current.project) return null
        return {
          project: {
            ...current.project,
            spaces: [...current.project.spaces, clone],
            activeSpaceId: newSpaceId,
            updatedAt: Date.now()
          },
          activeSpaceId: newSpaceId,
          selection: { cards: [], threads: [], strokes: [], groups: [] }
        }
      })
    },

    renameSpace: (spaceId, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      record('Rename space', (state) => {
        if (!state.project) return null
        return {
          project: {
            ...state.project,
            spaces: state.project.spaces.map((s) =>
              s.id === spaceId ? { ...s, name: trimmed, updatedAt: Date.now() } : s
            ),
            updatedAt: Date.now()
          }
        }
      })
    },

    updateSpaceDescription: (spaceId, description) => {
      record('Edit space description', (state) => {
        if (!state.project) return null
        return {
          project: {
            ...state.project,
            spaces: state.project.spaces.map((s) =>
              s.id === spaceId ? { ...s, description, updatedAt: Date.now() } : s
            ),
            updatedAt: Date.now()
          }
        }
      })
    },

    deleteSpace: (spaceId) => {
      const state = get()
      if (!state.project) return
      if (state.project.spaces.length <= 1) return
      record('Delete space', (current) => {
        if (!current.project) return null
        const spaces = current.project.spaces.filter((s) => s.id !== spaceId)
        if (!spaces.length) return null
        const nextActive =
          current.activeSpaceId === spaceId ? spaces[0].id : current.activeSpaceId ?? spaces[0].id
        return {
          project: { ...current.project, spaces, activeSpaceId: nextActive, updatedAt: Date.now() },
          activeSpaceId: nextActive,
          selection: { cards: [], threads: [], strokes: [], groups: [] },
          editingCardId: null
        }
      })
    },

    setCamera: (spaceId, camera) => {
      const state = get()
      if (!state.project) return
      const space = state.project.spaces.find((s) => s.id === spaceId)
      if (!space) return
      const next = { ...space.camera, ...camera }
      if (
        Math.abs(next.x - space.camera.x) < 0.01 &&
        Math.abs(next.y - space.camera.y) < 0.01 &&
        Math.abs(next.zoom - space.camera.zoom) < 0.0001
      ) {
        return
      }
      set({
        project: {
          ...state.project,
          spaces: state.project.spaces.map((s) => (s.id === spaceId ? { ...s, camera: next } : s))
        }
      })
    },

    /* ------------------------------- cards ------------------------------- */

    createCard: (kind, at, opts = {}) => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return null
      const settings = useSettings.getState().settings
      const z = maxZ(space) + 1
      const card = newCard(kind, {
        at,
        settings,
        title: opts.title,
        body: opts.body,
        assetUrl: opts.assetUrl,
        assetName: opts.assetName,
        mime: opts.mime,
        caption: opts.caption,
        color: opts.color,
        categories: opts.categories,
        w: opts.w,
        h: opts.h,
        z
      })
      record('Add card', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        return {
          project: updateSpace(current.project, target.id, (s) => ({
            cards: { ...s.cards, [card.id]: card }
          })),
          selection: { cards: [card.id], threads: [], strokes: [], groups: [] },
          editingCardId: opts.edit === false ? null : kind === 'text' || kind === 'note' ? card.id : null
        }
      })
      return card
    },

    insertCards: (cards, select = true) => {
      if (!cards.length) return
      record('Add cards', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        let z = maxZ(space)
        const nextCards = { ...space.cards }
        for (const card of cards) {
          z += 1
          nextCards[card.id] = { ...card, z }
        }
        return {
          project: updateSpace(state.project, space.id, () => ({ cards: nextCards })),
          selection: select
            ? { cards: cards.map((c) => c.id), threads: [], strokes: [], groups: [] }
            : state.selection
        }
      })
    },

    createCardsFromAssets: (assets, at) => {
      if (!assets.length) return
      const settings = useSettings.getState().settings
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      let z = maxZ(space)
      const cards: Card[] = assets.map((asset, index) => {
        const kind = classifyFile(asset.name, asset.mime)
        const size =
          kind === 'image' ? { w: 380, h: 300 } : kind === 'video' ? { w: 440, h: 300 } : undefined
        const cleanTitle = asset.name.replace(/\.[^.]+$/, '')
        z += 1
        const card = newCard(kind, {
          at: { x: at.x + index * 32, y: at.y + index * 32 },
          settings,
          title: cleanTitle || asset.name,
          assetUrl: asset.url,
          assetName: asset.name,
          mime: asset.mime,
          w: size?.w,
          h: size?.h,
          z
        })
        return card
      })
      record(assets.length > 1 ? 'Add materials' : 'Add material', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const next = { ...target.cards }
        for (const card of cards) next[card.id] = card
        return {
          project: updateSpace(current.project, target.id, () => ({ cards: next })),
          selection: { cards: cards.map((c) => c.id), threads: [], strokes: [], groups: [] },
          editingCardId: null
        }
      })
    },

    updateCard: (id, patch, recordChange = false) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        const card = space.cards[id]
        if (!card) return null
        const next = { ...card, ...patch, updatedAt: Date.now() }
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            cards: { ...s.cards, [id]: next }
          }))
        }
      }
      if (recordChange) record('Edit card', apply)
      else {
        const patchState = apply(get())
        if (patchState) set(patchState)
      }
    },

    updateCards: (ids, patch, recordChange = false) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project || !ids.length) return null
        const space = activeSpace(state)
        if (!space) return null
        const cards = { ...space.cards }
        for (const id of ids) {
          if (!cards[id]) continue
          cards[id] = { ...cards[id], ...patch, updatedAt: Date.now() }
        }
        return { project: updateSpace(state.project, space.id, () => ({ cards })) }
      }
      if (recordChange) record('Edit cards', apply)
      else {
        const patchState = apply(get())
        if (patchState) set(patchState)
      }
    },

    translateCards: (ids, dx, dy, recordChange = false) => {
      if (!dx && !dy) return
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project || !ids.length) return null
        const space = activeSpace(state)
        if (!space) return null
        const cards = { ...space.cards }
        for (const id of ids) {
          const card = cards[id]
          if (!card || card.locked) continue
          const groupLocked = card.groupId ? space.groups[card.groupId]?.locked : false
          if (groupLocked) continue
          cards[id] = { ...card, x: card.x + dx, y: card.y + dy }
        }
        return { project: updateSpace(state.project, space.id, () => ({ cards })) }
      }
      if (recordChange) record('Move cards', apply)
      else {
        const patchState = apply(get())
        if (patchState) set(patchState)
      }
    },

    translateStrokes: (ids, dx, dy, recordChange = false) => {
      if (!dx && !dy) return
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project || !ids.length) return null
        const space = activeSpace(state)
        if (!space) return null
        const strokes = { ...space.strokes }
        for (const id of ids) {
          const stroke = strokes[id]
          if (!stroke || stroke.locked) continue
          strokes[id] = {
            ...stroke,
            points: stroke.points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy))
          }
        }
        return { project: updateSpace(state.project, space.id, () => ({ strokes })) }
      }
      if (recordChange) record('Move drawing', apply)
      else {
        const patchState = apply(get())
        if (patchState) set(patchState)
      }
    },

    addPin: (cardId, x, y) => {
      let created: string | null = null
      record('Add pin', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        const card = space?.cards[cardId]
        if (!space || !card) return null
        const pin = customPin(x, y)
        created = pin.id
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            cards: {
              ...s.cards,
              [cardId]: { ...card, pins: [...card.pins, pin], updatedAt: Date.now() }
            }
          }))
        }
      })
      return created
    },

    removePin: (cardId, pinId) => {
      record('Remove pin', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        const card = space?.cards[cardId]
        if (!space || !card) return null
        const threads = Object.fromEntries(
          Object.entries(space.threads).filter(
            ([, thread]) =>
              !(thread.from.cardId === cardId && thread.from.pinId === pinId) &&
              !(thread.to.cardId === cardId && thread.to.pinId === pinId)
          )
        )
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            cards: {
              ...s.cards,
              [cardId]: {
                ...card,
                pins: card.pins.filter((pin) => pin.id !== pinId),
                updatedAt: Date.now()
              }
            },
            threads
          })),
          selection: { ...state.selection, threads: state.selection.threads.filter((id) => threads[id]) }
        }
      })
    },

    deleteCard: (id) => {
      get().setSelection({ cards: [id] })
      get().deleteSelection()
    },

    deleteSelection: () => {
      const state = get()
      if (!state.project) return
      const space = activeSpace(state)
      if (!space) return
      const cardIds = new Set(state.selection.cards)
      const threadIds = new Set(state.selection.threads)
      const strokeIds = new Set(state.selection.strokes)
      const groupIds = new Set(state.selection.groups)
      if (!cardIds.size && !threadIds.size && !strokeIds.size && !groupIds.size) return

      record('Delete', (current) => {
        if (!current.project) return null
        const next = activeSpace(current)
        if (!next) return null
        const cards = { ...next.cards }
        for (const id of cardIds) delete cards[id]
        const threads = { ...next.threads }
        for (const [id, thread] of Object.entries(threads)) {
          if (cardIds.has(thread.from.cardId) || cardIds.has(thread.to.cardId)) delete threads[id]
        }
        for (const id of threadIds) delete threads[id]
        const strokes = { ...next.strokes }
        for (const id of strokeIds) delete strokes[id]
        const groups = { ...next.groups }
        for (const id of groupIds) delete groups[id]
        for (const card of Object.values(cards)) {
          if (card.groupId && groupIds.has(card.groupId)) card.groupId = undefined
        }
        for (const card of Object.values(cards)) {
          if (cardIds.has(card.id)) delete cards[card.id]
        }
        for (const id of Object.keys(groups)) {
          const hasMember = Object.values(cards).some((c) => c.groupId === id)
          if (!hasMember) delete groups[id]
        }
        return {
          project: updateSpace(current.project, next.id, () => ({ cards, threads, strokes, groups })),
          selection: { cards: [], threads: [], strokes: [], groups: [] },
          editingCardId: null
        }
      })
    },

    /* ----------------------------- selection ----------------------------- */

    setSelection: (selection) => {
      set((state) => ({
        selection: {
          cards: selection.cards ?? state.selection.cards,
          threads: selection.threads ?? state.selection.threads,
          strokes: selection.strokes ?? state.selection.strokes,
          groups: selection.groups ?? state.selection.groups
        }
      }))
    },

    selectCard: (id, additive = false) => {
      set((state) => {
        if (!additive) {
          return {
            selection: { cards: [id], threads: [], strokes: [], groups: [] }
          }
        }
        const has = state.selection.cards.includes(id)
        return {
          selection: {
            ...state.selection,
            cards: has ? state.selection.cards.filter((c) => c !== id) : [...state.selection.cards, id]
          }
        }
      })
    },

    selectThread: (id, additive = false) => {
      set((state) =>
        additive
          ? {
              selection: {
                ...state.selection,
                threads: state.selection.threads.includes(id)
                  ? state.selection.threads.filter((t) => t !== id)
                  : [...state.selection.threads, id]
              }
            }
          : { selection: { cards: [], threads: [id], strokes: [], groups: [] } }
      )
    },

    selectStroke: (id, additive = false) => {
      set((state) =>
        additive
          ? {
              selection: {
                ...state.selection,
                strokes: state.selection.strokes.includes(id)
                  ? state.selection.strokes.filter((s) => s !== id)
                  : [...state.selection.strokes, id]
              }
            }
          : { selection: { cards: [], threads: [], strokes: [id], groups: [] } }
      )
    },

    selectGroup: (id, additive = false) => {
      set((state) =>
        additive
          ? {
              selection: {
                ...state.selection,
                groups: state.selection.groups.includes(id)
                  ? state.selection.groups.filter((g) => g !== id)
                  : [...state.selection.groups, id]
              }
            }
          : { selection: { cards: [], threads: [], strokes: [], groups: [id] } }
      )
    },

    clearSelection: () => {
      set({ selection: { cards: [], threads: [], strokes: [], groups: [] }, editingCardId: null })
    },

    selectAll: () => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const cards = Object.values(space.cards)
        .filter((card) => !card.hidden && !(card.groupId && space.groups[card.groupId]?.collapsed))
        .map((card) => card.id)
      const strokes = Object.values(space.strokes)
        .filter((stroke) => !stroke.hidden)
        .map((stroke) => stroke.id)
      set({ selection: { cards, threads: [], strokes, groups: [] } })
    },

    selectConnected: (depth) => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const levels = Math.max(1, Math.min(4, depth ?? useSettings.getState().settings.interaction.focusDepth))
      const roots = state.selection.cards.length ? state.selection.cards : Object.keys(state.selection.cards)
      if (!roots.length) return
      const found = new Set(roots)
      let frontier = new Set(roots)
      for (let level = 0; level < levels; level++) {
        const next = new Set<string>()
        for (const thread of Object.values(space.threads)) {
          if (thread.hidden) continue
          if (frontier.has(thread.from.cardId) && !found.has(thread.to.cardId)) next.add(thread.to.cardId)
          if (frontier.has(thread.to.cardId) && !found.has(thread.from.cardId)) next.add(thread.from.cardId)
        }
        frontier = next
        for (const id of next) found.add(id)
        if (!next.size) break
      }
      set({ selection: { cards: Array.from(found), threads: [], strokes: [], groups: [] } })
    },

    setEditingCard: (id) => set({ editingCardId: id }),
    setTool: (tool) => set({ tool }),
    setMode: (mode) => set({ mode }),

    /* ------------------------------ threads ------------------------------ */

    createThread: (from, to) => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return null
      if (from.cardId === to.cardId && from.pinId === to.pinId) return null
      if (!space.cards[from.cardId] || !space.cards[to.cardId]) return null
      const existing = Object.values(space.threads).find(
        (thread) =>
          thread.from.cardId === from.cardId &&
          thread.from.pinId === from.pinId &&
          thread.to.cardId === to.cardId &&
          thread.to.pinId === to.pinId
      )
      if (existing) return existing.id
      const thread = newThread(from, to, useSettings.getState().settings)
      record('Tie thread', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        return {
          project: updateSpace(current.project, target.id, (s) => ({
            threads: { ...s.threads, [thread.id]: thread }
          })),
          selection: { cards: [], threads: [thread.id], strokes: [], groups: [] }
        }
      })
      return thread.id
    },

    addThread: (thread, recordChange = true) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            threads: { ...s.threads, [thread.id]: thread }
          }))
        }
      }
      if (recordChange) record('Add thread', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    updateThread: (id, patch, recordChange = false) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        const thread = space?.threads[id]
        if (!space || !thread) return null
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            threads: { ...s.threads, [id]: { ...thread, ...patch } }
          }))
        }
      }
      if (recordChange) record('Edit thread', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    updateThreads: (ids, patch, recordChange = false) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project || !ids.length) return null
        const space = activeSpace(state)
        if (!space) return null
        const threads = { ...space.threads }
        for (const id of ids) if (threads[id]) threads[id] = { ...threads[id], ...patch }
        return { project: updateSpace(state.project, space.id, () => ({ threads })) }
      }
      if (recordChange) record('Edit threads', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    deleteThreads: (ids) => {
      if (!ids.length) return
      const setIds = new Set(ids)
      record('Delete thread', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        const threads = Object.fromEntries(
          Object.entries(space.threads).filter(([id]) => !setIds.has(id))
        )
        return {
          project: updateSpace(state.project, space.id, () => ({ threads })),
          selection: { ...state.selection, threads: state.selection.threads.filter((id) => !setIds.has(id)) }
        }
      })
    },

    hideThreads: (ids, hidden) => {
      if (!ids.length) return
      const setIds = new Set(ids)
      record(hidden ? 'Hide threads' : 'Show threads', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        const threads = { ...space.threads }
        for (const id of setIds) {
          if (threads[id]) threads[id] = { ...threads[id], hidden }
        }
        return { project: updateSpace(state.project, space.id, () => ({ threads })) }
      })
    },

    /* ------------------------------ strokes ------------------------------ */

    addStroke: (stroke, recordChange = true) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            strokes: { ...s.strokes, [stroke.id]: stroke }
          })),
          selection: { cards: [], threads: [], strokes: [stroke.id], groups: [] }
        }
      }
      if (recordChange) record('Draw', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    updateStroke: (id, patch, recordChange = false) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        const stroke = space?.strokes[id]
        if (!space || !stroke) return null
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            strokes: { ...s.strokes, [id]: { ...stroke, ...patch } }
          }))
        }
      }
      if (recordChange) record('Edit drawing', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    deleteStrokes: (ids) => {
      if (!ids.length) return
      const setIds = new Set(ids)
      record('Erase drawing', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        const strokes = Object.fromEntries(
          Object.entries(space.strokes).filter(([id]) => !setIds.has(id))
        )
        return {
          project: updateSpace(state.project, space.id, () => ({ strokes })),
          selection: { ...state.selection, strokes: state.selection.strokes.filter((id) => !setIds.has(id)) }
        }
      })
    },

    eraseStrokesAt: (point, radius, shape = 'circle') => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return 0
      let changed = 0
      const strokes: Record<string, Stroke> = { ...space.strokes }
      for (const stroke of Object.values(space.strokes)) {
        if (stroke.hidden) continue
        const bbox = strokeBBox(stroke)
        if (
          point.x < bbox.x - radius ||
          point.x > bbox.x + bbox.w + radius ||
          point.y < bbox.y - radius ||
          point.y > bbox.y + bbox.h + radius
        ) {
          if (stroke.tool !== 'line' && stroke.tool !== 'arrow') continue
        }
        const hit =
          stroke.tool === 'rect' || stroke.tool === 'ellipse'
            ? point.x >= bbox.x - radius &&
              point.x <= bbox.x + bbox.w + radius &&
              point.y >= bbox.y - radius &&
              point.y <= bbox.y + bbox.h + radius
            : distanceToStroke(point, stroke) <= radius + stroke.width / 2
        if (!hit) continue
        const result = splitStrokeAt(stroke, point, radius + stroke.width / 2, shape)
        if (!result.removed) continue
        changed++
        delete strokes[stroke.id]
        for (const keep of result.keep) {
          if (keep.points.length >= 2) strokes[keep.id] = keep
        }
      }
      if (!changed) return 0
      set({
        project: updateSpace(state.project as Project, space.id, () => ({ strokes })),
        selection: { ...state.selection, strokes: [] }
      })
      return changed
    },

    /* ------------------------------- groups ------------------------------ */

    groupSelection: (title) => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return null
      const cards = state.selection.cards.filter((id) => space.cards[id])
      if (!cards.length) return null
      const group = makeGroup(title?.trim() || 'Group')
      record('Group cards', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const nextCards = { ...target.cards }
        for (const id of cards) {
          if (nextCards[id]) nextCards[id] = { ...nextCards[id], groupId: group.id }
        }
        return {
          project: updateSpace(current.project, target.id, (s) => ({
            cards: nextCards,
            groups: { ...s.groups, [group.id]: group }
          })),
          selection: { cards: [], threads: [], strokes: [], groups: [group.id] }
        }
      })
      return group.id
    },

    addGroup: (group, cardIds, recordChange = true) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        const cards = { ...space.cards }
        for (const id of cardIds) if (cards[id]) cards[id] = { ...cards[id], groupId: group.id }
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            cards,
            groups: { ...s.groups, [group.id]: group }
          }))
        }
      }
      if (recordChange) record('Add group', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    updateGroup: (id, patch, recordChange = false) => {
      const apply = (state: BoardState): Partial<BoardState> | null => {
        if (!state.project) return null
        const space = activeSpace(state)
        const group = space?.groups[id]
        if (!space || !group) return null
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            groups: { ...s.groups, [id]: { ...group, ...patch } }
          }))
        }
      }
      if (recordChange) record('Edit group', apply)
      else {
        const next = apply(get())
        if (next) set(next)
      }
    },

    ungroup: (ids) => {
      if (!ids.length) return
      const setIds = new Set(ids)
      record('Ungroup', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        if (!space) return null
        const cards = { ...space.cards }
        for (const card of Object.values(cards)) {
          if (card.groupId && setIds.has(card.groupId)) cards[card.id] = { ...card, groupId: undefined }
        }
        const groups = { ...space.groups }
        for (const id of setIds) delete groups[id]
        return {
          project: updateSpace(state.project, space.id, () => ({ cards, groups })),
          selection: { ...state.selection, groups: state.selection.groups.filter((id) => !setIds.has(id)) }
        }
      })
    },

    toggleGroupCollapsed: (id) => {
      record('Collapse group', (state) => {
        if (!state.project) return null
        const space = activeSpace(state)
        const group = space?.groups[id]
        if (!space || !group) return null
        return {
          project: updateSpace(state.project, space.id, (s) => ({
            groups: { ...s.groups, [id]: { ...group, collapsed: !group.collapsed } }
          }))
        }
      })
    },

    moveGroup: (id, dx, dy) => {
      if (!dx && !dy) return
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const cards = { ...space.cards }
      for (const card of groupMemberCards(id, space.cards)) {
        cards[card.id] = { ...card, x: card.x + dx, y: card.y + dy }
      }
      set({
        project: updateSpace(state.project as Project, space.id, () => ({ cards }))
      })
    },

    /* ----------------------------- categories ---------------------------- */

    addCategory: (name, color) => {
      const trimmed = name.trim()
      if (!trimmed) return null
      const category: Category = { id: uid('cat'), name: trimmed, color }
      record('Add category', (state) => {
        if (!state.project) return null
        return {
          project: {
            ...state.project,
            categories: [...state.project.categories, category],
            updatedAt: Date.now()
          }
        }
      })
      return category.id
    },

    updateCategory: (id, patch) => {
      record('Edit category', (state) => {
        if (!state.project) return null
        return {
          project: {
            ...state.project,
            categories: state.project.categories.map((category) =>
              category.id === id ? { ...category, ...patch } : category
            ),
            updatedAt: Date.now()
          }
        }
      })
    },

    deleteCategory: (id) => {
      record('Delete category', (state) => {
        if (!state.project) return null
        const project: Project = {
          ...state.project,
          categories: state.project.categories.filter((category) => category.id !== id),
          spaces: state.project.spaces.map((space) => ({
            ...space,
            cards: Object.fromEntries(
              Object.entries(space.cards).map(([cardId, card]) => [
                cardId,
                { ...card, categories: card.categories.filter((categoryId) => categoryId !== id) }
              ])
            )
          })),
          updatedAt: Date.now()
        }
        return { project }
      })
    },

    toggleCategoryOnSelection: (categoryId) => {
      const state = get()
      if (!state.selection.cards.length) return
      const space = activeSpace(state)
      if (!space) return
      const cards = state.selection.cards.map((id) => space.cards[id]).filter(Boolean)
      const allHave = cards.every((card) => card.categories.includes(categoryId))
      record(allHave ? 'Remove category' : 'Assign category', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const nextCards = { ...target.cards }
        for (const id of state.selection.cards) {
          const card = nextCards[id]
          if (!card) continue
          nextCards[id] = {
            ...card,
            categories: allHave
              ? card.categories.filter((category) => category !== categoryId)
              : [...new Set([...card.categories, categoryId])]
          }
        }
        return { project: updateSpace(current.project, target.id, () => ({ cards: nextCards })) }
      })
    },

    /* ------------------------------ clipboard ---------------------------- */

    copySelection: () => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return 0
      const payload = buildClipboard(space, state.selection)
      if (!payload) return 0
      set({ clipboard: payload })
      return payload.cards.length + payload.strokes.length
    },

    pasteClipboard: (at) => {
      const state = get()
      const space = activeSpace(state)
      if (!state.project || !space || !state.clipboard) return 0
      const payload = state.clipboard
      const bounds = payloadBounds(payload)
      if (!bounds) return 0
      const dx = at ? at.x - bounds.x : 36
      const dy = at ? at.y - bounds.y : 36
      const clone = remapPayload(payload, dx, dy)
      const validCategoryIds = new Set(state.project.categories.map((category) => category.id))
      for (const card of clone.cards) {
        card.categories = card.categories.filter((id) => validCategoryIds.has(id))
      }
      let z = maxZ(space)
      for (const card of clone.cards) {
        z += 1
        card.z = z
      }
      record('Paste', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const cards = { ...target.cards }
        for (const card of clone.cards) cards[card.id] = card
        const threads = { ...target.threads }
        for (const thread of clone.threads) threads[thread.id] = thread
        const strokes = { ...target.strokes }
        for (const stroke of clone.strokes) strokes[stroke.id] = stroke
        const groups = { ...target.groups }
        for (const group of clone.groups) groups[group.id] = group
        return {
          project: updateSpace(current.project, target.id, () => ({ cards, threads, strokes, groups })),
          selection: {
            cards: clone.cards.map((card) => card.id),
            threads: [],
            strokes: clone.strokes.map((stroke) => stroke.id),
            groups: []
          },
          editingCardId: null
        }
      })
      return clone.cards.length + clone.strokes.length
    },

    duplicateSelection: () => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const payload = buildClipboard(space, state.selection)
      if (!payload) return
      const clone = remapPayload(payload, 36, 36)
      let z = maxZ(space)
      for (const card of clone.cards) {
        z += 1
        card.z = z
      }
      record('Duplicate', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const cards = { ...target.cards }
        for (const card of clone.cards) cards[card.id] = card
        const threads = { ...target.threads }
        for (const thread of clone.threads) threads[thread.id] = thread
        const strokes = { ...target.strokes }
        for (const stroke of clone.strokes) strokes[stroke.id] = stroke
        const groups = { ...target.groups }
        for (const group of clone.groups) groups[group.id] = group
        return {
          project: updateSpace(current.project, target.id, () => ({ cards, threads, strokes, groups })),
          selection: {
            cards: clone.cards.map((card) => card.id),
            threads: [],
            strokes: clone.strokes.map((stroke) => stroke.id),
            groups: []
          }
        }
      })
    },

    setClipboard: (payload) => set({ clipboard: payload }),

    /* --------------------------- layer / locking ------------------------- */

    bringForward: (direction) => {
      const state = get()
      const space = activeSpace(state)
      if (!space || !state.selection.cards.length) return
      const cards = { ...space.cards }
      const selected = new Set(state.selection.cards)
      const list = Object.values(cards).sort((a, b) => a.z - b.z)
      if (direction === 'front') {
        const moving = list.filter((card) => selected.has(card.id))
        const rest = list.filter((card) => !selected.has(card.id))
        list.splice(0, list.length, ...rest, ...moving)
      } else if (direction === 'back') {
        const moving = list.filter((card) => selected.has(card.id))
        const rest = list.filter((card) => !selected.has(card.id))
        list.splice(0, list.length, ...moving, ...rest)
      } else if (direction === 'forward') {
        for (let i = list.length - 2; i >= 0; i--) {
          if (selected.has(list[i].id) && !selected.has(list[i + 1].id)) {
            ;[list[i], list[i + 1]] = [list[i + 1], list[i]]
          }
        }
      } else {
        for (let i = 1; i < list.length; i++) {
          if (selected.has(list[i].id) && !selected.has(list[i - 1].id)) {
            ;[list[i], list[i - 1]] = [list[i - 1], list[i]]
          }
        }
      }
      list.forEach((card, index) => {
        cards[card.id] = { ...card, z: index + 1 }
      })
      record('Change order', (current) => {
        if (!current.project) return null
        return { project: updateSpace(current.project, space.id, () => ({ cards })) }
      })
    },

    nudgeSelection: (dx, dy) => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const cardIds = new Set(state.selection.cards)
      const strokeIds = new Set(state.selection.strokes)
      if (!cardIds.size && !strokeIds.size) return
      record('Nudge', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const cards = { ...target.cards }
        for (const id of cardIds) {
          const card = cards[id]
          if (card && !card.locked) cards[id] = { ...card, x: card.x + dx, y: card.y + dy }
        }
        const strokes = { ...target.strokes }
        for (const id of strokeIds) {
          const stroke = strokes[id]
          if (stroke && !stroke.locked) {
            strokes[id] = {
              ...stroke,
              points: stroke.points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy))
            }
          }
        }
        return { project: updateSpace(current.project, target.id, () => ({ cards, strokes })) }
      })
    },

    toggleLockSelection: () => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const cardIds = state.selection.cards
      const strokeIds = state.selection.strokes
      const groups = state.selection.groups
      if (!cardIds.length && !strokeIds.length && !groups.length) return
      const cards = cardIds.map((id) => space.cards[id]).filter(Boolean)
      const strokes = strokeIds.map((id) => space.strokes[id]).filter(Boolean)
      const groupList = groups.map((id) => space.groups[id]).filter(Boolean)
      const allLocked =
        [...cards, ...strokes, ...groupList].length > 0 &&
        [...cards, ...strokes, ...groupList].every((item) => item.locked)
      record(allLocked ? 'Unlock' : 'Lock', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const nextCards = { ...target.cards }
        for (const id of cardIds) if (nextCards[id]) nextCards[id] = { ...nextCards[id], locked: !allLocked }
        const nextStrokes = { ...target.strokes }
        for (const id of strokeIds) if (nextStrokes[id]) nextStrokes[id] = { ...nextStrokes[id], locked: !allLocked }
        const nextGroups = { ...target.groups }
        for (const id of groups) if (nextGroups[id]) nextGroups[id] = { ...nextGroups[id], locked: !allLocked }
        return {
          project: updateSpace(current.project, target.id, () => ({
            cards: nextCards,
            strokes: nextStrokes,
            groups: nextGroups
          }))
        }
      })
    },

    toggleHiddenSelection: () => {
      const state = get()
      const space = activeSpace(state)
      if (!space) return
      const cardIds = state.selection.cards
      if (!cardIds.length) return
      const cards = cardIds.map((id) => space.cards[id]).filter(Boolean)
      const allHidden = cards.length > 0 && cards.every((card) => card.hidden)
      record(allHidden ? 'Show cards' : 'Hide cards', (current) => {
        if (!current.project) return null
        const target = activeSpace(current)
        if (!target) return null
        const nextCards = { ...target.cards }
        for (const id of cardIds) {
          if (nextCards[id]) nextCards[id] = { ...nextCards[id], hidden: !allHidden }
        }
        return {
          project: updateSpace(current.project, target.id, () => ({ cards: nextCards })),
          selection: allHidden
            ? state.selection
            : { ...state.selection, cards: [] }
        }
      })
    },

    /* ------------------------------ history ------------------------------ */

    beginHistory: (label) => {
      if (pending) return
      const state = get()
      if (!state.project) return
      pending = { snapshot: capture(state.project), label }
    },

    commitHistory: () => {
      const entry = pending
      pending = null
      const state = get()
      if (!entry || !state.project) return
      if (boardSignature(entry.snapshot) === boardSignature(capture(state.project))) return
      pushEntry(get, set, entry)
    },

    cancelHistory: () => {
      pending = null
    },

    undo: () => {
      pending = null
      const state = get()
      if (!state.project || !state.history.past.length) return
      const entry = state.history.past[state.history.past.length - 1]
      const current = capture(state.project)
      const cameras = new Map(state.project.spaces.map((space) => [space.id, space.camera]))
      const restoredSpaces = structuredClone(entry.snapshot.spaces).map((space) => ({
        ...space,
        camera: cameras.get(space.id) ?? space.camera
      }))
      const activeId = restoredSpaces.some((space) => space.id === entry.snapshot.activeSpaceId)
        ? entry.snapshot.activeSpaceId
        : restoredSpaces[0]?.id ?? state.activeSpaceId
      const project: Project = {
        ...state.project,
        spaces: restoredSpaces,
        categories: structuredClone(entry.snapshot.categories),
        activeSpaceId: activeId ?? state.project.activeSpaceId,
        updatedAt: Date.now()
      }
      set({
        project,
        activeSpaceId: activeId,
        selection: activeId ? pruneSelection(project, activeId, state.selection) : state.selection,
        editingCardId: null,
        history: {
          past: state.history.past.slice(0, -1),
          future: [{ label: entry.label, snapshot: current }, ...state.history.future].slice(
            0,
            Math.max(5, useSettings.getState().settings.data.maxUndo || 60)
          )
        }
      })
    },

    redo: () => {
      pending = null
      const state = get()
      if (!state.project || !state.history.future.length) return
      const entry = state.history.future[0]
      const current = capture(state.project)
      const cameras = new Map(state.project.spaces.map((space) => [space.id, space.camera]))
      const restoredSpaces = structuredClone(entry.snapshot.spaces).map((space) => ({
        ...space,
        camera: cameras.get(space.id) ?? space.camera
      }))
      const activeId = restoredSpaces.some((space) => space.id === entry.snapshot.activeSpaceId)
        ? entry.snapshot.activeSpaceId
        : restoredSpaces[0]?.id ?? state.activeSpaceId
      const project: Project = {
        ...state.project,
        spaces: restoredSpaces,
        categories: structuredClone(entry.snapshot.categories),
        activeSpaceId: activeId ?? state.project.activeSpaceId,
        updatedAt: Date.now()
      }
      set({
        project,
        activeSpaceId: activeId,
        selection: activeId ? pruneSelection(project, activeId, state.selection) : state.selection,
        editingCardId: null,
        history: {
          past: [...state.history.past, { label: entry.label, snapshot: current }].slice(
            -Math.max(5, useSettings.getState().settings.data.maxUndo || 60)
          ),
          future: state.history.future.slice(1)
        }
      })
    },

    clearHistory: () => {
      pending = null
      set({ history: { past: [], future: [] } })
    },

    /* ------------------------------ filtering ---------------------------- */

    setFilter: (patch) => {
      set((state) => ({ filter: { ...state.filter, ...patch, active: patch.active ?? state.filter.active } }))
    },

    clearFilter: () => set({ filter: { active: false, query: '', categories: [], kinds: [] } }),

    setShowHidden: (value) => set({ showHidden: value }),

    setSaveState: (saveState, savedAt, error = null) =>
      set({
        saveState,
        lastSavedAt: savedAt ?? get().lastSavedAt,
        saveError: error
      }),

    setLoading: (value) => set({ isLoading: value })
  }
})

/* --------------------------------- helpers ------------------------------- */

export function useActiveSpace(): Space | null {
  return useBoard((state) => {
    if (!state.project) return null
    return state.project.spaces.find((s) => s.id === state.activeSpaceId) ?? state.project.spaces[0] ?? null
  })
}

export function selectionCount(selection: Selection): number {
  return selection.cards.length + selection.threads.length + selection.strokes.length + selection.groups.length
}

export function getSelectionBounds(state: BoardState): ReturnType<typeof unionRects> {
  const space = activeSpace(state)
  if (!space) return null
  const rects = [
    ...state.selection.cards.map((id) => space.cards[id]).filter(Boolean).map(cardRect),
    ...state.selection.strokes.map((id) => space.strokes[id]).filter(Boolean).map(strokeBBox)
  ]
  return unionRects(rects)
}

export function selectionGroupBounds(state: BoardState): ReturnType<typeof unionRects> {
  const space = activeSpace(state)
  if (!space) return null
  return unionRects(
    state.selection.groups
      .map((id) => space.groups[id])
      .filter(Boolean)
      .map((group) => groupBounds(group, space.cards))
  )
}

export { activeSpace }
