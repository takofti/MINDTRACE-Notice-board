import { Crosshair, Map as MapIcon, Maximize2, Minus, Plus } from 'lucide-react'
import type { Camera } from '@shared/types'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { zoomAround } from '@/core/camera'
import { useT } from '@/i18n'

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
  const t = useT()

  const zoomTo = (factor: number): void => {
    if (!spaceId) return
    setCamera(spaceId, zoomAround(camera, viewport, { x: viewport.w / 2, y: viewport.h / 2 }, factor))
  }

  return (
    <div className="zoom-bar" aria-label={t('Zoom')}>
      <button onClick={() => zoomTo(1 / 1.25)} title={t('Zoom out')} aria-label={t('Zoom out')}>
        <Minus size={13} />
      </button>
      <button
        className="zoom-value"
        onClick={() => spaceId && setCamera(spaceId, { zoom: 1 })}
        title={t('Reset zoom to 100%')}
        aria-label={t('Reset zoom to 100 percent')}
      >
        {Math.round(camera.zoom * 100)}%
      </button>
      <button onClick={() => zoomTo(1.25)} title={t('Zoom in')} aria-label={t('Zoom in')}>
        <Plus size={13} />
      </button>
      <span className="divider" />
      <button onClick={onFit} title={t('Fit board (Ctrl+0)')} aria-label={t('Fit board')}>
        <Maximize2 size={12} />
      </button>
      <button onClick={onCenter} title={t('Center on content')} aria-label={t('Center on content')}>
        <Crosshair size={12} />
      </button>
      <button
        className={showMinimap ? 'is-on' : ''}
        onClick={() => updateBoardSettings('board', { showMinimap: !showMinimap })}
        title={t('Toggle minimap')}
        aria-label={t('Toggle minimap')}
        aria-pressed={showMinimap}
      >
        <MapIcon size={12} />
      </button>
    </div>
  )
}
