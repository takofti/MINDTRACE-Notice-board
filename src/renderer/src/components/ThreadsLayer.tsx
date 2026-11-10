import type { Rect, Space, Thread } from '@shared/types'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { rectsIntersect, expandRect } from '@/core/geometry'
import { computeThreadLanes, threadCurveFor } from '@/core/threads'

interface ThreadsLayerProps {
  space: Space
  visibleRect: Rect
  zoom: number
  visibleCardIds: Set<string>
  visibleGroupIds: Set<string>
  focusIds: Set<string> | null
}

export default function ThreadsLayer({
  space,
  visibleRect,
  zoom,
  visibleCardIds,
  visibleGroupIds,
  focusIds
}: ThreadsLayerProps): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const selection = useBoard((state) => state.selection)
  const mode = useBoard((state) => state.mode)
  const showHidden = useBoard((state) => state.showHidden)
  const selectedCards = new Set(selection.cards)
  const selectedThreads = new Set(selection.threads)
  const activeFocus = mode === 'focus' && Boolean(focusIds?.size)
  const layer = expandRect(visibleRect, Math.max(50, 200 / Math.max(zoom, 0.1)))

  const allThreads = Object.values(space.threads).filter((thread) => {
    if (thread.hidden && !showHidden) return false
    const from = space.cards[thread.from.cardId]
    const to = space.cards[thread.to.cardId]
    if (!from || !to) return false
    const visibleEnd = (cardId: string): boolean => {
      const card = space.cards[cardId]
      if (!card) return false
      if (card.hidden && !showHidden) return false
      const group = card.groupId ? space.groups[card.groupId] : undefined
      if (group?.collapsed) return visibleGroupIds.has(group.id)
      return visibleCardIds.has(cardId)
    }
    return visibleEnd(thread.from.cardId) && visibleEnd(thread.to.cardId)
  })
  const lanes = computeThreadLanes(allThreads)

  const rendered = allThreads
    .map((thread) => {
      const curve = threadCurveFor(thread, space, lanes.get(thread.id), settings, zoom)
      if (!curve) return null
      if (settings.performance.cullOffscreen && !rectsIntersect(expandRect(curve.bbox, 20), layer)) {
        return null
      }
      return { thread, curve }
    })
    .filter(Boolean) as { thread: Thread; curve: NonNullable<ReturnType<typeof threadCurveFor>> }[]

  return (
    <svg
      className="threads-svg"
      style={{ left: layer.x, top: layer.y, width: layer.w, height: layer.h }}
      viewBox={`${layer.x} ${layer.y} ${layer.w} ${layer.h}`}
      aria-hidden
    >
      {rendered.map(({ thread, curve }) => {
        const relatedBySelection =
          selectedCards.size > 0 &&
          (selectedCards.has(thread.from.cardId) || selectedCards.has(thread.to.cardId))
        const relatedByFocus =
          activeFocus &&
          focusIds !== null &&
          (focusIds.has(thread.from.cardId) && focusIds.has(thread.to.cardId))
        const isSelected = selectedThreads.has(thread.id)
        const relevant = isSelected || (activeFocus ? relatedByFocus : relatedBySelection)
        const dimmed = activeFocus ? !relevant : selectedCards.size > 0 && !relevant
        const highlighted = relevant || isSelected
        const opacity = (thread.opacity ?? 1) * (mode === 'overview' ? 0.75 : 1)
        const dash =
          thread.style === 'dashed'
            ? `${Math.max(5, thread.width * 3)} ${Math.max(4, thread.width * 2.5)}`
            : thread.style === 'dotted'
              ? `1 ${Math.max(5, thread.width * 2.8)}`
              : undefined
        const hitWidth = Math.max(16 / Math.max(zoom, 0.05), thread.width + 8)
        const showLabel =
          Boolean(thread.label) &&
          settings.board.showThreadLabels &&
          mode !== 'overview' &&
          zoom > 0.34
        const labelWidth = thread.label ? Math.max(26, thread.label.length * 5.7 + 12) : 0
        const labelX = curve.mid.x - labelWidth / 2
        const labelY = curve.mid.y - 21
        const useGlow =
          settings.performance.effects &&
          settings.objects.threadGlow &&
          highlighted &&
          settings.performance.quality !== 'low'
        const dimFactor = activeFocus
          ? 0.16
          : selectedCards.size > 0 && !relevant
            ? settings.board.threadDim
            : 1
        const ghost = thread.hidden ? 0.22 : 1

        return (
          <g
            key={thread.id}
            className={[
              'thread-group',
              dimmed ? 'is-dimmed' : '',
              highlighted ? 'is-highlighted' : '',
              selectedCards.size > 0 && !activeFocus && !relevant ? 'is-soft' : ''
            ].join(' ')}
            style={{ opacity: dimFactor * ghost }}
          >
            {settings.performance.shadows && settings.performance.quality === 'high' && (
              <path
                className="thread-shadow"
                d={curve.path}
                strokeWidth={thread.width + 0.6}
                opacity={opacity * 0.6}
              />
            )}
            <path
              className="thread-path"
              d={curve.path}
              stroke={thread.color}
              strokeWidth={mode === 'overview' ? thread.width * 0.8 : thread.width}
              strokeDasharray={dash}
              opacity={opacity}
              style={useGlow ? { filter: 'url(#thread-glow)' } : undefined}
            />
            <path
              className="thread-hit"
              d={curve.path}
              strokeWidth={hitWidth}
              data-thread-id={thread.id}
              data-thread-color={thread.color}
            />
            {showLabel && thread.label && (
              <g opacity={0.95}>
                <rect
                  className="thread-label-bg"
                  x={labelX}
                  y={labelY}
                  width={labelWidth}
                  height={16}
                  rx={3}
                />
                <text className="thread-label" x={curve.mid.x} y={labelY + 8.5} textAnchor="middle">
                  {thread.label}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
