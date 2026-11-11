import type { Card, Project, Rect, Space } from '@shared/types'
import type { AppSettings } from '@shared/settings'
import {
  contentBounds,
  expandRect,
  groupBounds,
  groupMemberCards,
  pinPoint,
  plainTextFromHtml
} from '@/core/geometry'
import { threadCurveFor, computeThreadLanes } from '@/core/threads'
import { arrowHeadPathD, strokeSvgPathD } from '@/core/strokes'
import { resolveAssetUrl } from '@/services/storage'

export interface ExportOptions {
  scale?: number
  width?: number
  height?: number
  format?: 'png' | 'jpeg' | 'webp'
  quality?: number
  transparent?: boolean
  includeBackground: boolean
  includeThreads: boolean
  includePins: boolean
}

export interface ExportResult {
  dataUrl: string
  width: number
  height: number
}

const MAX_PIXELS = 90_000_000
const MAX_DIMENSION = 20_000
const imageCache = new Map<string, Promise<HTMLImageElement | null>>()

function loadImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  const cached = imageCache.get(url)
  if (cached) return cached
  const promise = (async () => {
    try {
      const image = new Image()
      image.decoding = 'async'
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('Image decode failed'))
          image.src = url
        })
        return image
      }
      const resolved = await resolveAssetUrl(url)
      if (!resolved) return null
      const response = await fetch(resolved)
      if (!response.ok) return null
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('Image decode failed'))
          image.src = objectUrl
        })
        return image
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      }
    } catch {
      return null
    }
  })()
  imageCache.set(url, promise)
  return promise
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function htmlToText(html: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
    doc.querySelectorAll('p,div,li,h1,h2,h3').forEach((node) => {
      if (node.nextSibling) node.after('\n')
    })
    doc.querySelectorAll('li').forEach((node) => {
      node.prepend('• ')
    })
    return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return plainTextFromHtml(html)
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      out.push('')
      continue
    }
    const words = paragraph.split(/\s+/)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) out.push(line)
  }
  return out
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { font: string; color: string; lineHeight: number; align?: 'left' | 'center' | 'right' }
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.font = options.font
  ctx.fillStyle = options.color
  ctx.textBaseline = 'top'
  ctx.textAlign = options.align ?? 'left'
  const lines = wrapLines(ctx, text, width)
  const maxLines = Math.max(1, Math.floor(height / options.lineHeight))
  let cursorY = y
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    let line = lines[i]
    if (i === maxLines - 1 && lines.length > maxLines) {
      while (line.length > 3 && ctx.measureText(`${line}…`).width > width) {
        line = line.slice(0, -1)
      }
      line += '…'
    }
    if (!line) {
      cursorY += options.lineHeight
      continue
    }
    const drawX = options.align === 'center' ? x + width / 2 : options.align === 'right' ? x + width : x
    ctx.fillText(line, drawX, cursorY)
    cursorY += options.lineHeight
  }
  ctx.restore()
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: Card,
  settings: AppSettings,
  image: HTMLImageElement | null
): void {
  ctx.save()
  const radius = card.style?.radius ?? settings.objects.cardRadius
  const isNote = card.kind === 'note'
  const background =
    card.color ??
    (isNote ? settings.objects.noteColor : settings.objects.cardBackground)
  const textColor =
    card.style?.color ?? (isNote ? settings.objects.noteText : settings.objects.cardText)
  ctx.globalAlpha = card.style?.opacity ?? settings.objects.cardOpacity
  if (settings.performance.shadows) {
    ctx.shadowColor = 'rgba(0,0,0,0.38)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 7
  }
  roundedRect(ctx, card.x, card.y, card.w, card.h, radius)
  ctx.fillStyle = background
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.lineWidth = 1
  ctx.strokeStyle = isNote ? 'rgba(0,0,0,0.2)' : settings.objects.cardBorder
  ctx.stroke()

  roundedRect(ctx, card.x, card.y, card.w, card.h, radius)
  ctx.clip()

  if (isNote) {
    const fontSize = card.style?.fontSize ?? settings.tools.note.fontSize
    const font = `${card.style?.italic ? 'italic ' : ''}${card.style?.bold ? '700 ' : '400 '}${fontSize}px ${settings.objects.textFontFamily}`
    drawTextBlock(ctx, htmlToText(card.body), card.x + 16, card.y + 16, card.w - 32, card.h - 32, {
      font,
      color: textColor,
      lineHeight: fontSize * ((card.style?.lineHeight ?? settings.objects.textLineHeight) || 1.45),
      align: card.style?.align ?? 'left'
    })
  } else {
    const headerH = 34
    ctx.fillStyle = 'rgba(255,255,255,0.035)'
    ctx.fillRect(card.x, card.y, card.w, headerH)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.moveTo(card.x, card.y + headerH)
    ctx.lineTo(card.x + card.w, card.y + headerH)
    ctx.stroke()
    const titleFont = `600 13px ${settings.objects.cardFontFamily}`
    drawTextBlock(ctx, card.title || kindName(card.kind), card.x + 12, card.y + 10, card.w - 28, 20, {
      font: titleFont,
      color: textColor,
      lineHeight: 16
    })

    if (card.kind === 'image') {
      const captionH = 30
      const area = {
        x: card.x,
        y: card.y + headerH,
        w: card.w,
        h: card.h - headerH - captionH
      }
      ctx.fillStyle = '#0c0d10'
      ctx.fillRect(area.x, area.y, area.w, area.h)
      if (image) {
        const fit = card.style?.imageFit ?? settings.objects.imageFit
        const scale =
          fit === 'contain'
            ? Math.min(area.w / image.width, area.h / image.height)
            : Math.max(area.w / image.width, area.h / image.height)
        const w = image.width * scale
        const h = image.height * scale
        ctx.save()
        ctx.beginPath()
        ctx.rect(area.x, area.y, area.w, area.h)
        ctx.clip()
        ctx.drawImage(image, area.x + (area.w - w) / 2, area.y + (area.h - h) / 2, w, h)
        ctx.restore()
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.font = `12px ${settings.objects.cardFontFamily}`
        ctx.fillText('Image', area.x + 14, area.y + 28)
      }
      ctx.fillStyle = '#14161a'
      ctx.fillRect(card.x, card.y + card.h - captionH, card.w, captionH)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.moveTo(card.x, card.y + card.h - captionH)
      ctx.lineTo(card.x + card.w, card.y + card.h - captionH)
      ctx.stroke()
      drawTextBlock(
        ctx,
        card.caption || card.assetName || card.title || '',
        card.x + 10,
        card.y + card.h - captionH + 7,
        card.w - 20,
        captionH - 10,
        {
          font: `9.5px ${settings.objects.cardFontFamily}`,
          color: 'rgba(230,226,216,0.66)',
          lineHeight: 12
        }
      )
    } else if (card.kind === 'video') {
      const area = { x: card.x, y: card.y + headerH, w: card.w, h: card.h - headerH }
      ctx.fillStyle = '#0c0d10'
      ctx.fillRect(area.x, area.y, area.w, area.h)
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.beginPath()
      ctx.arc(area.x + area.w / 2, area.y + area.h / 2, Math.min(42, area.h / 3), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath()
      const cx = area.x + area.w / 2
      const cy = area.y + area.h / 2
      ctx.moveTo(cx - 8, cy - 15)
      ctx.lineTo(cx + 20, cy)
      ctx.lineTo(cx - 8, cy + 15)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = `11px ${settings.objects.cardFontFamily}`
      ctx.fillText(card.assetName || 'Video', area.x + 14, area.y + area.h - 18)
    } else if (card.kind === 'doc' || card.kind === 'pdf') {
      const area = { x: card.x + 14, y: card.y + headerH + 14, w: card.w - 28, h: card.h - headerH - 28 }
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      roundedRect(ctx, area.x, area.y, area.w, area.h, 4)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.68)'
      ctx.font = `12px ${settings.objects.cardFontFamily}`
      ctx.fillText(card.assetName || card.title || kindName(card.kind), area.x + 14, area.y + 26)
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.font = `10px ${settings.objects.cardFontFamily}`
      ctx.fillText(card.kind === 'pdf' ? 'PDF document' : 'Document', area.x + 14, area.y + 46)
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        ctx.fillRect(area.x + 14, area.y + 74 + i * 12, area.w - 28 - (i % 2) * 30, 3)
      }
    } else if (card.kind === 'audio' || card.kind === 'file' || card.kind === 'link') {
      const area = { x: card.x, y: card.y + headerH, w: card.w, h: card.h - headerH }
      ctx.fillStyle = 'rgba(255,255,255,0.02)'
      ctx.fillRect(area.x, area.y, area.w, area.h)
      ctx.fillStyle = 'rgba(255,255,255,0.64)'
      ctx.font = `12px ${settings.objects.cardFontFamily}`
      ctx.fillText(card.assetName || card.title || kindName(card.kind), area.x + 14, area.y + 30)
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.font = `9.5px ${settings.objects.cardFontFamily}`
      ctx.fillText(card.kind === 'link' ? card.assetUrl ?? '' : card.mime ?? '', area.x + 14, area.y + 50)
      if (card.kind === 'audio') {
        ctx.strokeStyle = 'rgba(200,85,61,0.7)'
        for (let i = 0; i < 26; i++) {
          const height = 6 + Math.abs(Math.sin(i * 1.7)) * 18
          ctx.beginPath()
          ctx.moveTo(area.x + 16 + i * 6, area.y + 100)
          ctx.lineTo(area.x + 16 + i * 6, area.y + 100 - height)
          ctx.stroke()
        }
      }
    } else {
      const fontSize = card.style?.fontSize ?? settings.objects.cardFontSize
      drawTextBlock(
        ctx,
        htmlToText(card.body),
        card.x + 12,
        card.y + headerH + 10,
        card.w - 24,
        card.h - headerH - 18,
        {
          font: `${card.style?.italic ? 'italic ' : ''}${card.style?.bold ? '700 ' : '400 '}${fontSize}px ${card.style?.fontFamily ?? settings.objects.cardFontFamily}`,
          color: textColor,
          lineHeight: fontSize * ((card.style?.lineHeight ?? settings.objects.textLineHeight) || 1.5),
          align: card.style?.align ?? 'left'
        }
      )
    }
  }
  ctx.restore()
}

function kindName(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function makeTexturePattern(
  ctx: CanvasRenderingContext2D,
  texture: AppSettings['board']['texture']
): CanvasPattern | null {
  if (texture === 'none') return null
  const tile = document.createElement('canvas')
  tile.width = 256
  tile.height = 256
  const tctx = tile.getContext('2d')
  if (!tctx) return null
  let seed = 17
  const random = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  if (texture === 'cork') {
    for (let i = 0; i < 900; i++) {
      const x = random() * 256
      const y = random() * 256
      const radius = 0.4 + random() * 2.2
      tctx.fillStyle = random() > 0.4 ? 'rgba(205,165,110,0.28)' : 'rgba(20,12,7,0.3)'
      tctx.beginPath()
      tctx.arc(x, y, radius, 0, Math.PI * 2)
      tctx.fill()
    }
  } else if (texture === 'linen') {
    tctx.strokeStyle = 'rgba(255,255,255,0.11)'
    tctx.lineWidth = 1
    for (let y = 0; y < 256; y += 4) {
      tctx.beginPath()
      tctx.moveTo(0, y)
      tctx.lineTo(256, y)
      tctx.stroke()
    }
    tctx.strokeStyle = 'rgba(0,0,0,0.12)'
    for (let x = 0; x < 256; x += 5) {
      tctx.beginPath()
      tctx.moveTo(x, 0)
      tctx.lineTo(x, 256)
      tctx.stroke()
    }
  } else if (texture === 'paper') {
    tctx.strokeStyle = 'rgba(60,45,30,0.08)'
    tctx.lineWidth = 0.6
    for (let i = 0; i < 220; i++) {
      const x = random() * 256
      const y = random() * 256
      tctx.beginPath()
      tctx.moveTo(x, y)
      tctx.lineTo(x + random() * 18 - 9, y + random() * 4 - 2)
      tctx.stroke()
    }
  } else if (texture === 'chalkboard') {
    for (let i = 0; i < 40; i++) {
      const x = random() * 256
      const y = random() * 256
      const radius = 8 + random() * 26
      const grad = tctx.createRadialGradient(x, y, 0, x, y, radius)
      grad.addColorStop(0, 'rgba(210,225,215,0.055)')
      grad.addColorStop(1, 'rgba(210,225,215,0)')
      tctx.fillStyle = grad
      tctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  } else {
    for (let i = 0; i < 700; i++) {
      const value = Math.floor(random() * 70)
      tctx.fillStyle = `rgba(${value},${value},${value},0.25)`
      tctx.fillRect(random() * 256, random() * 256, 1, 1)
    }
  }
  return ctx.createPattern(tile, 'repeat')
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, background: string): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.32)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
  void background
}

export async function exportSpaceToImage(
  _project: Project,
  space: Space,
  settings: AppSettings,
  options: ExportOptions,
  onProgress: (value: number, message: string) => void
): Promise<ExportResult> {
  onProgress(0.04, 'Measuring the board')
  const bounds = contentBounds(space, { includeStrokes: true, includeHidden: false })
  const fallbackCenter = space.camera
  const worldRect: Rect = bounds
    ? expandRect(bounds, 90)
    : {
        x: fallbackCenter.x - 600,
        y: fallbackCenter.y - 400,
        w: 1200,
        h: 800
      }

  const requestedScale = Math.max(0.1, options.scale ?? 1)
  let width =
    options.width && options.width > 0
      ? Math.round(options.width)
      : options.height && options.height > 0
        ? Math.round((options.height / worldRect.h) * worldRect.w)
        : Math.ceil(worldRect.w * requestedScale)
  let height =
    options.height && options.height > 0
      ? Math.round(options.height)
      : options.width && options.width > 0
        ? Math.round((options.width / worldRect.w) * worldRect.h)
        : Math.ceil(worldRect.h * requestedScale)

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
    width = Math.floor(width * ratio)
    height = Math.floor(height * ratio)
  }
  if (width * height > MAX_PIXELS) {
    const ratio = Math.sqrt(MAX_PIXELS / (width * height))
    width = Math.floor(width * ratio)
    height = Math.floor(height * ratio)
  }
  width = Math.max(64, width)
  height = Math.max(64, height)

  onProgress(0.1, 'Preparing cards and images')
  const cardList = Object.values(space.cards)
    .filter((card) => !card.hidden)
    .filter((card) => {
      const group = card.groupId ? space.groups[card.groupId] : undefined
      return !group?.collapsed
    })
    .sort((a, b) => a.z - b.z)
  const imageCards = cardList.filter((card) => card.kind === 'image' && card.assetUrl)
  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    imageCards.map(async (card) => {
      images.set(card.id, await loadImage(card.assetUrl))
    })
  )
  const backgroundImage = await loadImage(settings.board.backgroundImage ?? undefined)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas rendering is unavailable')

  const contentScale = Math.min(width / worldRect.w, height / worldRect.h)
  const offsetX = (width - worldRect.w * contentScale) / 2
  const offsetY = (height - worldRect.h * contentScale) / 2

  if (options.includeBackground && !options.transparent) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = settings.board.background
    ctx.fillRect(0, 0, width, height)
    if (backgroundImage && settings.board.backgroundImage) {
      ctx.save()
      ctx.globalAlpha = settings.board.backgroundImageOpacity
      const ratio = Math.max(width / backgroundImage.width, height / backgroundImage.height)
      const w = backgroundImage.width * ratio
      const h = backgroundImage.height * ratio
      ctx.drawImage(backgroundImage, (width - w) / 2, (height - h) / 2, w, h)
      ctx.restore()
    }
    const texture = makeTexturePattern(ctx, settings.board.texture)
    if (texture) {
      ctx.save()
      ctx.globalAlpha = settings.board.textureOpacity
      ctx.fillStyle = texture
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    }
  }

  ctx.setTransform(contentScale, 0, 0, contentScale, offsetX - worldRect.x * contentScale, offsetY - worldRect.y * contentScale)

  if (options.includeBackground && !options.transparent && settings.ui.showGridByDefault && settings.board.grid !== 'none') {
    ctx.save()
    ctx.globalAlpha = settings.board.gridOpacity * 0.8
    ctx.fillStyle = settings.board.gridColor
    ctx.strokeStyle = settings.board.gridColor
    ctx.lineWidth = 0.8
    const step = settings.board.gridSize
    const startX = Math.ceil(worldRect.x / step) * step
    const startY = Math.ceil(worldRect.y / step) * step
    if (settings.board.grid === 'dots') {
      for (let x = startX; x < worldRect.x + worldRect.w; x += step) {
        for (let y = startY; y < worldRect.y + worldRect.h; y += step) {
          ctx.beginPath()
          ctx.arc(x, y, 1.05, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else {
      ctx.beginPath()
      for (let x = startX; x < worldRect.x + worldRect.w; x += step) {
        ctx.moveTo(x, worldRect.y)
        ctx.lineTo(x, worldRect.y + worldRect.h)
      }
      for (let y = startY; y < worldRect.y + worldRect.h; y += step) {
        ctx.moveTo(worldRect.x, y)
        ctx.lineTo(worldRect.x + worldRect.w, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
  onProgress(0.24, 'Drawing groups')

  // Groups
  const visibleCardIds = new Set(cardList.map((card) => card.id))
  const groups = Object.values(space.groups).filter((group) =>
    groupMemberCards(group.id, space.cards).some((card) => visibleCardIds.has(card.id) || card.hidden)
  )
  for (const group of groups) {
    const rect = groupBounds(group, space.cards)
    ctx.save()
    ctx.globalAlpha = 0.75
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 9)
    ctx.fillStyle = `${group.color}12`
    ctx.fill()
    ctx.strokeStyle = group.color
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = group.color
    const headerH = group.collapsed ? rect.h : 27
    ctx.globalAlpha = 0.22
    ctx.fillRect(rect.x, rect.y, rect.w, headerH)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#e9e6de'
    ctx.font = `600 11px ${settings.objects.cardFontFamily}`
    ctx.textBaseline = 'middle'
    ctx.fillText(group.title, rect.x + 10, rect.y + headerH / 2)
    ctx.restore()
  }

  onProgress(0.36, 'Laying threads')
  // Threads
  const pinColors = new Map<string, string[]>()
  if (options.includeThreads) {
    const lanes = computeThreadLanes(Object.values(space.threads).filter((thread) => !thread.hidden))
    for (const thread of Object.values(space.threads)) {
      if (thread.hidden) continue
      const from = space.cards[thread.from.cardId]
      const to = space.cards[thread.to.cardId]
      if (!from || !to) continue
      if (!visibleCardIds.has(from.id) && !from.groupId) continue
      if (!visibleCardIds.has(to.id) && !to.groupId) continue
      const geometry = threadCurveFor(thread, space, lanes.get(thread.id), settings, 1)
      if (!geometry) continue
      ctx.save()
      ctx.globalAlpha = thread.opacity ?? 1
      const path = new Path2D(geometry.path)
      if (settings.performance.shadows) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'
        ctx.lineWidth = thread.width + 0.8
        ctx.translate(0.7, 1.2)
        ctx.stroke(path)
        ctx.translate(-0.7, -1.2)
      }
      ctx.strokeStyle = thread.color
      ctx.lineWidth = thread.width
      ctx.lineCap = 'round'
      ctx.setLineDash(
        thread.style === 'dashed'
          ? [Math.max(5, thread.width * 3), Math.max(4, thread.width * 2.5)]
          : thread.style === 'dotted'
            ? [1, Math.max(5, thread.width * 2.8)]
            : []
      )
      ctx.stroke(path)
      ctx.setLineDash([])
      if (thread.label && settings.board.showThreadLabels) {
        ctx.font = `9.5px ${settings.objects.cardFontFamily}`
        const labelWidth = Math.max(26, thread.label.length * 5.7 + 12)
        roundedRect(ctx, geometry.mid.x - labelWidth / 2, geometry.mid.y - 21, labelWidth, 16, 3)
        ctx.fillStyle = 'rgba(11,12,15,0.86)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.lineWidth = 0.7
        ctx.stroke()
        ctx.fillStyle = 'rgba(233,230,222,0.86)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(thread.label, geometry.mid.x, geometry.mid.y - 13)
        ctx.textAlign = 'left'
      }
      if (options.includePins) {
        const keyFrom = `${thread.from.cardId}:${thread.from.pinId}`
        const keyTo = `${thread.to.cardId}:${thread.to.pinId}`
        pinColors.set(keyFrom, [...(pinColors.get(keyFrom) ?? []), thread.color])
        pinColors.set(keyTo, [...(pinColors.get(keyTo) ?? []), thread.color])
      }
      ctx.restore()
    }
  }

  onProgress(0.52, 'Rendering chalk and ink')
  // Drawings
  for (const stroke of Object.values(space.strokes).sort((a, b) => a.createdAt - b.createdAt)) {
    if (stroke.hidden) continue
    ctx.save()
    ctx.globalAlpha = stroke.opacity
    const path = new Path2D(
      strokeSvgPathD(
        stroke,
        settings.performance.smoothDrawing
          ? stroke.smoothing ?? settings.tools.pencil.smoothing
          : 0,
        stroke.cornerRadius ?? 0
      )
    )
    if (stroke.fill) {
      ctx.fillStyle = stroke.fill
      ctx.globalAlpha = stroke.opacity * (stroke.fillOpacity ?? 1)
      ctx.fill(path)
      ctx.globalAlpha = stroke.opacity
    }
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash(
      stroke.lineStyle === 'dashed'
        ? [Math.max(6, stroke.width * 3), Math.max(4, stroke.width * 2.4)]
        : stroke.lineStyle === 'dotted'
          ? [1, Math.max(5, stroke.width * 3)]
          : []
    )
    if (stroke.tool === 'chalk' && settings.objects.chalkTexture) {
      ctx.globalAlpha = stroke.opacity * 0.55
      ctx.stroke(path)
      ctx.globalAlpha = stroke.opacity * 0.5
      ctx.translate(0.8, 0.6)
      ctx.stroke(path)
    } else {
      ctx.stroke(path)
    }
    ctx.setLineDash([])
    const arrow = arrowHeadPathD(stroke)
    if (arrow) {
      ctx.fillStyle = stroke.color
      ctx.fill(new Path2D(arrow))
    }
    ctx.restore()
  }

  onProgress(0.64, 'Pinning cards')
  // Cards
  for (let i = 0; i < cardList.length; i++) {
    const card = cardList[i]
    drawCard(ctx, card, settings, images.get(card.id) ?? null)
    if (i % 30 === 0) {
      onProgress(0.64 + (i / Math.max(1, cardList.length)) * 0.28, `Rendering cards ${i + 1}/${cardList.length}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  if (options.includeThreads && options.includePins) {
    for (const [key, colors] of pinColors) {
      const [cardId, pinId] = key.split(':')
      const card = space.cards[cardId]
      if (!card || !pinId) continue
      const group = card.groupId ? space.groups[card.groupId] : undefined
      if (group?.collapsed) continue
      const point = pinPoint(card, pinId)
      ctx.save()
      ctx.beginPath()
      ctx.arc(point.x, point.y, 4.6, 0, Math.PI * 2)
      ctx.fillStyle = '#231d16'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(point.x, point.y, 3.1, 0, Math.PI * 2)
      ctx.fillStyle = colors[0] ?? settings.objects.pinColor
      ctx.fill()
      ctx.beginPath()
      ctx.arc(point.x - 0.9, point.y - 1.1, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fill()
      ctx.restore()
    }
  }

  if (options.includeBackground && !options.transparent && settings.board.vignette) {
    drawVignette(ctx, width, height, settings.board.background)
  }

  onProgress(0.97, 'Encoding image')
  const format = options.format ?? 'png'
  const quality = format === 'png' ? undefined : Math.max(0.1, Math.min(1, options.quality ?? 0.92))
  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  const dataUrl = canvas.toDataURL(mime, quality)
  onProgress(1, 'Done')
  return { dataUrl, width, height }
}

export async function exportSpaceToPdf(
  project: Project,
  space: Space,
  settings: AppSettings,
  options: ExportOptions,
  onProgress: (value: number, message: string) => void
): Promise<Uint8Array> {
  const result = await exportSpaceToImage(
    project,
    space,
    settings,
    { ...options, format: 'png' },
    (value, message) => onProgress(value * 0.82, message)
  )
  onProgress(0.88, 'Building PDF')
  const { jsPDF } = await import('jspdf')
  const orientation = result.width >= result.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [result.width, result.height],
    hotfixes: ['px_scaling'],
    compress: true
  })
  pdf.addImage(result.dataUrl, 'PNG', 0, 0, result.width, result.height, undefined, 'FAST')
  onProgress(0.98, 'Writing PDF')
  const buffer = pdf.output('arraybuffer')
  onProgress(1, 'Done')
  return new Uint8Array(buffer)
}

/** Used by the export panel to show a useful estimate before rendering. */
export function estimateExport(space: Space, scale: number): { width: number; height: number } {
  const bounds = contentBounds(space, { includeStrokes: true })
  if (!bounds) return { width: Math.round(1200 * scale), height: Math.round(800 * scale) }
  const rect = expandRect(bounds, 90)
  return { width: Math.round(rect.w * scale), height: Math.round(rect.h * scale) }
}

export function exportBounds(space: Space): { width: number; height: number } {
  const bounds = contentBounds(space, { includeStrokes: true })
  if (!bounds) return { width: 1200, height: 800 }
  const rect = expandRect(bounds, 90)
  return { width: Math.round(rect.w), height: Math.round(rect.h) }
}
