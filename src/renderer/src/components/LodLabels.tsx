import type { Camera, Card, Point, Rect } from '@shared/types'
import { plainTextFromHtml, rectsIntersect } from '@/core/geometry'
import { worldToScreen } from '@/core/camera'

function labelColor(card: Card): string {
  if (card.kind === 'note') return card.color ?? '#d8b45a'
  switch (card.kind) {
    case 'image':
      return '#5b8db8'
    case 'video':
      return '#8a7bc8'
    case 'audio':
      return '#6e9c73'
    case 'pdf':
      return '#c07a55'
    case 'doc':
    case 'file':
      return '#9aa0a8'
    case 'link':
      return '#5b93a8'
    default:
      return '#c8553d'
  }
}

export default function LodLabels({
  cards,
  camera,
  viewport,
  selected
}: {
  cards: Card[]
  camera: Camera
  viewport: { w: number; h: number }
  selected: Set<string>
}): React.JSX.Element {
  const placed: Rect[] = []
  const labels: { card: Card; point: Point; width: number; title: string }[] = []
  const ordered = [...cards].sort((a, b) => {
    const sa = selected.has(a.id) ? 1 : 0
    const sb = selected.has(b.id) ? 1 : 0
    if (sa !== sb) return sb - sa
    return a.z - b.z
  })
  for (const card of ordered) {
    const title =
      card.title ||
      plainTextFromHtml(card.body).replace(/\s+/g, ' ').trim().slice(0, 52) ||
      card.assetName ||
      card.kind
    if (!title) continue
    const point = worldToScreen(
      { x: card.x, y: card.y },
      camera,
      viewport
    )
    const screenW = card.w * camera.zoom
    const screenH = card.h * camera.zoom
    if (point.x + screenW < 0 || point.y + screenH < 0 || point.x > viewport.w || point.y > viewport.h) {
      continue
    }
    const width = Math.min(210, Math.max(46, Math.min(34, title.length) * 6.1 + 24))
    const rect: Rect = {
      x: Math.max(3, Math.min(viewport.w - width - 3, point.x + Math.min(4, screenW / 2))),
      y: Math.max(3, Math.min(viewport.h - 18, point.y + 2)),
      w: width,
      h: 17
    }
    if (placed.some((other) => rectsIntersect(other, rect))) continue
    placed.push(rect)
    labels.push({ card, point: { x: rect.x, y: rect.y }, width, title })
    if (labels.length > 220) break
  }

  return (
    <div className="lod-labels">
      {labels.map(({ card, point, width, title }) => (
        <div
          key={card.id}
          className="lod-label"
          style={{
            left: point.x,
            top: point.y,
            maxWidth: width,
            borderColor: selected.has(card.id) ? 'rgba(200,85,61,0.7)' : undefined
          }}
          title={title}
        >
          <span className="swatch" style={{ background: labelColor(card) }} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {title}
          </span>
        </div>
      ))}
    </div>
  )
}
