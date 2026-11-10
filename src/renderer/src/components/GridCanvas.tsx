import { useEffect, useRef } from 'react'
import type { Camera } from '@shared/types'
import type { AppSettings } from '@shared/settings'

export default function GridCanvas({
  camera,
  viewport,
  settings
}: {
  camera: Camera
  viewport: { w: number; h: number }
  settings: AppSettings
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.floor(viewport.w * dpr))
    canvas.height = Math.max(1, Math.floor(viewport.h * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, viewport.w, viewport.h)

    const enabled =
      settings.ui.showGridByDefault &&
      settings.board.grid !== 'none' &&
      settings.board.gridOpacity > 0
    if (!enabled) return

    let spacing = settings.board.gridSize * camera.zoom
    if (!Number.isFinite(spacing) || spacing <= 0) return
    let level = 0
    while (spacing < 16 && level < 5) {
      spacing *= 2
      level++
    }
    if (spacing > 260) spacing /= 2

    const originX = viewport.w / 2 - camera.x * camera.zoom
    const originY = viewport.h / 2 - camera.y * camera.zoom
    const startX = ((originX % spacing) + spacing) % spacing
    const startY = ((originY % spacing) + spacing) % spacing
    ctx.globalAlpha = settings.board.gridOpacity
    ctx.strokeStyle = settings.board.gridColor
    ctx.fillStyle = settings.board.gridColor

    if (settings.board.grid === 'dots') {
      const radius = Math.max(0.7, Math.min(1.7, 1.1))
      for (let x = startX; x < viewport.w; x += spacing) {
        for (let y = startY; y < viewport.h; y += spacing) {
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      return
    }

    ctx.lineWidth = Math.max(0.5, Math.min(1.2, camera.zoom))
    ctx.beginPath()
    for (let x = startX; x < viewport.w; x += spacing) {
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, viewport.h)
    }
    for (let y = startY; y < viewport.h; y += spacing) {
      ctx.moveTo(0, Math.round(y) + 0.5)
      ctx.lineTo(viewport.w, Math.round(y) + 0.5)
    }
    ctx.stroke()

    if (settings.board.grid === 'squares') {
      ctx.globalAlpha = Math.min(0.5, settings.board.gridOpacity * 1.8)
      ctx.beginPath()
      for (let x = startX + spacing / 2; x < viewport.w; x += spacing) {
        for (let y = startY + spacing / 2; y < viewport.h; y += spacing) {
          ctx.moveTo(x, y)
          ctx.arc(x, y, 1.3, 0, Math.PI * 2)
        }
      }
      ctx.fill()
    }
  }, [camera, viewport, settings])

  return <canvas ref={ref} className="grid-canvas" style={{ width: viewport.w, height: viewport.h }} />
}
