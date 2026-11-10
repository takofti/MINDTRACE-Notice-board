import { useEffect, useRef, useState } from 'react'
import {
  Database,
  Gauge,
  Layers,
  LayoutGrid,
  MousePointer2,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Tag,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import type { SettingsProfile, StorageSnapshot } from '@shared/types'
import { DECOR_ACTIONS, DEFAULT_KEYBINDINGS, type DecorAction, type TextureId } from '@shared/settings'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import {
  chooseDataFolder,
  createSnapshot,
  getAppInfo,
  listSnapshots,
  openDataFolder,
  restoreSnapshot
} from '@/services/storage'
import { openProjectById } from '@/services/bootstrap'
import { formatBytes, formatDate } from '@/core/geometry'

type Tab = 'board' | 'objects' | 'interface' | 'interaction' | 'performance' | 'data' | 'categories' | 'presets'

const TABS: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: 'board', label: 'Board surface', icon: LayoutGrid },
  { id: 'objects', label: 'Objects', icon: Layers },
  { id: 'interface', label: 'Interface', icon: Palette },
  { id: 'interaction', label: 'Interaction', icon: MousePointer2 },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'data', label: 'Data & backups', icon: Database },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'presets', label: 'Profiles & reset', icon: SlidersHorizontal }
]

const TEXTURES: { id: TextureId; label: string }[] = [
  { id: 'cork', label: 'Cork' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'linen', label: 'Linen' },
  { id: 'paper', label: 'Paper' },
  { id: 'chalkboard', label: 'Chalkboard' },
  { id: 'none', label: 'Flat' }
]

export default function SettingsDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const payload = useUi((state) => state.modalPayload)
  const close = useUi((state) => state.closeModal)
  const toast = useUi((state) => state.toast)
  const ask = useUi((state) => state.ask)
  const update = useSettings((state) => state.update)
  const profiles = useSettings((state) => state.profiles)
  const project = useBoard((state) => state.project)
  const [tab, setTab] = useState<Tab>('board')
  const [advanced, setAdvanced] = useState(false)
  const [snapshots, setSnapshots] = useState<StorageSnapshot[]>([])
  const [dataDir, setDataDir] = useState('')
  const [profileName, setProfileName] = useState('')
  const [recording, setRecording] = useState<DecorAction | null>(null)
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const keyHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null)

  useEffect(() => {
    if (modal !== 'settings') return
    const valid = TABS.some((item) => item.id === payload)
    setTab(valid ? (payload as Tab) : 'board')
    setAdvanced(false)
  }, [modal, payload])

  useEffect(() => {
    if (modal !== 'settings' || tab !== 'data') return
    let alive = true
    void getAppInfo().then((info) => alive && setDataDir(info.dataDir))
    if (project) {
      void listSnapshots(project.id).then((list) => alive && setSnapshots(list))
    }
    return () => {
      alive = false
    }
  }, [modal, tab, project?.id])

  useEffect(() => {
    if (!recording) {
      if (keyHandlerRef.current) {
        window.removeEventListener('keydown', keyHandlerRef.current, true)
        keyHandlerRef.current = null
      }
      return
    }
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecording(null)
        return
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
      const parts: string[] = []
      if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
      if (event.altKey) parts.push('Alt')
      if (event.shiftKey) parts.push('Shift')
      let key = event.key
      if (key === ' ') key = 'Space'
      else if (key === 'Escape') key = 'Escape'
      else if (key.length === 1) key = key.toUpperCase()
      parts.push(key)
      const combo = parts.join('+')
      const current = useSettings.getState().settings.interaction.keybindings
      const duplicate = (Object.keys(current) as DecorAction[]).find(
        (action) => action !== recording && current[action].toLowerCase() === combo.toLowerCase()
      )
      if (duplicate) {
        toast(`“${combo}” is already used by ${DECOR_ACTIONS.find((item) => item.id === duplicate)?.label}.`, 'error')
        setRecording(null)
        return
      }
      useSettings.getState().update('interaction', {
        keybindings: { ...current, [recording]: combo }
      })
      setRecording(null)
    }
    keyHandlerRef.current = handler
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      keyHandlerRef.current = null
    }
  }, [recording, toast])

  if (modal !== 'settings') return null

  const readBackground = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const max = 2000
        const scale = Math.min(1, max / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        update('board', { backgroundImage: canvas.toDataURL('image/jpeg', 0.86) })
        toast('Board background updated', 'success', 1600)
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const refreshSnapshots = async (): Promise<void> => {
    if (!project) return
    setSnapshots(await listSnapshots(project.id))
  }

  const takeSnapshot = async (label?: string): Promise<void> => {
    if (!project) return
    setSnapshotBusy(true)
    try {
      const result = await createSnapshot(project.id, label)
      if (!result.ok) throw new Error(result.error ?? 'Could not create snapshot')
      await refreshSnapshots()
      toast('Snapshot saved', 'success', 1600)
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setSnapshotBusy(false)
    }
  }

  const restore = (file: string): void => {
    if (!project) return
    ask({
      title: 'Restore this snapshot?',
      message:
        'The current board will first be copied to a backup, then replaced with this snapshot. Your project name and spaces are preserved by the snapshot.',
      confirmLabel: 'Restore snapshot',
      action: async () => {
        const restored = await restoreSnapshot(project.id, file)
        if (!restored.project) throw new Error('Snapshot could not be restored')
        await openProjectById(project.id)
        await refreshSnapshots()
        toast('Snapshot restored', 'success')
      }
    })
  }

  const saveProfile = (): void => {
    if (!profileName.trim()) return
    useSettings.getState().saveProfile(profileName)
    setProfileName('')
    toast('Profile saved', 'success', 1400)
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="dialog-head">
          <div className="head-icon">
            <Settings size={17} />
          </div>
          <div>
            <h2>Settings</h2>
            <p>Every option here changes the board immediately. Changes are saved automatically.</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title="Close settings">
            <X size={15} />
          </button>
        </div>

        <div className="settings-main">
          <nav className="settings-nav">
            {TABS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={tab === item.id ? 'is-active' : ''}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
            <div className="nav-sep" />
            <button className={advanced ? 'is-active' : ''} onClick={() => setAdvanced(!advanced)}>
              <SlidersHorizontal size={14} />
              Advanced options
            </button>
            <div className="nav-note">
              Shortcuts can be remapped. Quality settings reduce GPU work on slower machines without
              changing your board.
            </div>
          </nav>

          <div className="settings-content" data-advanced={advanced ? 'true' : 'false'}>
            {tab === 'board' && <BoardSettings readBackground={readBackground} fileInputRef={fileInputRef} />}
            {tab === 'objects' && <ObjectSettings />}
            {tab === 'interface' && <InterfaceSettings />}
            {tab === 'interaction' && (
              <InteractionSettings
                recording={recording}
                setRecording={setRecording}
                advanced={advanced}
              />
            )}
            {tab === 'performance' && <PerformanceSettings advanced={advanced} />}
            {tab === 'data' && (
              <DataSettings
                dataDir={dataDir}
                snapshots={snapshots}
                snapshotBusy={snapshotBusy}
                takeSnapshot={takeSnapshot}
                restore={restore}
                refreshSnapshots={refreshSnapshots}
              />
            )}
            {tab === 'categories' && <CategorySettings />}
            {tab === 'presets' && (
              <ProfileSettings
                profiles={profiles}
                profileName={profileName}
                setProfileName={setProfileName}
                saveProfile={saveProfile}
              />
            )}
          </div>
        </div>

        <div className="dialog-foot">
          <div className="left">
            <span className="kbd">Esc</span> closes · settings save automatically
          </div>
          <button className="btn btn-sm" onClick={() => useSettings.getState().resetAll()}>
            <RotateCcw size={11} /> Reset all
          </button>
          <button className="btn btn-primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ shared rows ------------------------------ */

function SettingRow({
  title,
  description,
  children,
  advanced
}: {
  title: string
  description?: string
  children: React.ReactNode
  advanced?: boolean
}): React.JSX.Element {
  return (
    <div className={`setting-row ${advanced ? 'advanced-only' : ''}`}>
      <div className="setting-label">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }): React.JSX.Element {
  return (
    <button
      className={`toggle ${value ? 'is-on' : ''}`}
      onClick={() => onChange(!value)}
      aria-label={label}
      aria-pressed={value}
    />
  )
}

function NumberSlider({
  value,
  min,
  max,
  step,
  onChange,
  format
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
}): React.JSX.Element {
  return (
    <div className="range-wrap">
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="range-value">{format ? format(value) : value}</span>
    </div>
  )
}

function ColorControl({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="color-pair">
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
      <input
        type="color"
        className="color-input"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Choose colour"
      />
    </div>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: string | number
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <select className="select" value={String(value)} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/* -------------------------------- board ---------------------------------- */

function BoardSettings({
  readBackground,
  fileInputRef
}: {
  readBackground: (file: File) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const board = settings.board
  const ui = settings.ui

  return (
    <>
      <section className="settings-section">
        <h3>Surface</h3>
        <p>The board should feel like something you can touch, not a blank web page.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">Background colour</span>
              <ColorControl value={board.background} onChange={(value) => update('board', { background: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Texture</span>
              <Select
                value={board.texture}
                onChange={(value) => update('board', { texture: value as TextureId })}
                options={TEXTURES.map((texture) => ({ value: texture.id, label: texture.label }))}
              />
            </div>
            <div className="full">
              <div className="background-preview" style={{ background: board.background }}>
                <div
                  className={`board-texture texture-${board.texture}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: board.textureOpacity,
                    mixBlendMode: 'soft-light'
                  }}
                />
                <span>BOARD SURFACE PREVIEW</span>
              </div>
            </div>
            <SettingRow title="Texture strength" description="How strongly the material grain shows.">
              <NumberSlider
                value={board.textureOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => update('board', { textureOpacity: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </SettingRow>
            <SettingRow title="Vignette" description="Slightly darkens the edges of the board.">
              <Toggle value={board.vignette} onChange={(value) => update('board', { vignette: value })} label="Vignette" />
            </SettingRow>
            <div className="full" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) readBackground(file)
                  event.currentTarget.value = ''
                }}
              />
              <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={11} /> Use an image
              </button>
              {board.backgroundImage && (
                <button className="btn btn-sm btn-danger" onClick={() => update('board', { backgroundImage: null })}>
                  Remove image
                </button>
              )}
              <span className="hint-text" style={{ alignSelf: 'center' }}>
                Images are resized to 2000 px and stored with your settings.
              </span>
            </div>
            {board.backgroundImage && (
              <div className="full">
                <SettingRow title="Image opacity" description="Keep it subtle so cards remain dominant.">
                  <NumberSlider
                    value={board.backgroundImageOpacity}
                    min={0.05}
                    max={1}
                    step={0.05}
                    onChange={(value) => update('board', { backgroundImageOpacity: value })}
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                </SettingRow>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Grid</h3>
        <p>Dots are quiet. Lines are precise. Nothing is required.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">Pattern</span>
              <Select
                value={board.grid}
                onChange={(value) => update('board', { grid: value as typeof board.grid })}
                options={[
                  { value: 'none', label: 'No grid' },
                  { value: 'dots', label: 'Dots' },
                  { value: 'lines', label: 'Lines' },
                  { value: 'squares', label: 'Squares' }
                ]}
              />
            </div>
            <div className="field-col">
              <span className="field-label">Colour</span>
              <ColorControl value={board.gridColor} onChange={(value) => update('board', { gridColor: value })} />
            </div>
            <SettingRow title="Spacing" description="Grid size in board units.">
              <NumberSlider
                value={board.gridSize}
                min={16}
                max={160}
                step={4}
                onChange={(value) => update('board', { gridSize: value })}
                format={(value) => `${value}px`}
              />
            </SettingRow>
            <SettingRow title="Opacity" description="Grid visibility.">
              <NumberSlider
                value={board.gridOpacity}
                min={0}
                max={0.6}
                step={0.02}
                onChange={(value) => update('board', { gridOpacity: value })}
                format={(value) => value.toFixed(2)}
              />
            </SettingRow>
            <SettingRow title="Show grid by default" description="The Shift+G shortcut toggles this live.">
              <Toggle
                value={ui.showGridByDefault}
                onChange={(value) => update('ui', { showGridByDefault: value })}
                label="Show grid"
              />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Readability</h3>
        <p>Cards always come first. These controls keep a dense board legible.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Readable labels when zoomed out" description="Replace tiny card contents with screen-sized titles.">
              <Toggle
                value={board.cardLabelsAtLowZoom}
                onChange={(value) => update('board', { cardLabelsAtLowZoom: value })}
                label="Low-zoom labels"
              />
            </SettingRow>
            <SettingRow title="Simplified view below zoom" description="Zoom threshold for reducing card detail.">
              <NumberSlider
                value={board.lodThreshold}
                min={0.15}
                max={0.75}
                step={0.01}
                onChange={(value) => update('board', { lodThreshold: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </SettingRow>
            <SettingRow title="Dim unrelated threads" description="When a card is selected, unrelated threads fade but stay visible." advanced>
              <NumberSlider
                value={board.threadDim}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(value) => update('board', { threadDim: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </SettingRow>
            <SettingRow title="Thread labels" description="Show labels written on connections." advanced>
              <Toggle
                value={board.showThreadLabels}
                onChange={(value) => update('board', { showThreadLabels: value })}
                label="Thread labels"
              />
            </SettingRow>
            <SettingRow title="Reduce thread overlap" description="Fan threads at shared pins and bow them away from each other." advanced>
              <Toggle
                value={board.reduceThreadOverlap}
                onChange={(value) => update('board', { reduceThreadOverlap: value })}
                label="Reduce thread overlap"
              />
            </SettingRow>
            <SettingRow title="Minimap" description="Show the overview map in the corner." advanced>
              <Toggle
                value={board.showMinimap}
                onChange={(value) => update('board', { showMinimap: value })}
                label="Minimap"
              />
            </SettingRow>
          </div>
        </div>
      </section>
    </>
  )
}

/* -------------------------------- objects -------------------------------- */

function ObjectSettings(): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const objects = settings.objects
  return (
    <>
      <section className="settings-section">
        <h3>Text cards</h3>
        <p>Defaults for newly created cards. Individual cards can override every value from the inspector.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Default width" description="Board units.">
              <NumberSlider value={objects.cardWidth} min={220} max={520} step={10} onChange={(value) => update('objects', { cardWidth: value })} />
            </SettingRow>
            <SettingRow title="Default height">
              <NumberSlider value={objects.cardHeight} min={140} max={420} step={10} onChange={(value) => update('objects', { cardHeight: value })} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">Background</span>
              <ColorControl value={objects.cardBackground} onChange={(value) => update('objects', { cardBackground: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Text colour</span>
              <ColorControl value={objects.cardText} onChange={(value) => update('objects', { cardText: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Border</span>
              <ColorControl value={objects.cardBorder} onChange={(value) => update('objects', { cardBorder: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Typeface</span>
              <Select
                value={objects.cardFontFamily}
                onChange={(value) => update('objects', { cardFontFamily: value })}
                options={[
                  { value: 'Inter, "Segoe UI", sans-serif', label: 'Interface sans' },
                  { value: 'Georgia, "Palatino Linotype", serif', label: 'Book serif' },
                  { value: '"Cascadia Mono", Consolas, monospace', label: 'Monospace' }
                ]}
              />
            </div>
            <SettingRow title="Corner radius">
              <NumberSlider value={objects.cardRadius} min={0} max={28} step={1} onChange={(value) => update('objects', { cardRadius: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Font size">
              <NumberSlider value={objects.cardFontSize} min={10} max={24} step={1} onChange={(value) => update('objects', { cardFontSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Opacity">
              <NumberSlider value={objects.cardOpacity} min={0.4} max={1} step={0.05} onChange={(value) => update('objects', { cardOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title="Shadow">
              <Toggle value={objects.cardShadow} onChange={(value) => update('objects', { cardShadow: value })} label="Card shadow" />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Sticky notes</h3>
        <p>Paper-like notes. Double-click a note to write.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Width">
              <NumberSlider value={objects.noteWidth} min={160} max={420} step={10} onChange={(value) => update('objects', { noteWidth: value })} />
            </SettingRow>
            <SettingRow title="Height">
              <NumberSlider value={objects.noteHeight} min={120} max={360} step={10} onChange={(value) => update('objects', { noteHeight: value })} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">Paper colour</span>
              <ColorControl value={objects.noteColor} onChange={(value) => update('objects', { noteColor: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Ink colour</span>
              <ColorControl value={objects.noteText} onChange={(value) => update('objects', { noteText: value })} />
            </div>
            <SettingRow title="Font size">
              <NumberSlider value={objects.noteFontSize} min={11} max={26} step={1} onChange={(value) => update('objects', { noteFontSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Line height">
              <NumberSlider value={objects.textLineHeight} min={1.2} max={2} step={0.05} onChange={(value) => update('objects', { textLineHeight: value })} format={(v) => v.toFixed(2)} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Threads</h3>
        <p>New threads inherit these. Each connection can be changed independently.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">Default colour</span>
              <ColorControl value={objects.threadColor} onChange={(value) => update('objects', { threadColor: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Style</span>
              <Select
                value={objects.threadStyle}
                onChange={(value) => update('objects', { threadStyle: value as typeof objects.threadStyle })}
                options={[
                  { value: 'thread', label: 'Thread' },
                  { value: 'dashed', label: 'Dashed' },
                  { value: 'dotted', label: 'Dotted' }
                ]}
              />
            </div>
            <SettingRow title="Thickness">
              <NumberSlider value={objects.threadWidth} min={1} max={6} step={0.25} onChange={(value) => update('objects', { threadWidth: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Curve">
              <NumberSlider value={objects.threadCurve} min={-1} max={1} step={0.05} onChange={(value) => update('objects', { threadCurve: value })} format={(v) => v.toFixed(2)} />
            </SettingRow>
            <SettingRow title="Opacity">
              <NumberSlider value={objects.threadOpacity} min={0.3} max={1} step={0.05} onChange={(value) => update('objects', { threadOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title="Subtle glow">
              <Toggle value={objects.threadGlow} onChange={(value) => update('objects', { threadGlow: value })} label="Thread glow" />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Pins</h3>
        <p>Pins are hidden until they are needed. Connected pins are always visible.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Size">
              <NumberSlider value={objects.pinSize} min={5} max={16} step={1} onChange={(value) => update('objects', { pinSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">Pin colour</span>
              <ColorControl value={objects.pinColor} onChange={(value) => update('objects', { pinColor: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">Shape</span>
              <Select
                value={objects.pinShape}
                onChange={(value) => update('objects', { pinShape: value as typeof objects.pinShape })}
                options={[
                  { value: 'round', label: 'Round' },
                  { value: 'dot', label: 'Domed dot' },
                  { value: 'square', label: 'Square' }
                ]}
              />
            </div>
            <div className="field-col">
              <span className="field-label">Reveal unused pins</span>
              <Select
                value={objects.pinVisibility}
                onChange={(value) => update('objects', { pinVisibility: value as typeof objects.pinVisibility })}
                options={[
                  { value: 'hover', label: 'On hover only' },
                  { value: 'connected', label: 'Connected only' },
                  { value: 'always', label: 'Always visible' }
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Drawing &amp; images</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">Default ink</span>
              <ColorControl value={objects.drawColor} onChange={(value) => update('objects', { drawColor: value })} />
            </div>
            <SettingRow title="Brush width">
              <NumberSlider value={objects.drawWidth} min={1} max={12} step={0.5} onChange={(value) => update('objects', { drawWidth: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Ink opacity">
              <NumberSlider value={objects.drawOpacity} min={0.2} max={1} step={0.05} onChange={(value) => update('objects', { drawOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title="Smoothing" description="Higher values produce softer freehand curves.">
              <NumberSlider value={objects.drawSmoothing} min={0} max={1} step={0.05} onChange={(value) => update('objects', { drawSmoothing: value })} format={(v) => v.toFixed(2)} />
            </SettingRow>
            <SettingRow title="Chalk grain">
              <Toggle value={objects.chalkTexture} onChange={(value) => update('objects', { chalkTexture: value })} label="Chalk grain" />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">Image fit</span>
              <Select
                value={objects.imageFit}
                onChange={(value) => update('objects', { imageFit: value as 'cover' | 'contain' })}
                options={[
                  { value: 'cover', label: 'Fill the frame' },
                  { value: 'contain', label: 'Fit inside' }
                ]}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------- interface ------------------------------- */

function InterfaceSettings(): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const ui = settings.ui
  return (
    <>
      <section className="settings-section">
        <h3>Theme</h3>
        <p>The board surface has its own colour; the interface follows this theme.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">Interface theme</span>
              <Select
                value={ui.theme}
                onChange={(value) => update('ui', { theme: value as 'dark' | 'light' })}
                options={[
                  { value: 'dark', label: 'Graphite dark' },
                  { value: 'light', label: 'Paper light' }
                ]}
              />
            </div>
            <div className="field-col">
              <span className="field-label">Accent</span>
              <ColorControl value={ui.accent} onChange={(value) => update('ui', { accent: value })} />
            </div>
            <SettingRow title="Density" description="Compact reduces chrome and padding.">
              <Select
                value={ui.density}
                onChange={(value) => update('ui', { density: value as 'compact' | 'comfortable' })}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' }
                ]}
              />
            </SettingRow>
            <SettingRow title="Text &amp; control scale" description="Scales interface text; the board is unaffected.">
              <NumberSlider value={ui.uiScale} min={0.85} max={1.15} step={0.01} onChange={(value) => update('ui', { uiScale: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title="Icon scale">
              <NumberSlider value={ui.iconScale} min={0.85} max={1.25} step={0.05} onChange={(value) => update('ui', { iconScale: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title="Panel opacity">
              <NumberSlider value={ui.panelOpacity} min={0.72} max={1} step={0.02} onChange={(value) => update('ui', { panelOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Workspace chrome</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Tool rail">
              <Toggle value={ui.showToolRail} onChange={(value) => update('ui', { showToolRail: value })} label="Tool rail" />
            </SettingRow>
            <SettingRow title="Inspector panel">
              <Toggle value={ui.showInspector} onChange={(value) => update('ui', { showInspector: value })} label="Inspector" />
            </SettingRow>
            <SettingRow title="Inspector side">
              <Select
                value={ui.inspectorSide}
                onChange={(value) => update('ui', { inspectorSide: value as 'left' | 'right' })}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'left', label: 'Left' }
                ]}
              />
            </SettingRow>
            <SettingRow title="Board hints">
              <Toggle value={ui.showHints} onChange={(value) => update('ui', { showHints: value })} label="Board hints" />
            </SettingRow>
            <SettingRow title="Animations">
              <Toggle value={ui.animations} onChange={(value) => update('ui', { animations: value })} label="Animations" />
            </SettingRow>
            <SettingRow title="Reduce motion" description="Overrides animations and transitions.">
              <Toggle value={ui.reducedMotion} onChange={(value) => update('ui', { reducedMotion: value })} label="Reduce motion" />
            </SettingRow>
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------ interaction ------------------------------ */

function InteractionSettings({
  recording,
  setRecording,
  advanced
}: {
  recording: DecorAction | null
  setRecording: (action: DecorAction | null) => void
  advanced: boolean
}): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const interaction = settings.interaction
  const toast = useUi((state) => state.toast)
  return (
    <>
      <section className="settings-section">
        <h3>Mouse &amp; movement</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Zoom sensitivity" description="Applies to the wheel and trackpad.">
              <NumberSlider value={interaction.zoomSensitivity} min={0.3} max={2.5} step={0.1} onChange={(value) => update('interaction', { zoomSensitivity: value })} format={(v) => `${v.toFixed(1)}×`} />
            </SettingRow>
            <SettingRow title="Invert zoom direction">
              <Toggle value={interaction.invertZoom} onChange={(value) => update('interaction', { invertZoom: value })} label="Invert zoom" />
            </SettingRow>
            <SettingRow title="Wheel behaviour">
              <Select
                value={interaction.wheelModifier}
                onChange={(value) => update('interaction', { wheelModifier: value as 'none' | 'ctrl' })}
                options={[
                  { value: 'none', label: 'Wheel zooms' },
                  { value: 'ctrl', label: 'Ctrl + wheel zooms' }
                ]}
              />
            </SettingRow>
            <SettingRow title="Middle button pans">
              <Toggle value={interaction.middleButtonPan} onChange={(value) => update('interaction', { middleButtonPan: value })} label="Middle button pans" />
            </SettingRow>
            <SettingRow title="Space + drag pans">
              <Toggle value={interaction.spaceToPan} onChange={(value) => update('interaction', { spaceToPan: value })} label="Space pans" />
            </SettingRow>
            <SettingRow title="Scroll speed">
              <NumberSlider value={interaction.scrollSpeed} min={0.4} max={2} step={0.1} onChange={(value) => update('interaction', { scrollSpeed: value })} format={(v) => `${v.toFixed(1)}×`} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Cards &amp; connections</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Double-click empty board" description="Creates a note at that point.">
              <Toggle value={interaction.doubleClickCreate} onChange={(value) => update('interaction', { doubleClickCreate: value })} label="Double-click creates note" />
            </SettingRow>
            <SettingRow title="Double-click card edits">
              <Toggle value={interaction.doubleClickCardEdit} onChange={(value) => update('interaction', { doubleClickCardEdit: value })} label="Double-click edits" />
            </SettingRow>
            <SettingRow title="Snap to grid" description="Only while dragging or resizing; positions are never changed automatically.">
              <Toggle value={interaction.snapToGrid} onChange={(value) => update('interaction', { snapToGrid: value })} label="Snap to grid" />
            </SettingRow>
            <SettingRow title="Snap spacing">
              <NumberSlider value={interaction.snapSize} min={8} max={96} step={4} onChange={(value) => update('interaction', { snapSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Marquee selection" description="What counts as selected by a dragged rectangle.">
              <Select
                value={interaction.marqueeMode}
                onChange={(value) => update('interaction', { marqueeMode: value as 'intersect' | 'contain' })}
                options={[
                  { value: 'intersect', label: 'Touch to select' },
                  { value: 'contain', label: 'Fully inside only' }
                ]}
              />
            </SettingRow>
            <SettingRow title="Drag threshold">
              <NumberSlider value={interaction.dragThreshold} min={1} max={16} step={1} onChange={(value) => update('interaction', { dragThreshold: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title="Pins while connecting" description="Require release exactly on a pin or snap to nearest.">
              <Select
                value={interaction.connectionTarget}
                onChange={(value) => update('interaction', { connectionTarget: value as 'nearest' | 'pin' })}
                options={[
                  { value: 'pin', label: 'Release on a pin' },
                  { value: 'nearest', label: 'Snap to nearest pin' }
                ]}
              />
            </SettingRow>
            <SettingRow title="Reveal pins on hover">
              <Toggle value={interaction.autoRevealPins} onChange={(value) => update('interaction', { autoRevealPins: value })} label="Reveal pins on hover" />
            </SettingRow>
            <SettingRow title="Thread preview while dragging">
              <Toggle value={interaction.showLinkPreview} onChange={(value) => update('interaction', { showLinkPreview: value })} label="Thread preview" />
            </SettingRow>
            <SettingRow title="Focus chain depth" description="How many connection levels focus mode follows.">
              <NumberSlider value={interaction.focusDepth} min={1} max={4} step={1} onChange={(value) => update('interaction', { focusDepth: value })} format={(v) => `${v} level${v === 1 ? '' : 's'}`} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Keyboard shortcuts</h3>
        <p>Click a key combination, then press the new shortcut. Esc cancels.</p>
        <div className="settings-card">
          <div className="keybindings">
            {DECOR_ACTIONS.map((action) => (
              <div key={action.id} className="keybinding-row">
                <span>{action.label}</span>
                <button
                  className={`kbd ${recording === action.id ? 'is-recording' : ''}`}
                  onClick={() => setRecording(recording === action.id ? null : action.id)}
                >
                  {recording === action.id ? 'Press keys…' : interaction.keybindings[action.id] || 'Unset'}
                </button>
              </div>
            ))}
          </div>
          <div className="divider-full" />
          <div className="settings-actions">
            <button
              className="btn btn-sm"
              onClick={() => {
                useSettings.getState().update('interaction', {
                  keybindings: { ...DEFAULT_KEYBINDINGS }
                })
                toast('Default shortcuts restored', 'success', 1500)
              }}
            >
              <RotateCcw size={11} /> Restore defaults
            </button>
            <span className="hint-text" style={{ alignSelf: 'center' }}>
              Shortcuts are ignored while typing in a card.
            </span>
          </div>
        </div>
      </section>

      {advanced && (
        <section className="settings-section">
          <h3>Advanced interaction</h3>
          <div className="settings-card">
            <div className="settings-grid">
              <div className="field-col">
                <span className="field-label">Thread target rule</span>
                <span className="hint-text">
                  Drop on a pin for exact control, or enable nearest-pin snapping for a faster gesture.
                </span>
              </div>
              <div className="field-col">
                <span className="field-label">Focus depth</span>
                <span className="hint-text">
                  {settings.interaction.focusDepth} level
                  {settings.interaction.focusDepth === 1 ? '' : 's'} of connections are highlighted.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

/* ------------------------------ performance ------------------------------ */

function PerformanceSettings({ advanced }: { advanced: boolean }): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const performance = settings.performance
  return (
    <section className="settings-section">
      <h3>Rendering</h3>
      <p>
        Lower quality switches off expensive shadows and filters. Your content and layout never change.
      </p>
      <div className="settings-card">
        <div className="settings-grid">
          <div className="field-col">
            <span className="field-label">Quality preset</span>
            <Select
              value={performance.quality}
              onChange={(value) => {
                const quality = value as typeof performance.quality
                update('performance', {
                  quality,
                  effects: quality !== 'low',
                  shadows: quality !== 'low',
                  blur: quality !== 'low'
                })
              }}
              options={[
                { value: 'high', label: 'High — all effects' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'low', label: 'Low — maximum responsiveness' }
              ]}
            />
          </div>
          <SettingRow title="Shadows" description="Card and thread shadows.">
            <Toggle value={performance.shadows} onChange={(value) => update('performance', { shadows: value })} label="Shadows" />
          </SettingRow>
          <SettingRow title="Backdrop blur" description="Blur behind floating panels.">
            <Toggle value={performance.blur} onChange={(value) => update('performance', { blur: value })} label="Blur" />
          </SettingRow>
          <SettingRow title="Decorative effects" description="Chalk grain, thread glow and filters.">
            <Toggle value={performance.effects} onChange={(value) => update('performance', { effects: value })} label="Effects" />
          </SettingRow>
          <SettingRow title="Smooth drawing" description="Smooth freehand strokes as they are rendered.">
            <Toggle value={performance.smoothDrawing} onChange={(value) => update('performance', { smoothDrawing: value })} label="Smooth drawing" />
          </SettingRow>
          <SettingRow title="Cull off-screen objects" description="Only render what is near the viewport.">
            <Toggle value={performance.cullOffscreen} onChange={(value) => update('performance', { cullOffscreen: value })} label="Cull off-screen" />
          </SettingRow>
          <SettingRow title="Cull margin" description="Pre-render distance outside the viewport." advanced>
            <NumberSlider value={performance.cullMargin} min={0} max={1600} step={80} onChange={(value) => update('performance', { cullMargin: value })} format={(v) => `${v}px`} />
          </SettingRow>
          <SettingRow title="Maximum visible cards" description="Hard cap for very large boards." advanced>
            <NumberSlider value={performance.maxVisibleCards} min={100} max={3000} step={50} onChange={(value) => update('performance', { maxVisibleCards: value })} />
          </SettingRow>
        </div>
        {advanced && (
          <div className="warning-box" style={{ marginTop: 10 }}>
            Measured strategy: cards and drawings are culled by the visible world rectangle. Threads are
            culled by curve bounds. At low zoom the board replaces card contents with readable labels, which
            is usually far cheaper than rendering thousands of text layouts.
          </div>
        )}
      </div>
    </section>
  )
}

/* --------------------------------- data ---------------------------------- */

function DataSettings({
  dataDir,
  snapshots,
  snapshotBusy,
  takeSnapshot,
  restore,
  refreshSnapshots
}: {
  dataDir: string
  snapshots: StorageSnapshot[]
  snapshotBusy: boolean
  takeSnapshot: (label?: string) => Promise<void>
  restore: (file: string) => void
  refreshSnapshots: () => Promise<void>
}): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const ask = useUi((state) => state.ask)
  const toast = useUi((state) => state.toast)
  const data = settings.data
  return (
    <>
      <section className="settings-section">
        <h3>Automatic saving</h3>
        <p>Projects are written atomically. A crash cannot leave a half-written project file.</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Autosave" description="Save after changes settle.">
              <Toggle value={data.autosave} onChange={(value) => update('data', { autosave: value })} label="Autosave" />
            </SettingRow>
            <SettingRow title="Save interval" description="Delay after the last change.">
              <NumberSlider value={data.autosaveInterval} min={400} max={5000} step={100} onChange={(value) => update('data', { autosaveInterval: value })} format={(v) => `${(v / 1000).toFixed(1)}s`} />
            </SettingRow>
            <SettingRow title="Rolling backups" description="Kept inside each project folder.">
              <NumberSlider value={data.backups} min={3} max={50} step={1} onChange={(value) => update('data', { backups: value })} />
            </SettingRow>
            <SettingRow title="Undo history limit">
              <NumberSlider value={data.maxUndo} min={10} max={200} step={10} onChange={(value) => update('data', { maxUndo: value })} />
            </SettingRow>
            <SettingRow title="Snapshot before space deletion">
              <Toggle value={data.snapshotOnSpaceDelete} onChange={(value) => update('data', { snapshotOnSpaceDelete: value })} label="Snapshot on space delete" />
            </SettingRow>
            <SettingRow title="Snapshot before project import">
              <Toggle value={data.snapshotOnImport} onChange={(value) => update('data', { snapshotOnImport: value })} label="Snapshot on import" />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Snapshots</h3>
        <p>Manual recovery points for this project. Restoring first backs up the current board.</p>
        <div className="settings-card">
          <div className="settings-actions">
            <button className="btn btn-sm" disabled={snapshotBusy} onClick={() => void takeSnapshot()}>
              <Plus size={11} /> {snapshotBusy ? 'Saving…' : 'Create snapshot now'}
            </button>
            <button className="btn btn-sm" onClick={() => void refreshSnapshots()}>
              Refresh
            </button>
            <button className="btn btn-sm" onClick={() => void openDataFolder()}>
              Open data folder
            </button>
          </div>
          <div className="snapshot-list">
            {snapshots.map((snapshot) => (
              <div key={snapshot.file} className="snapshot-row">
                <span className="snap-time">{formatDate(snapshot.createdAt)}</span>
                <span className="snap-size">{formatBytes(snapshot.size)}</span>
                <button className="btn btn-sm" onClick={() => restore(snapshot.file)}>
                  Restore
                </button>
              </div>
            ))}
            {!snapshots.length && <div className="hint-text">No snapshots yet for this project.</div>}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Storage</h3>
        <div className="settings-card">
          <div className="field-col">
            <span className="field-label">Data folder</span>
            <div className="input" style={{ height: 'auto', padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 9.5, userSelect: 'text' }}>
              {dataDir || 'Loading…'}
            </div>
          </div>
          <div className="settings-actions" style={{ marginTop: 9 }}>
            <button className="btn btn-sm" onClick={() => void openDataFolder()}>
              Open folder
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                ask({
                  title: 'Move Mindtrace data?',
                  message:
                    'Choose a folder and Mindtrace will copy every project, asset, setting and backup there. The app must be restarted afterwards.',
                  confirmLabel: 'Choose folder',
                  action: async () => {
                    const result = await chooseDataFolder()
                    if (!result.ok) {
                      if (result.error) toast(result.error, 'error')
                      return
                    }
                    toast('Data copied. Restart Mindtrace to use the new folder.', 'success', 5000)
                  }
                })
              }
            >
              Change location…
            </button>
            <span className="hint-text" style={{ alignSelf: 'center' }}>
              Portable and installer builds use this same folder until changed.
            </span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Export defaults</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title="Image scale" description="Multiplier for PNG / PDF output.">
              <Select
                value={String(data.exportScale)}
                onChange={(value) => update('data', { exportScale: Number(value) })}
                options={[
                  { value: '1', label: '1× (screen)' },
                  { value: '2', label: '2× (retina)' },
                  { value: '3', label: '3× (print)' }
                ]}
              />
            </SettingRow>
            <SettingRow title="Include board surface">
              <Toggle value={data.exportIncludeBackground} onChange={(value) => update('data', { exportIncludeBackground: value })} label="Export background" />
            </SettingRow>
            <SettingRow title="Include threads">
              <Toggle value={data.exportThreads} onChange={(value) => update('data', { exportThreads: value })} label="Export threads" />
            </SettingRow>
            <SettingRow title="Include pins">
              <Toggle value={data.exportPins} onChange={(value) => update('data', { exportPins: value })} label="Export pins" />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Settings transfer</h3>
        <div className="settings-card">
          <div className="settings-actions">
            <button className="btn btn-sm" onClick={() => void useSettings.getState().exportToDisk()}>
              Export settings
            </button>
            <button
              className="btn btn-sm"
              onClick={async () => {
                const result = await useSettings.getState().importFromDisk()
                toast(result.ok ? 'Settings imported' : result.error ?? 'Import cancelled', result.ok ? 'success' : 'error')
              }}
            >
              Import settings
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------- categories ------------------------------ */

function CategorySettings(): React.JSX.Element {
  const board = useBoard()
  const project = board.project
  const [name, setName] = useState('')
  const [color, setColor] = useState('#c8553d')
  const ask = useUi((state) => state.ask)
  if (!project) return <div className="settings-empty" />
  return (
    <>
      <section className="settings-section">
        <h3>Categories</h3>
        <p>Categories belong to this project. Cards can carry any number of them, and filters can combine them.</p>
        <div className="settings-card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input className="input" value={name} placeholder="New category" onChange={(event) => setName(event.target.value)} />
            <input type="color" className="color-input" value={color} onChange={(event) => setColor(event.target.value)} />
            <button
              className="btn btn-sm"
              disabled={!name.trim()}
              onClick={() => {
                board.addCategory(name, color)
                setName('')
              }}
            >
              <Plus size={11} /> Add
            </button>
          </div>
          <div className="profile-list">
            {project.categories.map((category) => (
              <div key={category.id} className="profile-row">
                <span className="chip-dot" style={{ background: category.color, width: 8, height: 8 }} />
                <input
                  className="input"
                  style={{ height: 24, flex: 1 }}
                  value={category.name}
                  onFocus={() => board.beginHistory('Rename category')}
                  onChange={(event) => board.updateCategory(category.id, { name: event.target.value })}
                  onBlur={() => board.commitHistory()}
                />
                <input
                  type="color"
                  className="color-input"
                  value={category.color}
                  onChange={(event) => board.updateCategory(category.id, { color: event.target.value })}
                />
                <button
                  className="icon-btn is-danger"
                  style={{ width: 24, height: 24 }}
                  title="Delete category"
                  onClick={() =>
                    ask({
                      title: 'Delete category?',
                      message: `“${category.name}” will be removed from every card. Cards themselves are not deleted.`,
                      confirmLabel: 'Delete category',
                      danger: true,
                      action: () => board.deleteCategory(category.id)
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!project.categories.length && <div className="hint-text">No categories yet.</div>}
          </div>
        </div>
      </section>
    </>
  )
}

/* -------------------------------- profiles ------------------------------- */

function ProfileSettings({
  profiles,
  profileName,
  setProfileName,
  saveProfile
}: {
  profiles: SettingsProfile[]
  profileName: string
  setProfileName: (value: string) => void
  saveProfile: () => void
}): React.JSX.Element {
  const ask = useUi((state) => state.ask)
  const toast = useUi((state) => state.toast)
  return (
    <>
      <section className="settings-section">
        <h3>Workspace profiles</h3>
        <p>A profile stores the whole configuration: theme, board, object defaults, interaction and quality.</p>
        <div className="settings-card">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              value={profileName}
              placeholder="Profile name (e.g. Late-night cork)"
              onChange={(event) => setProfileName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && saveProfile()}
            />
            <button className="btn btn-sm" disabled={!profileName.trim()} onClick={saveProfile}>
              <Plus size={11} /> Save
            </button>
          </div>
          <div className="profile-list">
            {profiles.map((profile) => (
              <div key={profile.id} className="profile-row">
                <span className="profile-name">{profile.name}</span>
                <span className="profile-date">{formatDate(profile.createdAt)}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    useSettings.getState().applyProfile(profile.id)
                    toast(`Applied “${profile.name}”`, 'success', 1600)
                  }}
                >
                  Apply
                </button>
                <button
                  className="icon-btn is-danger"
                  style={{ width: 24, height: 24 }}
                  onClick={() =>
                    ask({
                      title: 'Delete profile?',
                      message: `“${profile.name}” will be removed. The current settings stay as they are.`,
                      confirmLabel: 'Delete profile',
                      danger: true,
                      action: () => useSettings.getState().deleteProfile(profile.id)
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!profiles.length && <div className="hint-text">No saved profiles yet.</div>}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Reset</h3>
        <p>Reset only what you want. Your project data is never touched by these buttons.</p>
        <div className="settings-card">
          <div className="settings-actions">
            {(['board', 'objects', 'ui', 'interaction', 'performance', 'data'] as const).map((section) => (
              <button
                key={section}
                className="btn btn-sm"
                onClick={() => {
                  useSettings.getState().resetSection(section)
                  toast(`Reset ${section === 'ui' ? 'interface' : section} settings`, 'success', 1500)
                }}
              >
                <RotateCcw size={11} /> {section === 'ui' ? 'Interface' : section[0].toUpperCase() + section.slice(1)}
              </button>
            ))}
          </div>
          <div className="divider-full" />
          <div className="settings-actions">
            <button
              className="btn btn-sm btn-danger"
              onClick={() =>
                ask({
                  title: 'Reset every setting?',
                  message:
                    'All settings, themes, keybindings and profiles return to their defaults. Projects, cards, threads and drawings are untouched.',
                  confirmLabel: 'Reset all settings',
                  danger: true,
                  action: () => {
                    useSettings.getState().resetAll()
                    toast('All settings reset', 'success')
                  }
                })
              }
            >
              <RotateCcw size={11} /> Reset everything
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
