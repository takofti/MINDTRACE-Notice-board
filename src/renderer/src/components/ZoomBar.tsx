import { Crosshair, Map as MapIcon, Maximize2, Minus, Plus } from 'lucide-react'
import type { Camera } from '@shared/types'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { zoomAround } from '@/core/camera'

export default function ZoomBar({
  camera,
  viewport,
  onFit,
  onCenter
}: {
  camera: Camera
  viewport: { w: number; h: number }
  onFit: () => void
  onCenter: () => void
}): React.JSX.Element {
  const spaceId = useBoard((state) => state.activeSpaceId)
  const setCamera = useBoard((state) => state.setCamera)
  const showMinimap = useSettings((state) => state.settings.board.showMinimap)
  const updateBoardSettings = useSettings((state) => state.update)

  const zoomTo = (factor: number): void => {
    if (!spaceId) return
    setCamera(spaceId, zoomAround(camera, viewport, { x: viewport.w / 2, y: viewport.h / 2 }, factor))
  }

  return (
    <div className="zoom-bar" aria-label="Zoom controls">
      <button onClick={() => zoomTo(1 / 1.25)} title="Zoom out" aria-label="Zoom out">
        <Minus size={13} />
      </button>
      <button
        className="zoom-value"
        onClick={() => spaceId && setCamera(spaceId, { zoom: 1 })}
        title="Reset zoom to 100%"
        aria-label="Reset zoom to 100 percent"
      >
        {Math.round(camera.zoom * 100)}%
      </button>
      <button onClick={() => zoomTo(1.25)} title="Zoom in" aria-label="Zoom in">
        <Plus size={13} />
      </button>
      <span className="divider" />
      <button onClick={onFit} title="Fit board (Ctrl+0)" aria-label="Fit board">
        <Maximize2 size={12} />
      </button>
      <button onClick={onCenter} title="Center on content" aria-label="Center on content">
        <Crosshair size={12} />
      </button>
      <button
        className={showMinimap ? 'is-on' : ''}
        onClick={() => updateBoardSettings('board', { showMinimap: !showMinimap })}
        title="Toggle minimap"
        aria-label="Toggle minimap"
        aria-pressed={showMinimap}
      >
        <MapIcon size={12} />
      </button>
    </div>
  )
}
