import type {
  Card,
  CardKind,
  Category,
  Group,
  Pin,
  Project,
  Space,
  Stroke,
  Thread
} from '@shared/types'
import { PROJECT_FORMAT_VERSION } from '@shared/types'
import type { AppSettings } from '@shared/settings'
import { uid } from './id'

export const CARD_PALETTE = [
  '#24262c',
  '#2b2f36',
  '#3b3033',
  '#2c3a35',
  '#3a352a',
  '#343043',
  '#4a2f2f',
  '#e8c56a',
  '#e6a4b4',
  '#a8c8b6',
  '#9db8d2',
  '#d9d2c3'
]

export const THREAD_PALETTE = [
  '#b33a3a',
  '#d9d4c7',
  '#5b8db8',
  '#c99a3d',
  '#6e9c73',
  '#a06aa8',
  '#d4753f',
  '#2f2f33'
]

export const NOTE_PALETTE = ['#e8c56a', '#e7a4b2', '#a9cbb6', '#9fbfdc', '#d8cfc0', '#d8a77a']
export const LABEL_PALETTE = ['#b33a3a', '#c99a3d', '#5b8db8', '#6e9c73', '#a06aa8', '#8a8f98']

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_important', name: 'Important', color: '#c8553d' },
  { id: 'cat_ideas', name: 'Ideas', color: '#c99a3d' },
  { id: 'cat_questions', name: 'Questions', color: '#5b8db8' },
  { id: 'cat_verify', name: 'Verify', color: '#6e9c73' },
  { id: 'cat_done', name: 'Done', color: '#8a8f98' }
]

export function newSpace(name: string, camera = { x: 0, y: 0, zoom: 1 }): Space {
  const now = Date.now()
  return {
    id: uid('sp'),
    name,
    description: '',
    camera,
    cards: {},
    threads: {},
    strokes: {},
    groups: {},
    createdAt: now,
    updatedAt: now
  }
}

export function newProject(name = 'Untitled project'): Project {
  const space = newSpace('Board 01')
  const now = Date.now()
  return {
    format: PROJECT_FORMAT_VERSION,
    id: uid('local'),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    activeSpaceId: space.id,
    spaces: [space],
    categories: structuredClone(DEFAULT_CATEGORIES)
  }
}

export function defaultCardSize(kind: CardKind, settings: AppSettings): { w: number; h: number } {
  switch (kind) {
    case 'note':
      return { w: settings.tools.note.width, h: settings.tools.note.height }
    case 'image':
      return { w: 360, h: 280 }
    case 'video':
      return { w: 430, h: 300 }
    case 'audio':
      return { w: 370, h: 132 }
    case 'pdf':
      return { w: 430, h: 540 }
    case 'doc':
      return { w: 400, h: 440 }
    case 'file':
      return { w: 320, h: 148 }
    case 'link':
      return { w: 330, h: 190 }
    default:
      return { w: settings.objects.cardWidth, h: settings.objects.cardHeight }
  }
}

export interface NewCardOptions {
  at: { x: number; y: number }
  settings: AppSettings
  title?: string
  body?: string
  assetUrl?: string
  assetName?: string
  mime?: string
  caption?: string
  color?: string
  categories?: string[]
  w?: number
  h?: number
  groupId?: string
  z?: number
}

export function newCard(kind: CardKind, opts: NewCardOptions): Card {
  const size = defaultCardSize(kind, opts.settings)
  const w = opts.w ?? size.w
  const h = opts.h ?? size.h
  const now = Date.now()
  const title = opts.title ?? defaultTitle(kind)
  return {
    id: uid('card'),
    kind,
    x: Math.round(opts.at.x - w / 2),
    y: Math.round(opts.at.y - h / 2),
    w,
    h,
    z: opts.z ?? 1,
    title,
    body: opts.body ?? defaultBody(kind),
    assetUrl: opts.assetUrl,
    assetName: opts.assetName,
    mime: opts.mime,
    caption: opts.caption,
    color:
      opts.color ??
      (kind === 'note'
        ? opts.settings.tools.note.color
        : kind === 'text'
          ? opts.settings.objects.cardBackground
          : undefined),
    style: {
      radius: opts.settings.objects.cardRadius,
      shadow: opts.settings.objects.cardShadow,
      opacity: opts.settings.objects.cardOpacity,
      fontSize:
        kind === 'note'
          ? opts.settings.tools.note.fontSize
          : kind === 'text'
            ? opts.settings.tools.text.fontSize
            : opts.settings.objects.cardFontSize,
      fontFamily:
        kind === 'note'
          ? opts.settings.objects.textFontFamily
          : kind === 'text'
            ? opts.settings.tools.text.fontFamily
            : opts.settings.objects.cardFontFamily,
      color: kind === 'text' ? opts.settings.tools.text.color : undefined,
      align: kind === 'text' ? opts.settings.tools.text.align : undefined,
      bold: kind === 'text' ? opts.settings.tools.text.bold : undefined,
      italic: kind === 'text' ? opts.settings.tools.text.italic : undefined,
      lineHeight: kind === 'text' ? opts.settings.tools.text.lineHeight : undefined,
      imageFit: opts.settings.objects.imageFit
    },
    categories: opts.categories ?? [],
    pins: [],
    groupId: opts.groupId,
    createdAt: now,
    updatedAt: now
  }
}

function defaultTitle(kind: CardKind): string {
  switch (kind) {
    case 'text':
      return 'New card'
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'pdf':
      return 'PDF document'
    case 'doc':
      return 'Document'
    case 'file':
      return 'File'
    case 'link':
      return 'Link'
    default:
      return ''
  }
}

function defaultBody(kind: CardKind): string {
  if (kind === 'text' || kind === 'note') return '<p></p>'
  return ''
}

export function customPin(x: number, y: number): Pin {
  return { id: uid('pin'), x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}

export interface NewThreadOptions {
  color?: string
  width?: number
  style?: Thread['style']
  curve?: number
  label?: string
  opacity?: number
}

export function newThread(
  from: { cardId: string; pinId: string },
  to: { cardId: string; pinId: string },
  settings: AppSettings,
  opts: NewThreadOptions = {}
): Thread {
  const tool = settings.tools.thread
  return {
    id: uid('thr'),
    from,
    to,
    color: opts.color ?? tool.color,
    width: opts.width ?? tool.width,
    style:
      opts.style ??
      (tool.lineStyle === 'dashed' ? 'dashed' : tool.lineStyle === 'dotted' ? 'dotted' : 'thread'),
    label: opts.label,
    curve: opts.curve ?? tool.curve,
    opacity: opts.opacity ?? tool.opacity,
    visualStyle: tool.visualStyle,
    connectionType: tool.connectionType,
    lineStyle: tool.lineStyle,
    createdAt: Date.now()
  }
}

export function classifyFile(name: string, mime: string): CardKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg'].includes(ext)) {
    return 'image'
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio'
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === 'docx' || ext === 'doc' || mime.includes('word')) return 'doc'
  if (ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'csv') return 'doc'
  return 'file'
}

export function makeGroup(title: string, color = '#c99a3d'): Group {
  return { id: uid('grp'), title, color, collapsed: false, createdAt: Date.now() }
}

/** Utility used by the demo board and tests. */
export function demoStroke(
  tool: Stroke['tool'],
  points: number[],
  color: string,
  width = 3,
  opacity = 0.8
): Stroke {
  return {
    id: uid('str'),
    tool,
    color,
    width,
    opacity,
    points,
    seed: Math.random() * 1000,
    createdAt: Date.now()
  }
}
