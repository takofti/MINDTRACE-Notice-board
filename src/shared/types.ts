/* ------------------------------------------------------------------ *
 * Shared data model — used by the main process, preload and renderer.
 * The model is deliberately plain JSON so projects can be exported,
 * migrated and inspected without any runtime dependency.
 * ------------------------------------------------------------------ */

import type { AppSettings } from './settings'

export const PROJECT_FORMAT_VERSION = 2

export type CardKind =
  | 'text'
  | 'note'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'doc'
  | 'file'
  | 'link'

export type ThreadStyle = 'thread' | 'dashed' | 'dotted'
export type PinShape = 'dot' | 'round' | 'square'
export type SpaceMode = 'normal' | 'focus' | 'overview'
export type ToolId =
  | 'select'
  | 'hand'
  | 'note'
  | 'text'
  | 'chalk'
  | 'marker'
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'thread'

/** Anchor ids are stable, implicit positions around a card perimeter. */
export const ANCHOR_IDS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type AnchorId = (typeof ANCHOR_IDS)[number]

/** A custom pin attached anywhere on a card. Coordinates are 0..1. */
export interface Pin {
  id: string
  x: number
  y: number
}

export interface CardStyle {
  background?: string
  color?: string
  borderColor?: string
  radius?: number
  shadow?: boolean
  opacity?: number
  fontSize?: number
  fontFamily?: string
  align?: 'left' | 'center' | 'right'
  imageFit?: 'cover' | 'contain'
  bold?: boolean
  italic?: boolean
  lineHeight?: number
}

export interface Card {
  id: string
  kind: CardKind
  x: number
  y: number
  w: number
  h: number
  z: number
  title: string
  /** Sanitised HTML for text/note cards. */
  body: string
  /** Persistent asset reference (`mtasset://…`) or remote URL for links. */
  assetUrl?: string
  assetName?: string
  mime?: string
  caption?: string
  color?: string
  style?: CardStyle
  categories: string[]
  pins: Pin[]
  groupId?: string
  locked?: boolean
  hidden?: boolean
  createdAt: number
  updatedAt: number
}

export interface ThreadEnd {
  cardId: string
  pinId: string
}

export interface Thread {
  id: string
  from: ThreadEnd
  to: ThreadEnd
  color: string
  width: number
  style: ThreadStyle
  label?: string
  curve: number
  opacity?: number
  hidden?: boolean
  visualStyle?: 'minimal' | 'neon' | 'realistic'
  connectionType?: 'curved' | 'straight' | 'elbow'
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  createdAt: number
}

export type StrokeTool = 'chalk' | 'marker' | 'pencil' | 'line' | 'arrow' | 'rect' | 'ellipse'

/**
 * Freehand strokes store a flat [x,y,x,y,…] array. Shape tools use the
 * first and last points as their bounds. `seed` keeps chalk texture stable.
 */
export interface Stroke {
  id: string
  tool: StrokeTool
  color: string
  width: number
  opacity: number
  points: number[]
  seed: number
  locked?: boolean
  hidden?: boolean
  fill?: string
  fillOpacity?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  cornerRadius?: number
  smoothing?: number
  createdAt: number
}

export interface Group {
  id: string
  title: string
  color: string
  collapsed: boolean
  locked?: boolean
  /** Cards are members when `card.groupId === group.id`. */
  createdAt: number
}

export interface Category {
  id: string
  name: string
  color: string
}

export interface Camera {
  /** World coordinate displayed at the centre of the viewport. */
  x: number
  y: number
  zoom: number
}

export interface Space {
  id: string
  name: string
  description: string
  camera: Camera
  cards: Record<string, Card>
  threads: Record<string, Thread>
  strokes: Record<string, Stroke>
  groups: Record<string, Group>
  createdAt: number
  updatedAt: number
}

export interface Project {
  format: number
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  activeSpaceId: string
  spaces: Space[]
  categories: Category[]
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  cardCount: number
  spaceCount: number
  /** Path of the project folder, for diagnostics. */
  path?: string
}

export interface TemplateSummary {
  id: string
  name: string
  description: string
  createdAt: number
  cardCount: number
  spaceCount: number
  custom: boolean
}

export interface StorageSnapshot {
  file: string
  createdAt: number
  size: number
}

export interface SettingsProfile {
  id: string
  name: string
  createdAt: number
  settings: AppSettings
}

export interface ProjectFile {
  /** Saved project. `null` means the project file is missing. */
  project: Project | null
  snapshots: StorageSnapshot[]
  recovery?: Project | null
  recoveryAt?: number
}

/* ----------------------------- clipboard ---------------------------- */

export interface ClipboardPayload {
  cards: Card[]
  threads: Thread[]
  groups: Group[]
  strokes: Stroke[]
  categoryIds: string[]
  sourceSpaceId: string
}

/* ------------------------------ geometry ---------------------------- */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}
