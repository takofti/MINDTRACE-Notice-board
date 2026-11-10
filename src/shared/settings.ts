/* ------------------------------------------------------------------ *
 * Settings schema. Every value here is consumed by the application —
 * there are no decorative toggles. Unknown keys survive round-trips so
 * future versions can add options without breaking older files.
 * ------------------------------------------------------------------ */

export type ThemeMode = 'dark' | 'light'
export type TextureId = 'graphite' | 'cork' | 'linen' | 'paper' | 'chalkboard' | 'none'
export type GridType = 'none' | 'dots' | 'lines' | 'squares'
export type Density = 'compact' | 'comfortable'
export type Quality = 'high' | 'balanced' | 'low'
export type ImageQuality = 'high' | 'medium' | 'low'
export type PinVisibility = 'hover' | 'always' | 'connected'
export type DecorAction =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'search'
  | 'escape'
  | 'selectAll'
  | 'group'
  | 'newNote'
  | 'newText'
  | 'fitBoard'
  | 'resetZoom'
  | 'toggleMode'
  | 'save'
  | 'toggleGrid'
  | 'toggleMinimap'
  | 'settings'
  | 'export'

export const DECOR_ACTIONS: { id: DecorAction; label: string }[] = [
  { id: 'undo', label: 'Undo' },
  { id: 'redo', label: 'Redo' },
  { id: 'copy', label: 'Copy selection' },
  { id: 'paste', label: 'Paste' },
  { id: 'duplicate', label: 'Duplicate selection' },
  { id: 'delete', label: 'Delete selection' },
  { id: 'search', label: 'Quick search' },
  { id: 'escape', label: 'Cancel / deselect' },
  { id: 'selectAll', label: 'Select all' },
  { id: 'group', label: 'Group selection' },
  { id: 'newNote', label: 'New note' },
  { id: 'newText', label: 'New text card' },
  { id: 'fitBoard', label: 'Fit board' },
  { id: 'resetZoom', label: 'Zoom to 100%' },
  { id: 'toggleMode', label: 'Cycle view mode' },
  { id: 'save', label: 'Save now' },
  { id: 'toggleGrid', label: 'Toggle grid' },
  { id: 'toggleMinimap', label: 'Toggle minimap' },
  { id: 'settings', label: 'Open settings' },
  { id: 'export', label: 'Export board' }
]

export const DEFAULT_KEYBINDINGS: Record<DecorAction, string> = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  duplicate: 'Ctrl+D',
  delete: 'Delete',
  search: 'Ctrl+K',
  escape: 'Escape',
  selectAll: 'Ctrl+A',
  group: 'Ctrl+G',
  newNote: 'N',
  newText: 'T',
  fitBoard: 'Ctrl+0',
  resetZoom: 'Ctrl+1',
  toggleMode: 'F',
  save: 'Ctrl+S',
  toggleGrid: 'Shift+G',
  toggleMinimap: 'Shift+M',
  settings: 'Ctrl+,',
  export: 'Ctrl+E'
}

export interface BoardSettings {
  background: string
  backgroundImage: string | null
  backgroundImageOpacity: number
  texture: TextureId
  textureOpacity: number
  grid: GridType
  gridSize: number
  gridColor: string
  gridOpacity: number
  vignette: boolean
  showMinimap: boolean
  threadDim: number
  cardLabelsAtLowZoom: boolean
  lodThreshold: number
  reduceThreadOverlap: boolean
  showThreadLabels: boolean
}

export interface ObjectSettings {
  cardWidth: number
  cardHeight: number
  cardRadius: number
  cardBackground: string
  cardText: string
  cardBorder: string
  cardShadow: boolean
  cardOpacity: number
  cardFontSize: number
  cardFontFamily: string
  noteWidth: number
  noteHeight: number
  noteColor: string
  noteText: string
  noteFontSize: number
  threadColor: string
  threadWidth: number
  threadStyle: 'thread' | 'dashed' | 'dotted'
  threadCurve: number
  threadOpacity: number
  threadGlow: boolean
  pinSize: number
  pinColor: string
  pinShape: 'dot' | 'round' | 'square'
  pinVisibility: PinVisibility
  textFontFamily: string
  textFontSize: number
  textLineHeight: number
  drawColor: string
  drawWidth: number
  drawOpacity: number
  drawSmoothing: number
  chalkTexture: boolean
  imageFit: 'cover' | 'contain'
}

export interface InterfaceSettings {
  theme: ThemeMode
  accent: string
  density: Density
  uiScale: number
  animations: boolean
  reducedMotion: boolean
  showToolRail: boolean
  showInspector: boolean
  inspectorSide: 'left' | 'right'
  showMinimap: boolean
  showHints: boolean
  showGridByDefault: boolean
  iconScale: number
  panelOpacity: number
}

export interface InteractionSettings {
  zoomSensitivity: number
  invertZoom: boolean
  wheelModifier: 'none' | 'ctrl'
  middleButtonPan: boolean
  spaceToPan: boolean
  doubleClickCreate: boolean
  doubleClickCardEdit: boolean
  snapToGrid: boolean
  snapSize: number
  marqueeMode: 'intersect' | 'contain'
  dragThreshold: number
  connectionTarget: 'nearest' | 'pin'
  focusDepth: number
  autoRevealPins: boolean
  showLinkPreview: boolean
  scrollSpeed: number
  keybindings: Record<DecorAction, string>
}

export interface PerformanceSettings {
  quality: Quality
  shadows: boolean
  blur: boolean
  effects: boolean
  imageQuality: ImageQuality
  cullOffscreen: boolean
  cullMargin: number
  maxVisibleCards: number
  minimapFps: number
  smoothDrawing: boolean
}

export interface DataSettings {
  autosave: boolean
  autosaveInterval: number
  backups: number
  snapshotOnImport: boolean
  snapshotOnSpaceDelete: boolean
  exportScale: number
  exportIncludeBackground: boolean
  exportThreads: boolean
  exportPins: boolean
  maxUndo: number
  lastProjectId: string | null
}

export interface AppSettings {
  version: number
  board: BoardSettings
  objects: ObjectSettings
  ui: InterfaceSettings
  interaction: InteractionSettings
  performance: PerformanceSettings
  data: DataSettings
}

export const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  board: {
    background: '#17181c',
    backgroundImage: null,
    backgroundImageOpacity: 0.35,
    texture: 'cork',
    textureOpacity: 0.5,
    grid: 'dots',
    gridSize: 48,
    gridColor: '#8b949e',
    gridOpacity: 0.16,
    vignette: true,
    showMinimap: true,
    threadDim: 0.72,
    cardLabelsAtLowZoom: true,
    lodThreshold: 0.38,
    reduceThreadOverlap: true,
    showThreadLabels: true
  },
  objects: {
    cardWidth: 320,
    cardHeight: 210,
    cardRadius: 10,
    cardBackground: '#24262c',
    cardText: '#e8e6df',
    cardBorder: '#3a3d45',
    cardShadow: true,
    cardOpacity: 1,
    cardFontSize: 14,
    cardFontFamily: 'Inter, Segoe UI, sans-serif',
    noteWidth: 240,
    noteHeight: 200,
    noteColor: '#e8c56a',
    noteText: '#24211a',
    noteFontSize: 16,
    threadColor: '#b33a3a',
    threadWidth: 2,
    threadStyle: 'thread',
    threadCurve: 0.3,
    threadOpacity: 0.95,
    threadGlow: true,
    pinSize: 9,
    pinColor: '#d7c9a7',
    pinShape: 'round',
    pinVisibility: 'hover',
    textFontFamily: 'Inter, Segoe UI, sans-serif',
    textFontSize: 14,
    textLineHeight: 1.5,
    drawColor: '#e9e6dd',
    drawWidth: 3,
    drawOpacity: 0.85,
    drawSmoothing: 0.5,
    chalkTexture: true,
    imageFit: 'cover'
  },
  ui: {
    theme: 'dark',
    accent: '#c8553d',
    density: 'comfortable',
    uiScale: 1,
    animations: true,
    reducedMotion: false,
    showToolRail: true,
    showInspector: true,
    inspectorSide: 'right',
    showMinimap: true,
    showHints: true,
    showGridByDefault: true,
    iconScale: 1,
    panelOpacity: 0.92
  },
  interaction: {
    zoomSensitivity: 1,
    invertZoom: false,
    wheelModifier: 'none',
    middleButtonPan: true,
    spaceToPan: true,
    doubleClickCreate: true,
    doubleClickCardEdit: true,
    snapToGrid: false,
    snapSize: 24,
    marqueeMode: 'intersect',
    dragThreshold: 4,
    connectionTarget: 'nearest',
    focusDepth: 1,
    autoRevealPins: true,
    showLinkPreview: true,
    scrollSpeed: 1,
    keybindings: { ...DEFAULT_KEYBINDINGS }
  },
  performance: {
    quality: 'high',
    shadows: true,
    blur: true,
    effects: true,
    imageQuality: 'high',
    cullOffscreen: true,
    cullMargin: 480,
    maxVisibleCards: 900,
    minimapFps: 20,
    smoothDrawing: true
  },
  data: {
    autosave: true,
    autosaveInterval: 1200,
    backups: 15,
    snapshotOnImport: true,
    snapshotOnSpaceDelete: true,
    exportScale: 2,
    exportIncludeBackground: true,
    exportThreads: true,
    exportPins: true,
    maxUndo: 60,
    lastProjectId: null
  }
}

/** Deep-merge a stored settings object with defaults, preserving unknown keys. */
export function mergeSettings(raw: unknown): AppSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const merge = <T extends Record<string, unknown>>(base: T, incoming: unknown): T => {
    if (!incoming || typeof incoming !== 'object') return { ...base }
    const out: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      const existing = out[key]
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        out[key] = merge(existing as Record<string, unknown>, value)
      } else if (value !== undefined) {
        out[key] = value
      }
    }
    return out as T
  }
  const merged = merge(DEFAULT_SETTINGS as unknown as Record<string, unknown>, source)
  merged.version = SETTINGS_VERSION
  return merged as unknown as AppSettings
}

export interface SettingsFile {
  settings: AppSettings
  profiles: { id: string; name: string; createdAt: number; settings: AppSettings }[]
}

export function cloneSettings(settings: AppSettings): AppSettings {
  return structuredClone(settings)
}
