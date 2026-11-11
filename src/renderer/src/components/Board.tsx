import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Camera, Point, Rect, Stroke } from '@shared/types'
import { useBoard, useActiveSpace, cardMatchesFilter } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { contentBounds, expandRect, nearestPin, pinNormal, pinPoint, rectContains, rectsIntersect, groupMemberCards, groupBounds } from '@/core/geometry'
import {
  fitBounds,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAround
} from '@/core/camera'
import { threadGeometry } from '@/core/geometry'
import { arrowHeadPathD, strokeSvgPathD } from '@/core/strokes'
import { uid } from '@/core/id'
import { pickAssets, importDroppedFiles } from '@/services/storage'
import { onBoardEvent, BOARD_EVENTS, type CreateEventDetail } from '@/services/events'
import { useT } from '@/i18n'
import GridCanvas from './GridCanvas'
import BoardDefs from './BoardDefs'
import StrokesLayer from './StrokesLayer'
import GroupLayer from './GroupLayer'
import ThreadsLayer from './ThreadsLayer'
import CardView from './CardView'
import LodLabels from './LodLabels'
import Minimap from './Minimap'
import ZoomBar from './ZoomBar'
import ToolOptionsBar from './ToolOptionsBar'
import { t } from '@/i18n'

const EMPTY_PINS = new Map<string, string[]>()

type Gesture =
  | { type: 'pan'; startScreen: Point; startCamera: Camera }
  | { type: 'marquee'; startScreen: Point; startWorld: Point; additive: boolean; moved: boolean }
  | {
      type: 'cards'
      ids: string[]
      startScreen: Point
      startWorld: Point
      lastWorld: Point
      moved: boolean
    }
  | {
      type: 'group'
      id: string
      ids: string[]
      startScreen: Point
      startWorld: Point
      lastWorld: Point
      moved: boolean
    }
  | {
      type: 'strokes'
      ids: string[]
      startScreen: Point
      startWorld: Point
      lastWorld: Point
      moved: boolean
    }
  | {
      type: 'resize'
      id: string
      handle: string
      startWorld: Point
      startRect: Rect
    }
  | { type: 'thread'; fromCardId: string; fromPinId: string; fromPoint: Point; pointerId: number }
  | { type: 'draw'; tool: Stroke['tool']; startWorld: Point; points: number[]; pointerId: number }
  | { type: 'erase'; lastWorld: Point; radius: number }

interface ConnectState {
  fromCardId: string
  fromPinId: string
  point: Point
  targetCardId: string | null
  targetPinId: string | null
  screen: Point
}

interface StrokeStyle {
  color: string
  width: number
  opacity: number
  lineStyle: 'solid' | 'dashed' | 'dotted'
  smoothing: number
  fill?: string
  fillOpacity?: number
  cornerRadius?: number
}

function buildStroke(tool: Stroke['tool'], points: number[], style: StrokeStyle): Stroke {
  const isShape = tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'
  return {
    id: uid('str'),
    tool,
    color: style.color,
    width: isShape ? Math.max(1, style.width) : style.width,
    opacity: style.opacity,
    points,
    seed: Math.random() * 1000,
    lineStyle: style.lineStyle,
    smoothing: style.smoothing,
    fill: isShape ? style.fill : undefined,
    fillOpacity: isShape ? style.fillOpacity : undefined,
    cornerRadius: isShape ? style.cornerRadius : undefined,
    createdAt: Date.now()
  }
}

function pinchDistance(points: number[]): number {
  if (points.length < 4) return 0
  return Math.hypot(points[0] - points[points.length - 2], points[1] - points[points.length - 1])
}

export default function Board(): React.JSX.Element | null {
  const space = useActiveSpace()
  const project = useBoard((state) => state.project)
  const selection = useBoard((state) => state.selection)
  const editingCardId = useBoard((state) => state.editingCardId)
  const tool = useBoard((state) => state.tool)
  const mode = useBoard((state) => state.mode)
  const filter = useBoard((state) => state.filter)
  const showHidden = useBoard((state) => state.showHidden)
  const settings = useSettings((state) => state.settings)
  const openContextMenu = useUi((state) => state.openContextMenu)
  const toast = useUi((state) => state.toast)
  const t = useT()

  const boardRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 1200, h: 800 })
  const viewportRef = useRef(viewport)
  const gestureRef = useRef<Gesture | null>(null)
  const connectRef = useRef<ConnectState | null>(null)
  const [connectState, setConnectState] = useState<ConnectState | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [drawPreview, setDrawPreview] = useState<Stroke | null>(null)
  const [eraserScreen, setEraserScreen] = useState<{
    point: Point
    size: number
    shape: 'circle' | 'square'
  } | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const lastWorldRef = useRef<Point>({ x: 0, y: 0 })
  const dragCounterRef = useRef(0)
  const previewRafRef = useRef<number | null>(null)

  const camera = space?.camera ?? { x: 0, y: 0, zoom: 1 }
  const zoom = camera.zoom
  const lodEnabled = mode === 'overview' || zoom < settings.board.lodThreshold
  const lod = Boolean(space) && lodEnabled

  const strokeStyleFor = (strokeTool: Stroke['tool']): StrokeStyle => {
    if (strokeTool === 'line' || strokeTool === 'arrow' || strokeTool === 'rect' || strokeTool === 'ellipse') {
      const shape = settings.tools.shape
      return {
        color: shape.stroke,
        width: shape.strokeWidth,
        opacity: shape.opacity,
        lineStyle: shape.lineStyle,
        smoothing: 0,
        fill: strokeTool === 'line' || strokeTool === 'arrow' ? undefined : shape.fill,
        fillOpacity: shape.fillOpacity,
        cornerRadius: shape.radius
      }
    }
    const brush =
      strokeTool === 'pencil'
        ? settings.tools.pencil
        : strokeTool === 'marker'
          ? settings.tools.marker
          : settings.tools.chalk
    return {
      color: brush.color,
      width: brush.width,
      opacity: brush.opacity,
      lineStyle: brush.lineStyle,
      smoothing: brush.smoothing
    }
  }
  const visibleRect = useMemo(
    () =>
      visibleWorldRect(
        camera,
        viewport,
        settings.performance.cullOffscreen ? settings.performance.cullMargin / Math.max(zoom, 0.05) : 6000
      ),
    [camera, viewport, settings.performance.cullOffscreen, settings.performance.cullMargin, zoom]
  )

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const next = {
        w: Math.max(1, Math.round(entry.contentRect.width)),
        h: Math.max(1, Math.round(entry.contentRect.height))
      }
      viewportRef.current = next
      setViewport(next)
    })
    observer.observe(el)
    const measure = (): void => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const next = { w: Math.round(rect.width), h: Math.round(rect.height) }
      if (next.w !== viewportRef.current.w || next.h !== viewportRef.current.h) {
        viewportRef.current = next
        setViewport(next)
      }
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const timer = window.setTimeout(measure, 120)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
    }
  }, [settings.ui.showToolRail])

  /* --------------------------- wheel, space key -------------------------- */

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const handleWheel = (event: WheelEvent): void => {
      if (useUi.getState().modal || useUi.getState().confirmDialog || useUi.getState().lightbox) return
      event.preventDefault()
      const state = useBoard.getState()
      const active = state.project?.spaces.find((item) => item.id === state.activeSpaceId)
      if (!active) return
      const current = useSettings.getState().settings
      const rect = el.getBoundingClientRect()
      const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const view = viewportRef.current
      const shouldZoom = current.interaction.wheelModifier === 'none' ? !event.shiftKey : event.ctrlKey
      if (shouldZoom) {
        const sensitivity = current.interaction.zoomSensitivity
        const direction = current.interaction.invertZoom ? -1 : 1
        const factor = Math.exp(-event.deltaY * 0.0015 * sensitivity * direction)
        state.setCamera(active.id, zoomAround(active.camera, view, screen, factor))
      } else {
        const dx = (event.deltaX + (event.shiftKey ? event.deltaY : 0)) / active.camera.zoom
        const dy = (event.shiftKey ? 0 : event.deltaY) / active.camera.zoom
        state.setCamera(active.id, {
          x: active.camera.x + dx * current.interaction.scrollSpeed,
          y: active.camera.y + dy * current.interaction.scrollSpeed
        })
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const isTyping = (): boolean => {
      const active = document.activeElement
      return active instanceof HTMLElement && Boolean(active.closest('input,textarea,select,[contenteditable="true"]'))
    }
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isTyping() || useUi.getState().modal) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const blur = (): void => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /* ------------------------------ helpers ------------------------------- */

  const screenFromEvent = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = boardRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }, [])

  const currentSpace = useCallback(() => {
    const state = useBoard.getState()
    return state.project?.spaces.find((item) => item.id === state.activeSpaceId) ?? state.project?.spaces[0] ?? null
  }, [])

  const worldFromEvent = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const active = currentSpace()
      const screen = screenFromEvent(event)
      return screenToWorld(screen, active?.camera ?? camera, viewportRef.current)
    },
    [camera, currentSpace, screenFromEvent]
  )

  const centerWorld = useCallback((): Point => {
    const active = currentSpace()
    return screenToWorld(
      { x: viewportRef.current.w / 2, y: viewportRef.current.h / 2 },
      active?.camera ?? camera,
      viewportRef.current
    )
  }, [camera, currentSpace])

  const fitToContent = useCallback(() => {
    const state = useBoard.getState()
    const active = state.project?.spaces.find((item) => item.id === state.activeSpaceId)
    if (!active) return
    const bounds = contentBounds(active, { includeStrokes: true }) ?? contentBounds(active)
    state.setCamera(active.id, fitBounds(bounds, viewportRef.current, 120, 1))
  }, [])

  const centerContent = useCallback(() => {
    const state = useBoard.getState()
    const active = state.project?.spaces.find((item) => item.id === state.activeSpaceId)
    if (!active) return
    const bounds = contentBounds(active, { includeStrokes: true })
    if (!bounds) {
      state.setCamera(active.id, { x: 0, y: 0 })
      return
    }
    state.setCamera(active.id, {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2
    })
  }, [])

  const openAttach = useCallback(async () => {
    const state = useBoard.getState()
    const active = state.project?.spaces.find((item) => item.id === state.activeSpaceId)
    if (!active || !state.project) return
    try {
      const assets = await pickAssets(state.project.id)
      if (!assets.length) return
      const at = screenToWorld(
        { x: viewportRef.current.w / 2, y: viewportRef.current.h / 2 },
        active.camera,
        viewportRef.current
      )
      useBoard.getState().createCardsFromAssets(assets, at)
      toast(
        t(assets.length === 1 ? 'Added {count} material' : 'Added {count} materials', { count: assets.length }),
        'success',
        1700
      )
    } catch (error) {
      toast(t('Could not add material: {message}', { message: (error as Error).message }), 'error', 4200)
    }
  }, [toast, t])

  /* ----------------------------- board events --------------------------- */

  useEffect(() => {
    const disposers = [
      onBoardEvent(BOARD_EVENTS.attach, () => void openAttach()),
      onBoardEvent<CreateEventDetail>(BOARD_EVENTS.create, (detail) => {
        if (!detail) return
        const at = pointerInside ? lastWorldRef.current : centerWorld()
        const card = useBoard.getState().createCard(detail.kind, at)
        if (card && detail.kind !== 'note' && detail.kind !== 'text') {
          // Media cards are created through the attach flow; this fallback still works.
        }
      }),
      onBoardEvent(BOARD_EVENTS.fit, fitToContent),
      onBoardEvent(BOARD_EVENTS.center, centerContent),
      onBoardEvent(BOARD_EVENTS.escape, () => {
        gestureRef.current = null
        connectRef.current = null
        setConnectState(null)
        setDrawPreview(null)
        setMarquee(null)
        setPanning(false)
        useUi.getState().setBoardInteracting(false)
      }),
      onBoardEvent(BOARD_EVENTS.paste, () => {
        const at = pointerInside ? lastWorldRef.current : centerWorld()
        const count = useBoard.getState().pasteClipboard(at)
        if (count)
          toast(
            t(count === 1 ? 'Pasted {count} object' : 'Pasted {count} objects', { count }),
            'success',
            1400
          )
      })
    ]
    return () => disposers.forEach((dispose) => dispose())
  }, [centerContent, centerWorld, fitToContent, openAttach, pointerInside, toast, t])

  /* ------------------------------- render data -------------------------- */

  const sortedCards = useMemo(
    () => Object.values(space?.cards ?? {}).sort((a, b) => a.z - b.z),
    [space?.cards]
  )

  const collapsedCards = useMemo(() => {
    const set = new Set<string>()
    if (!space) return set
    for (const group of Object.values(space.groups)) {
      if (!group.collapsed) continue
      for (const card of Object.values(space.cards)) {
        if (card.groupId === group.id) set.add(card.id)
      }
    }
    return set
  }, [space?.groups, space?.cards])

  const categories = project?.categories ?? []
  const visibleCards = useMemo(() => {
    if (!space) return []
    const margin = settings.performance.cullOffscreen ? visibleRect : null
    const out = sortedCards.filter((card) => {
      if (card.hidden && !showHidden) return false
      if (collapsedCards.has(card.id)) return false
      if (filter.active && !cardMatchesFilter(card, filter, categories)) return false
      if (margin && !rectsIntersect({ x: card.x, y: card.y, w: card.w, h: card.h }, margin)) return false
      return true
    })
    const cap = Math.max(50, settings.performance.maxVisibleCards || 900)
    let limited = out
    if (out.length > cap) {
      const selected = new Set(selection.cards)
      limited = out.slice(-cap)
      const missing = out.filter((card) => selected.has(card.id) && !limited.includes(card))
      limited = [...missing, ...limited]
    }
    return limited
  }, [
    space,
    sortedCards,
    showHidden,
    collapsedCards,
    filter,
    categories,
    visibleRect,
    settings.performance.cullOffscreen,
    settings.performance.maxVisibleCards,
    selection.cards
  ])

  const visibleCardIds = useMemo(() => new Set(visibleCards.map((card) => card.id)), [visibleCards])

  const visibleGroupIds = useMemo(() => {
    if (!space) return new Set<string>()
    const set = new Set<string>()
    const selectedGroups = new Set(selection.groups)
    for (const group of Object.values(space.groups)) {
      const members = groupMemberCards(group.id, space.cards)
      if (!members.length) continue
      if (selectedGroups.has(group.id)) {
        set.add(group.id)
        continue
      }
      const bounds = groupBounds(group, space.cards)
      if (settings.performance.cullOffscreen && !rectsIntersect(bounds, visibleRect)) continue
      const hasVisibleMember = members.some((card) => {
        if (card.hidden && !showHidden) return false
        if (filter.active && !cardMatchesFilter(card, filter, categories)) return false
        return true
      })
      if (hasVisibleMember) set.add(group.id)
    }
    return set
  }, [
    space?.groups,
    space?.cards,
    selection.groups,
    settings.performance.cullOffscreen,
    visibleRect,
    showHidden,
    filter,
    categories
  ])

  const pinColors = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>()
    if (!space) return map
    const add = (cardId: string, pinId: string, color: string): void => {
      const cardMap = map.get(cardId) ?? new Map<string, string[]>()
      const list = cardMap.get(pinId) ?? []
      list.push(color)
      cardMap.set(pinId, list)
      map.set(cardId, cardMap)
    }
    for (const thread of Object.values(space.threads)) {
      if (thread.hidden) continue
      add(thread.from.cardId, thread.from.pinId, thread.color)
      add(thread.to.cardId, thread.to.pinId, thread.color)
    }
    return map
  }, [space?.threads])

  const focusIds = useMemo(() => {
    if (!space || mode !== 'focus') return null
    const roots = new Set(selection.cards)
    for (const threadId of selection.threads) {
      const thread = space.threads[threadId]
      if (thread) {
        roots.add(thread.from.cardId)
        roots.add(thread.to.cardId)
      }
    }
    if (!roots.size) return null
    const depth = Math.max(1, Math.min(4, settings.interaction.focusDepth))
    const found = new Set(roots)
    let frontier = new Set(roots)
    for (let level = 0; level < depth; level++) {
      const next = new Set<string>()
      for (const thread of Object.values(space.threads)) {
        if (thread.hidden) continue
        if (frontier.has(thread.from.cardId) && !found.has(thread.to.cardId)) next.add(thread.to.cardId)
        if (frontier.has(thread.to.cardId) && !found.has(thread.from.cardId)) next.add(thread.from.cardId)
      }
      for (const id of next) found.add(id)
      frontier = next
      if (!next.size) break
    }
    return found
  }, [mode, selection.cards, selection.threads, settings.interaction.focusDepth, space])

  const selectedSet = useMemo(() => new Set(selection.cards), [selection.cards])

  const filterMatchCount = useMemo(() => {
    if (!space || !filter.active) return 0
    return Object.values(space.cards).filter(
      (card) => !card.hidden || showHidden ? cardMatchesFilter(card, filter, categories) : false
    ).length
  }, [space?.cards, filter, categories, showHidden])

  const marqueeScreen = useMemo(() => {
    if (!marquee) return null
    const p = worldToScreen({ x: marquee.x, y: marquee.y }, camera, viewport)
    return { x: p.x, y: p.y, w: marquee.w * zoom, h: marquee.h * zoom }
  }, [marquee, camera, viewport, zoom])

  const previewGeometry = useMemo(() => {
    if (!connectState || !space) return null
    const fromCard = space.cards[connectState.fromCardId]
    if (!fromCard) return null
    const from = pinPoint(fromCard, connectState.fromPinId)
    return threadGeometry(from, pinNormal(fromCard, connectState.fromPinId), connectState.point, { x: 0, y: 1 }, {
      curve: settings.tools.thread.curve,
      reduceOverlap: false,
      connectionType: settings.tools.thread.connectionType
    })
  }, [connectState, space])

  const connectTargetCard =
    connectState?.targetCardId && space ? space.cards[connectState.targetCardId] : null

  /* ------------------------------- gestures ----------------------------- */

  const releasePointer = useCallback((pointerId?: number): void => {
    const el = boardRef.current
    if (!el) return
    try {
      if (pointerId !== undefined && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const snapCards = useCallback((ids: string[]): void => {
    const current = useSettings.getState().settings
    if (!current.interaction.snapToGrid) return
    const state = useBoard.getState()
    const active = state.project?.spaces.find((item) => item.id === state.activeSpaceId)
    if (!active) return
    const size = Math.max(2, current.interaction.snapSize)
    for (const id of ids) {
      const card = active.cards[id]
      if (!card) continue
      const x = Math.round(card.x / size) * size
      const y = Math.round(card.y / size) * size
      if (x !== card.x || y !== card.y) state.updateCard(id, { x, y })
    }
  }, [])

  const beginPan = (event: React.PointerEvent): void => {
    if (!space) return
    event.preventDefault()
    useUi.getState().setBoardInteracting(true)
    const screen = screenFromEvent(event)
    gestureRef.current = {
      type: 'pan',
      startScreen: screen,
      startCamera: { ...space.camera }
    }
    setPanning(true)
    boardRef.current?.setPointerCapture(event.pointerId)
  }

  const startDrawing = (event: React.PointerEvent, point: Point): void => {
    if (!space) return
    useUi.getState().setBoardInteracting(true)
    if (tool === 'eraser') {
      const eraser = settings.tools.eraser
      const hardness = Math.max(0, Math.min(1, eraser.hardness))
      const radius = (eraser.size / 2 / zoom) * (0.45 + 0.55 * hardness)
      useBoard.getState().beginHistory('Erase')
      gestureRef.current = { type: 'erase', lastWorld: point, radius }
      useBoard.getState().eraseStrokesAt(point, radius, eraser.shape)
      setEraserScreen({ point: screenFromEvent(event), size: eraser.size, shape: eraser.shape })
      boardRef.current?.setPointerCapture(event.pointerId)
      return
    }
    const strokeTool =
      tool === 'chalk' || tool === 'marker' || tool === 'pencil' || tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'
        ? tool
        : 'chalk'
    gestureRef.current = {
      type: 'draw',
      tool: strokeTool,
      startWorld: point,
      points: [point.x, point.y],
      pointerId: event.pointerId
    }
    const preview = buildStroke(strokeTool, [point.x, point.y], strokeStyleFor(strokeTool))
    setDrawPreview(preview)
    useBoard.getState().setEditingCard(null)
    boardRef.current?.setPointerCapture(event.pointerId)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const targetEl = event.target as HTMLElement
    if (targetEl.closest('.zoom-bar, .minimap, .board-hints, .empty-board, .filter-empty, .drop-overlay, .tool-options')) return
    if (!space) return
    const point = worldFromEvent(event)
    lastWorldRef.current = point
    setPointerInside(true)
    useUi.getState().closeContextMenu()

    if (event.button === 2) return
    if (event.button !== 0 && event.button !== 1) return

    const panRequested =
      (event.button === 1 && settings.interaction.middleButtonPan) ||
      tool === 'hand' ||
      (spaceHeld && settings.interaction.spaceToPan)
    if (panRequested) {
      beginPan(event)
      return
    }
    if (event.button !== 0) return

    if (tool === 'note' || tool === 'text') {
      event.preventDefault()
      const card = useBoard.getState().createCard(tool, point, {
        color: tool === 'note' ? settings.tools.note.color : undefined
      })
      if (card) useBoard.getState().setEditingCard(card.id)
      return
    }

    if (event.button === 0 && (tool === 'chalk' || tool === 'marker' || tool === 'pencil' || tool === 'eraser' || tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse')) {
      event.preventDefault()
      startDrawing(event, point)
      return
    }

    const pinEl = targetEl.closest('[data-pin]') as HTMLElement | null
    const cardEl = targetEl.closest('[data-card-id]') as HTMLElement | null
    const resizeEl = targetEl.closest('[data-resize]') as HTMLElement | null
    const threadEl = targetEl.closest('[data-thread-id]') as HTMLElement | null
    const strokeEl = targetEl.closest('[data-stroke-id]') as HTMLElement | null
    const groupEl = targetEl.closest('[data-group-id]') as HTMLElement | null

    if (pinEl && cardEl && (tool === 'select' || tool === 'thread')) {
      event.preventDefault()
      event.stopPropagation()
      const fromCardId = cardEl.dataset.cardId as string
      const fromPinId = pinEl.dataset.pin as string
      const card = space.cards[fromCardId]
      if (!card) return
      useBoard.getState().setEditingCard(null)
      useUi.getState().setBoardInteracting(true)
      const state: ConnectState = {
        fromCardId,
        fromPinId,
        point,
        targetCardId: null,
        targetPinId: null,
        screen: screenFromEvent(event)
      }
      connectRef.current = state
      setConnectState(state)
      gestureRef.current = {
        type: 'thread',
        fromCardId,
        fromPinId,
        fromPoint: pinPoint(card, fromPinId),
        pointerId: event.pointerId
      }
      boardRef.current?.setPointerCapture(event.pointerId)
      return
    }

    if (resizeEl && cardEl) {
      const card = space.cards[cardEl.dataset.cardId as string]
      if (!card || card.locked) return
      event.preventDefault()
      event.stopPropagation()
      useBoard.getState().beginHistory('Resize card')
      useUi.getState().setBoardInteracting(true)
      gestureRef.current = {
        type: 'resize',
        id: card.id,
        handle: resizeEl.dataset.handle as string,
        startWorld: point,
        startRect: { x: card.x, y: card.y, w: card.w, h: card.h }
      }
      boardRef.current?.setPointerCapture(event.pointerId)
      return
    }

    if (threadEl) {
      event.preventDefault()
      const id = threadEl.dataset.threadId as string
      useBoard.getState().selectThread(id, event.shiftKey)
      useBoard.getState().setEditingCard(null)
      return
    }

    if (strokeEl && space.strokes[strokeEl.dataset.strokeId as string]) {
      event.preventDefault()
      const id = strokeEl.dataset.strokeId as string
      const stroke = space.strokes[id]
      useBoard.getState().selectStroke(id, event.shiftKey)
      useBoard.getState().setEditingCard(null)
      if (stroke.locked || event.shiftKey) return
      const ids = useBoard.getState().selection.strokes
      useBoard.getState().beginHistory('Move drawing')
      useUi.getState().setBoardInteracting(true)
      gestureRef.current = {
        type: 'strokes',
        ids,
        startScreen: screenFromEvent(event),
        startWorld: point,
        lastWorld: point,
        moved: false
      }
      boardRef.current?.setPointerCapture(event.pointerId)
      return
    }

    if (groupEl) {
      if (targetEl.closest('[data-interactive]') || targetEl.closest('button')) return
      const group = space.groups[groupEl.dataset.groupId as string]
      if (!group) return
      event.preventDefault()
      if (!useBoard.getState().selection.groups.includes(group.id)) {
        useBoard.getState().selectGroup(group.id)
      }
      useBoard.getState().setEditingCard(null)
      if (group.locked) return
      const ids = groupMemberCards(group.id, space.cards).map((card) => card.id)
      useBoard.getState().beginHistory('Move group')
      useUi.getState().setBoardInteracting(true)
      gestureRef.current = {
        type: 'group',
        id: group.id,
        ids,
        startScreen: screenFromEvent(event),
        startWorld: point,
        lastWorld: point,
        moved: false
      }
      boardRef.current?.setPointerCapture(event.pointerId)
      return
    }

    if (cardEl) {
      const card = space.cards[cardEl.dataset.cardId as string]
      if (!card) return
      if (editingCardId === card.id) return

      if (targetEl.closest('[data-interactive]') || targetEl.closest('button, video, audio, iframe, input, textarea, select')) {
        return
      }

      if (event.altKey && tool === 'select') {
        event.preventDefault()
        const nx = Math.min(1, Math.max(0, (point.x - card.x) / card.w))
        const ny = Math.min(1, Math.max(0, (point.y - card.y) / card.h))
        const pin = useBoard.getState().addPin(card.id, nx, ny)
        if (pin) {
          useBoard.getState().selectCard(card.id)
          toast(t('Pin added. Drag from it to tie a thread.'), 'success', 2400)
        }
        return
      }

      if (editingCardId) {
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLElement && activeElement.closest('[contenteditable="true"]')) {
          activeElement.blur()
        }
      }
      useBoard.getState().setEditingCard(null)
      if (event.shiftKey) {
        useBoard.getState().selectCard(card.id, true)
        return
      }
      if (!useBoard.getState().selection.cards.includes(card.id)) {
        useBoard.getState().selectCard(card.id)
      }
      const group = card.groupId ? space.groups[card.groupId] : undefined
      if (card.locked || group?.locked) return
      const ids = useBoard.getState().selection.cards
      useBoard.getState().beginHistory(ids.length > 1 ? 'Move cards' : 'Move card')
      useUi.getState().setBoardInteracting(true)
      gestureRef.current = {
        type: 'cards',
        ids,
        startScreen: screenFromEvent(event),
        startWorld: point,
        lastWorld: point,
        moved: false
      }
      boardRef.current?.setPointerCapture(event.pointerId)
      return
    }

    event.preventDefault()
    if (event.button === 0) {
      useBoard.getState().setEditingCard(null)
      const additive = event.shiftKey
      if (!additive) {
        useBoard.getState().clearSelection()
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLElement) activeElement.blur()
      }
      useUi.getState().setBoardInteracting(true)
      gestureRef.current = {
        type: 'marquee',
        startScreen: screenFromEvent(event),
        startWorld: point,
        additive,
        moved: false
      }
      boardRef.current?.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const point = worldFromEvent(event)
    lastWorldRef.current = point
    setPointerInside(true)
    if (tool === 'eraser') {
      const eraser = settings.tools.eraser
      setEraserScreen({ point: screenFromEvent(event), size: eraser.size, shape: eraser.shape })
    }
    const gesture = gestureRef.current
    if (!gesture) return
    const screen = screenFromEvent(event)

    if (gesture.type === 'pan') {
      const dx = screen.x - gesture.startScreen.x
      const dy = screen.y - gesture.startScreen.y
      if (space) {
        useBoard.getState().setCamera(space.id, {
          x: gesture.startCamera.x - dx / gesture.startCamera.zoom,
          y: gesture.startCamera.y - dy / gesture.startCamera.zoom
        })
      }
      return
    }

    if (gesture.type === 'marquee') {
      if (!gesture.moved) {
        if (Math.hypot(screen.x - gesture.startScreen.x, screen.y - gesture.startScreen.y) < 3) return
        gesture.moved = true
      }
      setMarquee({
        x: Math.min(gesture.startWorld.x, point.x),
        y: Math.min(gesture.startWorld.y, point.y),
        w: Math.abs(point.x - gesture.startWorld.x),
        h: Math.abs(point.y - gesture.startWorld.y)
      })
      return
    }

    if (gesture.type === 'cards' || gesture.type === 'group' || gesture.type === 'strokes') {
      if (!gesture.moved) {
        if (
          Math.hypot(screen.x - gesture.startScreen.x, screen.y - gesture.startScreen.y) <
          Math.max(2, settings.interaction.dragThreshold)
        ) {
          return
        }
        gesture.moved = true
        const dx = point.x - gesture.startWorld.x
        const dy = point.y - gesture.startWorld.y
        if (gesture.type === 'cards') useBoard.getState().translateCards(gesture.ids, dx, dy)
        else if (gesture.type === 'group') useBoard.getState().translateCards(gesture.ids, dx, dy)
        else useBoard.getState().translateStrokes(gesture.ids, dx, dy)
        gesture.lastWorld = point
      } else {
        const dx = point.x - gesture.lastWorld.x
        const dy = point.y - gesture.lastWorld.y
        if (gesture.type === 'cards') useBoard.getState().translateCards(gesture.ids, dx, dy)
        else if (gesture.type === 'group') useBoard.getState().translateCards(gesture.ids, dx, dy)
        else useBoard.getState().translateStrokes(gesture.ids, dx, dy)
        gesture.lastWorld = point
      }
      return
    }

    if (gesture.type === 'resize') {
      const minW = 130
      const minH = 90
      const dx = point.x - gesture.startWorld.x
      const dy = point.y - gesture.startWorld.y
      const start = gesture.startRect
      let x = start.x
      let y = start.y
      let w = start.w
      let h = start.h
      if (gesture.handle.includes('e')) w = Math.max(minW, start.w + dx)
      if (gesture.handle.includes('s')) h = Math.max(minH, start.h + dy)
      if (gesture.handle.includes('w')) {
        w = Math.max(minW, start.w - dx)
        x = start.x + (start.w - w)
      }
      if (gesture.handle.includes('n')) {
        h = Math.max(minH, start.h - dy)
        y = start.y + (start.h - h)
      }
      useBoard.getState().updateCard(gesture.id, { x, y, w, h })
      return
    }

    if (gesture.type === 'thread') {
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const pinEl = element?.closest('[data-pin]') as HTMLElement | null
      const cardEl = element?.closest('[data-card-id]') as HTMLElement | null
      let targetCardId: string | null = null
      let targetPinId: string | null = null
      if (cardEl) {
        const id = cardEl.dataset.cardId as string
        if (id !== gesture.fromCardId) {
          targetCardId = id
          const card = space?.cards[id]
          if (card) {
            targetPinId =
              pinEl?.dataset.pin ??
              (settings.interaction.connectionTarget === 'nearest' ? nearestPin(card, point) : null)
          }
        }
      }
      const next: ConnectState = {
        fromCardId: gesture.fromCardId,
        fromPinId: gesture.fromPinId,
        point,
        targetCardId,
        targetPinId,
        screen
      }
      connectRef.current = next
      setConnectState(next)
      return
    }

    if (gesture.type === 'draw') {
      if (gesture.tool === 'line' || gesture.tool === 'arrow' || gesture.tool === 'rect' || gesture.tool === 'ellipse') {
        gesture.points = [gesture.startWorld.x, gesture.startWorld.y, point.x, point.y]
      } else {
        const lastX = gesture.points[gesture.points.length - 2]
        const lastY = gesture.points[gesture.points.length - 1]
        if (Math.hypot(point.x - lastX, point.y - lastY) >= 1.2 / Math.max(zoom, 0.1)) {
          gesture.points.push(point.x, point.y)
        }
      }
      if (previewRafRef.current === null) {
        previewRafRef.current = requestAnimationFrame(() => {
          previewRafRef.current = null
          const current = gestureRef.current
          if (current?.type === 'draw') {
            setDrawPreview(
              buildStroke(current.tool, [...current.points], strokeStyleFor(current.tool))
            )
          }
        })
      }
      return
    }

    if (gesture.type === 'erase') {
      const eraser = settings.tools.eraser
      const hardness = Math.max(0, Math.min(1, eraser.hardness))
      const radius = (eraser.size / 2 / zoom) * (0.45 + 0.55 * hardness)
      if (Math.hypot(point.x - gesture.lastWorld.x, point.y - gesture.lastWorld.y) > 2 / zoom) {
        useBoard.getState().eraseStrokesAt(point, radius, eraser.shape)
        gesture.lastWorld = point
      }
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    useUi.getState().setBoardInteracting(false)
    const gesture = gestureRef.current
    if (!gesture) {
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'pan') {
      gestureRef.current = null
      setPanning(false)
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'marquee') {
      const endWorld = worldFromEvent(event)
      const dragRect: Rect = {
        x: Math.min(gesture.startWorld.x, endWorld.x),
        y: Math.min(gesture.startWorld.y, endWorld.y),
        w: Math.abs(endWorld.x - gesture.startWorld.x),
        h: Math.abs(endWorld.y - gesture.startWorld.y)
      }
      if (gesture.moved && dragRect.w > 1 && dragRect.h > 1 && space) {
        const modeContains = settings.interaction.marqueeMode === 'contain'
        const cards = Object.values(space.cards)
          .filter((card) => {
            if (card.hidden && !showHidden) return false
            if (card.groupId && space.groups[card.groupId]?.collapsed) return false
            if (filter.active && !cardMatchesFilter(card, filter, categories)) return false
            const rect = { x: card.x, y: card.y, w: card.w, h: card.h }
            return modeContains ? rectContains(dragRect, rect) : rectsIntersect(dragRect, rect)
          })
          .map((card) => card.id)
        const strokes = Object.values(space.strokes)
          .filter((stroke) => {
            if (stroke.hidden && !showHidden) return false
            const b = strokeBBoxSafe(stroke)
            return modeContains ? rectContains(dragRect, b) : rectsIntersect(dragRect, b)
          })
          .map((stroke) => stroke.id)
        const current = useBoard.getState().selection
        useBoard.getState().setSelection({
          cards: gesture.additive ? Array.from(new Set([...current.cards, ...cards])) : cards,
          strokes: gesture.additive ? Array.from(new Set([...current.strokes, ...strokes])) : strokes,
          threads: gesture.additive ? current.threads : [],
          groups: gesture.additive ? current.groups : []
        })
      }
      setMarquee(null)
      gestureRef.current = null
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'cards' || gesture.type === 'group' || gesture.type === 'strokes') {
      if (gesture.moved) {
        if (gesture.type !== 'strokes') snapCards(gesture.ids)
        useBoard.getState().commitHistory()
      } else {
        useBoard.getState().cancelHistory()
      }
      gestureRef.current = null
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'resize') {
      if (settings.interaction.snapToGrid) {
        const active = currentSpace()
        const card = active?.cards[gesture.id]
        if (card) {
          const size = Math.max(2, settings.interaction.snapSize)
          useBoard.getState().updateCard(gesture.id, {
            x: Math.round(card.x / size) * size,
            y: Math.round(card.y / size) * size,
            w: Math.round(card.w / size) * size,
            h: Math.round(card.h / size) * size
          })
        }
      }
      useBoard.getState().commitHistory()
      gestureRef.current = null
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'thread') {
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const cardEl = element?.closest('[data-card-id]') as HTMLElement | null
      const pinEl = element?.closest('[data-pin]') as HTMLElement | null
      const point = worldFromEvent(event)
      if (cardEl && space) {
        const targetCardId = cardEl.dataset.cardId as string
        if (targetCardId !== gesture.fromCardId) {
          const card = space.cards[targetCardId]
          if (card) {
            const targetPin =
              pinEl?.dataset.pin ??
              (settings.interaction.connectionTarget === 'nearest' ? nearestPin(card, point) : null)
            if (targetPin) {
              useBoard.getState().createThread(
                { cardId: gesture.fromCardId, pinId: gesture.fromPinId },
                { cardId: targetCardId, pinId: targetPin }
              )
            }
          }
        }
      }
      connectRef.current = null
      setConnectState(null)
      gestureRef.current = null
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'draw') {
      const points = [...gesture.points]
      const isShape = gesture.tool === 'line' || gesture.tool === 'arrow' || gesture.tool === 'rect' || gesture.tool === 'ellipse'
      if (isShape) {
        if (pinchDistance(points) > 4) {
          useBoard.getState().addStroke(
            buildStroke(gesture.tool, points, strokeStyleFor(gesture.tool)),
            true
          )
        }
      } else if (points.length >= 2) {
        if (points.length < 4) {
          points.push(points[0] + 0.6, points[1] + 0.6)
        }
        useBoard.getState().addStroke(
          buildStroke(gesture.tool, points, strokeStyleFor(gesture.tool)),
          true
        )
      }
      setDrawPreview(null)
      gestureRef.current = null
      releasePointer(event.pointerId)
      return
    }

    if (gesture.type === 'erase') {
      useBoard.getState().commitHistory()
      gestureRef.current = null
      releasePointer(event.pointerId)
    }
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    useUi.getState().setBoardInteracting(false)
    const gesture = gestureRef.current
    if (gesture?.type === 'draw' || gesture?.type === 'thread' || gesture?.type === 'marquee') {
      if (gesture.type === 'draw') useBoard.getState().cancelHistory()
      if (gesture.type === 'thread') {
        connectRef.current = null
        setConnectState(null)
      }
      if (gesture.type === 'marquee') setMarquee(null)
    } else if (gesture?.type === 'erase' || gesture?.type === 'resize' || gesture?.type === 'cards' || gesture?.type === 'group' || gesture?.type === 'strokes') {
      useBoard.getState().commitHistory()
    }
    gestureRef.current = null
    setPanning(false)
    setDrawPreview(null)
    releasePointer(event.pointerId)
  }

  /* ------------------------------- context ------------------------------ */

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    const targetEl = event.target as HTMLElement
    if (targetEl.closest('.zoom-bar, .minimap, .empty-board')) return
    if (targetEl.closest('[contenteditable="true"]') || targetEl.closest('input, textarea')) return
    if (!space) return
    event.preventDefault()
    const world = worldFromEvent(event)
    const screen = { x: event.clientX, y: event.clientY }
    const cardEl = targetEl.closest('[data-card-id]') as HTMLElement | null
    const threadEl = targetEl.closest('[data-thread-id]') as HTMLElement | null
    const strokeEl = targetEl.closest('[data-stroke-id]') as HTMLElement | null
    const groupEl = targetEl.closest('[data-group-id]') as HTMLElement | null
    if (cardEl) {
      const id = cardEl.dataset.cardId as string
      if (!useBoard.getState().selection.cards.includes(id)) useBoard.getState().selectCard(id)
      openContextMenu({ type: 'card', id, world, screen })
    } else if (threadEl) {
      const id = threadEl.dataset.threadId as string
      useBoard.getState().selectThread(id)
      openContextMenu({ type: 'thread', id, world, screen })
    } else if (strokeEl) {
      const id = strokeEl.dataset.strokeId as string
      useBoard.getState().selectStroke(id)
      openContextMenu({ type: 'stroke', id, world, screen })
    } else if (groupEl) {
      const id = groupEl.dataset.groupId as string
      useBoard.getState().selectGroup(id)
      openContextMenu({ type: 'group', id, world, screen })
    } else {
      openContextMenu({ type: 'canvas', world, screen })
    }
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const targetEl = event.target as HTMLElement
    if (targetEl.closest('.zoom-bar, .minimap, .empty-board, .filter-empty, .tool-options, [data-group-id], [data-interactive]')) return
    if (!space) return
    const cardEl = targetEl.closest('[data-card-id]') as HTMLElement | null
    if (cardEl) {
      const card = space.cards[cardEl.dataset.cardId as string]
      if (!card) return
      useBoard.getState().selectCard(card.id)
      if (card.kind === 'text' || card.kind === 'note') {
        if (settings.interaction.doubleClickCardEdit) useBoard.getState().setEditingCard(card.id)
      }
      return
    }
    if (tool !== 'select') return
    if (!settings.interaction.doubleClickCreate) return
    const world = worldFromEvent(event)
    useBoard.getState().createCard('note', world)
  }

  /* --------------------------------- drop ------------------------------- */

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragCounterRef.current += 1
    setDropActive(true)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setDropActive(false)
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    dragCounterRef.current = 0
    setDropActive(false)
    if (!project) return
    const files = Array.from(event.dataTransfer.files)
    if (!files.length) return
    const world = worldFromEvent(event)
    try {
      toast(
        t(files.length === 1 ? 'Importing {count} file…' : 'Importing {count} files…', { count: files.length }),
        'info',
        1600
      )
      const assets = await importDroppedFiles(project.id, files)
      if (assets.length) {
        useBoard.getState().createCardsFromAssets(assets, world)
        toast(
          t(assets.length === 1 ? 'Added {count} material' : 'Added {count} materials', { count: assets.length }),
          'success',
          1700
        )
      }
    } catch (error) {
      toast(t('Import failed: {message}', { message: (error as Error).message }), 'error', 4500)
    }
  }

  if (!space) return null

  const marqueeStyle = marqueeScreen
    ? { left: marqueeScreen.x, top: marqueeScreen.y, width: marqueeScreen.w, height: marqueeScreen.h }
    : undefined
  const previewLayer = expandRect(visibleRect, 120 / Math.max(zoom, 0.1))

  return (
    <div
      ref={boardRef}
      className={[
        'board',
        panning ? 'is-panning' : '',
        tool === 'hand' ? 'is-hand' : '',
        spaceHeld ? 'is-space' : ''
      ].join(' ')}
      style={{ background: settings.board.background, ['--texture-opacity' as string]: settings.board.textureOpacity }}
      data-lod={lod ? 'on' : 'off'}
      data-mode={mode}
      data-tool={tool}
      tabIndex={-1}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => {
        setPointerInside(false)
        if (!gestureRef.current) {
          setEraserScreen(null)
        }
      }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      {settings.board.backgroundImage && (
        <div
          className="board-custom-bg"
          style={{
            backgroundImage: `url("${settings.board.backgroundImage}")`,
            opacity: settings.board.backgroundImageOpacity
          }}
        />
      )}
      <div className={`board-texture texture-${settings.board.texture}`} />
      {settings.board.vignette && <div className="board-vignette" />}
      <GridCanvas camera={camera} viewport={viewport} settings={settings} />
      <BoardDefs
        chalkTexture={settings.objects.chalkTexture}
        effects={settings.performance.effects}
      />
      {settings.ui.showToolOptions && <ToolOptionsBar />}

      <div
        className="board-world"
        style={{
          transform: `translate3d(${viewport.w / 2 - camera.x * zoom}px, ${viewport.h / 2 - camera.y * zoom}px, 0)`
        }}
      >
        <div
          className="board-zoom"
          style={{
            zoom,
            ['--inv-zoom' as string]: 1 / zoom
          }}
        >
        <GroupLayer
          space={space}
          visibleCardIds={visibleCardIds}
          visibleGroupIds={visibleGroupIds}
          focusIds={focusIds}
        />
        <StrokesLayer space={space} visibleRect={visibleRect} zoom={zoom} />
        <ThreadsLayer
          space={space}
          visibleRect={visibleRect}
          zoom={zoom}
          visibleCardIds={visibleCardIds}
          visibleGroupIds={visibleGroupIds}
          focusIds={focusIds}
        />
        {drawPreview && (
          <svg
            className="stroke-preview-svg"
            style={{ left: previewLayer.x, top: previewLayer.y, width: previewLayer.w, height: previewLayer.h }}
            viewBox={`${previewLayer.x} ${previewLayer.y} ${previewLayer.w} ${previewLayer.h}`}
          >
            <path
              d={strokeSvgPathD(
                drawPreview,
                settings.performance.smoothDrawing
                  ? drawPreview.smoothing ?? settings.tools.pencil.smoothing
                  : 0,
                drawPreview.cornerRadius ?? 0
              )}
              fill={drawPreview.fill ?? 'none'}
              fillOpacity={drawPreview.fillOpacity ?? 1}
              stroke={drawPreview.color}
              strokeWidth={drawPreview.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={
                drawPreview.lineStyle === 'dashed'
                  ? `${Math.max(6, drawPreview.width * 3)} ${Math.max(4, drawPreview.width * 2.4)}`
                  : drawPreview.lineStyle === 'dotted'
                    ? `1 ${Math.max(5, drawPreview.width * 3)}`
                    : undefined
              }
              opacity={drawPreview.opacity}
              style={{
                filter:
                  drawPreview.tool === 'chalk' && settings.objects.chalkTexture && settings.performance.effects
                    ? 'url(#chalk-filter)'
                    : undefined
              }}
            />
            {arrowHeadPathD(drawPreview) && (
              <path d={arrowHeadPathD(drawPreview) as string} fill={drawPreview.color} />
            )}
          </svg>
        )}
        <div className="cards-layer">
          {visibleCards.map((card) => (
            <CardView
              key={card.id}
              card={card}
              zoom={zoom}
              selected={selectedSet.has(card.id)}
              editing={editingCardId === card.id}
              dimmed={Boolean(focusIds && !focusIds.has(card.id))}
              showAnchors={Boolean(connectState)}
              connectedPins={pinColors.get(card.id) ?? EMPTY_PINS}
              canConnect={(tool === 'select' || tool === 'thread') && !editingCardId}
              showResize={selection.cards.length === 1 && selection.cards[0] === card.id}
            />
          ))}
        </div>

        <div className="overlay-layer">
          {previewGeometry && (
            <svg
              className="overlay-svg"
              style={{
                left: previewLayer.x,
                top: previewLayer.y,
                width: previewLayer.w,
                height: previewLayer.h
              }}
              viewBox={`${previewLayer.x} ${previewLayer.y} ${previewLayer.w} ${previewLayer.h}`}
            >
              <path
                className="thread-preview"
                d={previewGeometry.path}
                stroke={settings.tools.thread.color}
                strokeWidth={Math.max(1.5, settings.tools.thread.width)}
                opacity={settings.interaction.showLinkPreview ? 1 : 0}
              />
              <circle
                className="thread-preview-anchor"
                cx={connectState?.point.x}
                cy={connectState?.point.y}
                r={3.5 / zoom}
              />
              {connectTargetCard && connectState?.targetPinId && (
                <circle
                  cx={pinPoint(connectTargetCard, connectState.targetPinId).x}
                  cy={pinPoint(connectTargetCard, connectState.targetPinId).y}
                  r={5.5 / zoom}
                  fill="rgba(200,85,61,0.9)"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth={1 / zoom}
                />
              )}
              {connectTargetCard && (
                <rect
                  x={connectTargetCard.x}
                  y={connectTargetCard.y}
                  width={connectTargetCard.w}
                  height={connectTargetCard.h}
                  fill="none"
                  stroke="rgba(200,85,61,0.8)"
                  strokeWidth={1.5 / zoom}
                  strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                  rx={4 / zoom}
                />
              )}
            </svg>
          )}
        </div>
        </div>
      </div>

      {lod && settings.board.cardLabelsAtLowZoom && (
        <LodLabels
          cards={visibleCards}
          camera={camera}
          viewport={viewport}
          selected={selectedSet}
        />
      )}

      {marqueeStyle && <div className="selection-marquee" style={marqueeStyle} />}

      {eraserScreen && tool === 'eraser' && (
        <div
          className="eraser-cursor"
          style={{
            left: eraserScreen.point.x,
            top: eraserScreen.point.y,
            width: eraserScreen.size,
            height: eraserScreen.size,
            borderRadius: eraserScreen.shape === 'square' ? 2 : '50%'
          }}
        />
      )}

      {connectState?.targetCardId && connectTargetCard && (
        <div
          className="connect-hint"
          style={{
            left: Math.min(viewport.w - 220, connectState.screen.x + 18),
            top: Math.min(viewport.h - 40, connectState.screen.y + 18)
          }}
        >
          <span>{t('Release to tie to “{name}”', { name: connectTargetCard.title || connectTargetCard.assetName || connectTargetCard.kind })}</span>
        </div>
      )}

      <ZoomBar camera={camera} viewport={viewport} onFit={fitToContent} onCenter={centerContent} />

      {settings.board.showMinimap && (
        <Minimap
          space={space}
          camera={camera}
          viewport={viewport}
          onNavigate={(point) => useBoard.getState().setCamera(space.id, { x: point.x, y: point.y })}
        />
      )}

      {settings.ui.showHints && (
        <div className="board-hints">
          {tool === 'eraser' ? (
            <>
              <span>{t('Erase chalk, marker and pencil')}</span>
              <kbd>{t("Esc")}</kbd>
              <span>{t('to deselect')}</span>
            </>
          ) : tool !== 'select' && tool !== 'hand' ? (
            <>
              <span>{t('Drawing — drag on the board')}</span>
              <kbd>{t("Esc")}</kbd>
              <span>{t('returns to select')}</span>
            </>
          ) : mode === 'focus' ? (
            <>
              <span>{t('Focus mode — click a card to trace its chain')}</span>
              <span>·</span>
              <span>
                {t(settings.interaction.focusDepth === 1 ? '{count} level' : '{count} levels', {
                  count: settings.interaction.focusDepth
                })}
              </span>
            </>
          ) : (
            <>
              <span>{t('Space + drag to pan')}</span>
              <span>·</span>
              <span>{t('Wheel to zoom')}</span>
              <span>·</span>
              <span>{t('Hover a card to pull a thread')}</span>
            </>
          )}
        </div>
      )}

      {Object.keys(space.cards).length === 0 && Object.keys(space.strokes).length === 0 && (
        <div className="empty-board" onPointerDown={(event) => event.stopPropagation()}>
          <div className="empty-board-inner">
            <div className="empty-eyebrow">{t('BLANK BOARD')}</div>
            <h2>{t('A space with no structure imposed.')}</h2>
            <p>{t('Place anything, anywhere. Nothing is aligned for you, and nothing moves on its own.')}</p>
            <div className="empty-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  const card = useBoard.getState().createCard('note', centerWorld())
                  if (card) useBoard.getState().setEditingCard(card.id)
                }}
              >
                {t('Add a note')}
              </button>
              <button className="btn" onClick={() => void openAttach()}>
                {t('Add a file or image')}
              </button>
            </div>
            <div className="empty-tip">{t('or double-click anywhere on the board')}</div>
          </div>
        </div>
      )}

      {filter.active && filterMatchCount === 0 && Object.keys(space.cards).length > 0 && (
        <div className="filter-empty" onPointerDown={(event) => event.stopPropagation()}>
          <div className="filter-empty-inner">
            <strong>{t('No cards match this filter.')}</strong>
            <span>{t('The board is unchanged — matching cards are only hidden from view.')}</span>
            <button
              className="btn btn-sm"
              onClick={() => useBoard.getState().clearFilter()}
            >
              {t('Clear filter')}
            </button>
          </div>
        </div>
      )}

      {dropActive && (
        <div className="drop-overlay">
          <div>
            <span style={{ color: 'var(--accent)' }}>{t('Drop to pin')}</span>{' '}
            {t('images, video, PDFs, audio or documents')}
          </div>
        </div>
      )}
    </div>
  )
}

function strokeBBoxSafe(stroke: Stroke): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < stroke.points.length; i += 2) {
    minX = Math.min(minX, stroke.points[i])
    minY = Math.min(minY, stroke.points[i + 1])
    maxX = Math.max(maxX, stroke.points[i])
    maxY = Math.max(maxY, stroke.points[i + 1])
  }
  const pad = stroke.width / 2 + 4
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}
