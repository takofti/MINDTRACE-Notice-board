import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react'
import type { Camera, Point, Space } from '@shared/types'
import { useBoard } from '@/store/board'
import {
  expandRect,
  groupBounds,
  pinPoint,
  strokeBBox,
  unionRects
} from '@/core/geometry'
import { visibleWorldRect } from '@/core/camera'

const WIDTH = 226
const HEIGHT = 132
const PAD = 7

function cardColor(kind: string, color?: string): string {
  if (kind === 'note') return color ?? '#d8b45a'
  switch (kind) {
    case 'image':
      return '#5b8db8'
    case 'video':
      return '#7a6fae'
    case 'audio':
      return '#63937a'
    case 'pdf':
      return '#b57652'
    case 'doc':
      return '#9aa0a8'
    case 'file':
      return '#858b95'
    case 'link':
      return '#5b93a8'
    default:
      return '#a8adb5'
  }
}

export default function Minimap({
  space,
  camera,
  viewport,
  onNavigate
}: {
  space: Space
  camera: Camera
  viewport: { w: number; h: number }
  onNavigate: (point: Point) => void
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const selection = useBoard((state) => state.selection)
  const mappingRef = useRef<{
    scale: number
    offsetX: number
    offsetY: number
    minX: number
    minY: number
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || collapsed) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)

    const viewRect = visibleWorldRect(camera, viewport)
    const cardRects = Object.values(space.cards)
      .filter((card) => !card.hidden)
      .map((card) => ({ x: card.x, y: card.y, w: card.w, h: card.h }))
    const strokeRects = Object.values(space.strokes)
      .filter((stroke) => !stroke.hidden)
      .map(strokeBBox)
    const groupRects = Object.values(space.groups)
      .filter((group) => Object.values(space.cards).some((card) => card.groupId === group.id))
      .map((group) => groupBounds(group, space.cards))
    const bounds =
      unionRects([...cardRects, ...strokeRects, ...groupRects, viewRect]) ?? viewRect
    const padded = expandRect(bounds, 40)
    const scale = Math.min((WIDTH - PAD * 2) / padded.w, (HEIGHT - PAD * 2) / padded.h)
    const offsetX = PAD + (WIDTH - PAD * 2 - padded.w * scale) / 2
    const offsetY = PAD + (HEIGHT - PAD * 2 - padded.h * scale) / 2
    mappingRef.current = { scale, offsetX, offsetY, minX: padded.x, minY: padded.y }
    const toMap = (x: number, y: number): Point => ({
      x: offsetX + (x - padded.x) * scale,
      y: offsetY + (y - padded.y) * scale
    })

    // Backdrop
    ctx.fillStyle = 'rgba(10,11,14,0.22)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // Groups
    ctx.lineWidth = 1
    for (const rect of groupRects) {
      const p = toMap(rect.x, rect.y)
      ctx.strokeStyle = 'rgba(201,154,61,0.35)'
      ctx.strokeRect(p.x, p.y, rect.w * scale, rect.h * scale)
    }

    // Threads
    ctx.lineWidth = 0.8
    for (const thread of Object.values(space.threads)) {
      if (thread.hidden) continue
      const from = space.cards[thread.from.cardId]
      const to = space.cards[thread.to.cardId]
      if (!from || !to) continue
      const a = pinPoint(from, thread.from.pinId)
      const b = pinPoint(to, thread.to.pinId)
      const pa = toMap(a.x, a.y)
      const pb = toMap(b.x, b.y)
      ctx.strokeStyle = thread.color
      ctx.globalAlpha = 0.42
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Cards
    const selectedCards = new Set(selection.cards)
    for (const card of Object.values(space.cards)) {
      if (card.hidden) continue
      const p = toMap(card.x, card.y)
      const w = Math.max(2, card.w * scale)
      const h = Math.max(1.5, card.h * scale)
      ctx.fillStyle = cardColor(card.kind, card.color)
      ctx.globalAlpha = 0.75
      ctx.fillRect(p.x, p.y, w, h)
      if (selectedCards.has(card.id)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = '#c8553d'
        ctx.lineWidth = 1.2
        ctx.strokeRect(p.x - 0.6, p.y - 0.6, w + 1.2, h + 1.2)
      }
    }
    ctx.globalAlpha = 1

    // Viewport
    const vp = toMap(viewRect.x, viewRect.y)
    ctx.fillStyle = 'rgba(200,85,61,0.08)'
    ctx.fillRect(vp.x, vp.y, viewRect.w * scale, viewRect.h * scale)
    ctx.strokeStyle = 'rgba(200,85,61,0.85)'
    ctx.lineWidth = 1
    ctx.strokeRect(vp.x, vp.y, viewRect.w * scale, viewRect.h * scale)

    if (!cardRects.length) {
      ctx.fillStyle = 'rgba(160,164,172,0.5)'
      ctx.font = '9px "Cascadia Mono", Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('EMPTY BOARD', WIDTH / 2, HEIGHT / 2 + 4)
    }
  }, [space, camera, viewport, selection.cards, collapsed])

  const navigate = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const mapping = mappingRef.current
    if (!mapping) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT
    const world = {
      x: mapping.minX + (x - mapping.offsetX) / mapping.scale,
      y: mapping.minY + (y - mapping.offsetY) / mapping.scale
    }
    onNavigate(world)
  }

  return (
    <div className={`minimap ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="minimap-head">
        <MapIcon size={10} />
        <span className="minimap-title">OVERVIEW</span>
        <button
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? 'Expand minimap' : 'Collapse minimap'}
        >
          {collapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>
      {!collapsed && (
        <canvas
          ref={canvasRef}
          style={{ width: WIDTH, height: HEIGHT }}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            navigate(event)
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) navigate(event)
          }}
          title="Drag to move the board"
        />
      )}
    </div>
  )
}
