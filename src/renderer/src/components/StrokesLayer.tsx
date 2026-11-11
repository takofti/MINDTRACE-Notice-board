import type { Rect, Space, Stroke } from '@shared/types'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { strokeBBox, rectsIntersect, expandRect } from '@/core/geometry'
import { arrowHeadPathD, strokeSvgPathD } from '@/core/strokes'

export default function StrokesLayer({
  space,
  visibleRect,
  zoom
}: {
  space: Space
  visibleRect: Rect
  zoom: number
}): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const selection = useBoard((state) => state.selection)
  const showHidden = useBoard((state) => state.showHidden)
  const mode = useBoard((state) => state.mode)
  const focusActive =
    mode === 'focus' && (selection.cards.length > 0 || selection.threads.length > 0)
  const selected = new Set(selection.strokes)
  const layer = expandRect(visibleRect, Math.max(80, 220 / Math.max(zoom, 0.15)))
  const culling = settings.performance.cullOffscreen
  const smoothing = settings.performance.smoothDrawing ? settings.objects.drawSmoothing : 0
  const strokes = Object.values(space.strokes)
    .filter((stroke) => {
      if (stroke.hidden && !showHidden) return false
      if (!culling || selected.has(stroke.id)) return true
      return rectsIntersect(strokeBBox(stroke), layer)
    })
    .sort((a, b) => a.createdAt - b.createdAt)

  return (
    <svg
      className="strokes-svg"
      style={{ left: layer.x, top: layer.y, width: layer.w, height: layer.h, opacity: focusActive ? 0.24 : 1 }}
      viewBox={`${layer.x} ${layer.y} ${layer.w} ${layer.h}`}
      aria-hidden
    >
      {strokes.map((stroke) => (
        <StrokeShape
          key={stroke.id}
          stroke={stroke}
          zoom={zoom}
          selected={selected.has(stroke.id)}
          hidden={Boolean(stroke.hidden)}
          chalkFilter={settings.objects.chalkTexture && settings.performance.effects}
          smoothing={smoothing}
        />
      ))}
    </svg>
  )
}

function StrokeShape({
  stroke,
  zoom,
  selected,
  hidden,
  chalkFilter,
  smoothing
}: {
  stroke: Stroke
  zoom: number
  selected: boolean
  hidden: boolean
  chalkFilter: boolean
  smoothing: number
}): React.JSX.Element {
  const d = strokeSvgPathD(
    stroke,
    smoothing,
    stroke.cornerRadius ?? 0
  )
  const arrow = arrowHeadPathD(stroke)
  const bbox = strokeBBox(stroke)
  const hitWidth = Math.max(14 / Math.max(zoom, 0.05), stroke.width + 7)
  const filter = stroke.tool === 'chalk' && chalkFilter ? 'url(#chalk-filter)' : undefined
  const opacity = hidden ? 0.18 : stroke.opacity
  const dash =
    stroke.lineStyle === 'dashed'
      ? `${Math.max(6, stroke.width * 3)} ${Math.max(4, stroke.width * 2.4)}`
      : stroke.lineStyle === 'dotted'
        ? `1 ${Math.max(5, stroke.width * 3)}`
        : undefined

  return (
    <g opacity={opacity}>
      {selected && (
        <rect
          className="stroke-selected"
          x={bbox.x}
          y={bbox.y}
          width={bbox.w}
          height={bbox.h}
          strokeWidth={1.2 / Math.max(zoom, 0.1)}
          rx={4}
        />
      )}
      <path
        className="stroke-path"
        d={d}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeDasharray={dash}
        style={{
          filter,
          fill: stroke.fill ?? 'none',
          fillOpacity: stroke.fillOpacity ?? 1
        }}
      />
      {arrow && <path d={arrow} fill={stroke.color} stroke="none" />}
      <path
        className="stroke-hit"
        d={d}
        strokeWidth={hitWidth}
        data-stroke-id={stroke.id}
        style={{ cursor: stroke.locked ? 'pointer' : 'move' }}
      />
    </g>
  )
}
