import { useEffect, useRef, useState } from 'react'
import { useT, useLocale } from '@/i18n'
import {
  Database,
  Gauge,
  Keyboard,
  Layers,
  LayoutGrid,
  MousePointer2,
  Palette,
  Pencil,
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
import {
  DECOR_ACTIONS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_TOOL_BINDINGS,
  DEFAULT_TOOL_ORDER,
  TOOL_ACTIONS,
  type DecorAction,
  type TextureId,
  type ToolAction
} from '@shared/settings'
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
import { t } from '@/i18n'

type Tab =
  | 'board'
  | 'objects'
  | 'tools'
  | 'interface'
  | 'interaction'
  | 'performance'
  | 'data'
  | 'categories'
  | 'presets'

const TABS: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: 'board', label: 'Board surface', icon: LayoutGrid },
  { id: 'objects', label: 'Objects', icon: Layers },
  { id: 'tools', label: 'Tools', icon: Pencil },
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
  const t = useT()
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
        toast(t('Board background updated'), 'success', 1600)
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
      if (!result.ok) throw new Error(t(result.error ?? 'Could not create snapshot'))
      await refreshSnapshots()
      toast(t('Snapshot saved'), 'success', 1600)
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setSnapshotBusy(false)
    }
  }

  const restore = (file: string): void => {
    if (!project) return
    ask({
      title: t('Restore this snapshot?'),
      message: t(
        'The current board will first be copied to a backup, then replaced with this snapshot. Your project name and spaces are preserved by the snapshot.'
      ),
      confirmLabel: t('Restore snapshot'),
      action: async () => {
        const restored = await restoreSnapshot(project.id, file)
        if (!restored.project) throw new Error('Snapshot could not be restored')
        await openProjectById(project.id)
        await refreshSnapshots()
        toast(t('Snapshot restored'), 'success')
      }
    })
  }

  const saveProfile = (): void => {
    if (!profileName.trim()) return
    useSettings.getState().saveProfile(profileName)
    setProfileName('')
    toast(t('Profile saved'), 'success', 1400)
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label={t("Settings")}>
        <div className="dialog-head">
          <div className="head-icon">
            <Settings size={17} />
          </div>
          <div>
            <h2>{t("Settings")}</h2>
            <p>{t("Every option here changes the board immediately. Changes are saved automatically.")}</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title={t("Close settings")}>
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
                  {t(item.label)}
                </button>
              )
            })}
            <div className="nav-sep" />
            <button className={advanced ? 'is-active' : ''} onClick={() => setAdvanced(!advanced)}>
              <SlidersHorizontal size={14} />
              {t("Advanced options")}{' '}</button>
            <div className="nav-note">
              {t("Shortcuts can be remapped. Quality settings reduce GPU work on slower machines without changing your board.")}{' '}</div>
          </nav>

          <div className="settings-content" data-advanced={advanced ? 'true' : 'false'}>
            {tab === 'board' && <BoardSettings readBackground={readBackground} fileInputRef={fileInputRef} />}
            {tab === 'objects' && <ObjectSettings />}
            {tab === 'tools' && <ToolsSettings toast={toast} />}
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
            <span className="kbd">{t("Esc")}</span> {t("closes · settings save automatically")}{' '}</div>
          <button className="btn btn-sm" onClick={() => useSettings.getState().resetAll()}>
            <RotateCcw size={11} /> {t("Reset all")}{' '}</button>
          <button className="btn btn-primary" onClick={close}>
            {t("Done")}{' '}</button>
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
        <strong>{t(title)}</strong>
        {description && <small>{t(description)}</small>}
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
      aria-label={t(label)}
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
        aria-label={t("Choose colour")}
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
          {t(option.label)}
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
        <h3>{t("Surface")}</h3>
        <p>{t("The board should feel like something you can touch, not a blank web page.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">{t("Background colour")}</span>
              <ColorControl value={board.background} onChange={(value) => update('board', { background: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Texture")}</span>
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
                <span>{t("BOARD SURFACE PREVIEW")}</span>
              </div>
            </div>
            <SettingRow title={t("Texture strength")} description={t("How strongly the material grain shows.")}>
              <NumberSlider
                value={board.textureOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => update('board', { textureOpacity: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </SettingRow>
            <SettingRow title={t("Vignette")} description={t("Slightly darkens the edges of the board.")}>
              <Toggle value={board.vignette} onChange={(value) => update('board', { vignette: value })} label={t("Vignette")} />
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
                <Upload size={11} /> {t("Use an image")}{' '}</button>
              {board.backgroundImage && (
                <button className="btn btn-sm btn-danger" onClick={() => update('board', { backgroundImage: null })}>
                  {t("Remove image")}{' '}</button>
              )}
              <span className="hint-text" style={{ alignSelf: 'center' }}>
                {t("Images are resized to 2000 px and stored with your settings.")}{' '}</span>
            </div>
            {board.backgroundImage && (
              <div className="full">
                <SettingRow title={t("Image opacity")} description={t("Keep it subtle so cards remain dominant.")}>
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
        <h3>{t("Grid")}</h3>
        <p>{t("Dots are quiet. Lines are precise. Nothing is required.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">{t("Pattern")}</span>
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
              <span className="field-label">{t("Colour")}</span>
              <ColorControl value={board.gridColor} onChange={(value) => update('board', { gridColor: value })} />
            </div>
            <SettingRow title={t("Spacing")} description={t("Grid size in board units.")}>
              <NumberSlider
                value={board.gridSize}
                min={16}
                max={160}
                step={4}
                onChange={(value) => update('board', { gridSize: value })}
                format={(value) => `${value}px`}
              />
            </SettingRow>
            <SettingRow title={t("Opacity")} description={t("Grid visibility.")}>
              <NumberSlider
                value={board.gridOpacity}
                min={0}
                max={0.6}
                step={0.02}
                onChange={(value) => update('board', { gridOpacity: value })}
                format={(value) => value.toFixed(2)}
              />
            </SettingRow>
            <SettingRow title={t("Show grid by default")} description={t("The Shift+G shortcut toggles this live.")}>
              <Toggle
                value={ui.showGridByDefault}
                onChange={(value) => update('ui', { showGridByDefault: value })}
                label={t("Show grid")}
              />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Readability")}</h3>
        <p>{t("Cards always come first. These controls keep a dense board legible.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Readable labels when zoomed out")} description={t("Replace tiny card contents with screen-sized titles.")}>
              <Toggle
                value={board.cardLabelsAtLowZoom}
                onChange={(value) => update('board', { cardLabelsAtLowZoom: value })}
                label={t("Low-zoom labels")}
              />
            </SettingRow>
            <SettingRow title={t("Simplified view below zoom")} description={t("Zoom threshold for reducing card detail.")}>
              <NumberSlider
                value={board.lodThreshold}
                min={0.15}
                max={0.75}
                step={0.01}
                onChange={(value) => update('board', { lodThreshold: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </SettingRow>
            <SettingRow title={t("Dim unrelated threads")} description={t("When a card is selected, unrelated threads fade but stay visible.")} advanced>
              <NumberSlider
                value={board.threadDim}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(value) => update('board', { threadDim: value })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </SettingRow>
            <SettingRow title={t("Thread labels")} description={t("Show labels written on connections.")} advanced>
              <Toggle
                value={board.showThreadLabels}
                onChange={(value) => update('board', { showThreadLabels: value })}
                label={t("Thread labels")}
              />
            </SettingRow>
            <SettingRow title={t("Reduce thread overlap")} description={t("Fan threads at shared pins and bow them away from each other.")} advanced>
              <Toggle
                value={board.reduceThreadOverlap}
                onChange={(value) => update('board', { reduceThreadOverlap: value })}
                label={t("Reduce thread overlap")}
              />
            </SettingRow>
            <SettingRow title={t("Minimap")} description={t("Show the overview map in the corner.")} advanced>
              <Toggle
                value={board.showMinimap}
                onChange={(value) => update('board', { showMinimap: value })}
                label={t("Minimap")}
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
        <h3>{t("Text cards")}</h3>
        <p>{t("Defaults for newly created cards. Individual cards can override every value from the inspector.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Default width")} description={t("Board units.")}>
              <NumberSlider value={objects.cardWidth} min={220} max={520} step={10} onChange={(value) => update('objects', { cardWidth: value })} />
            </SettingRow>
            <SettingRow title={t("Default height")}>
              <NumberSlider value={objects.cardHeight} min={140} max={420} step={10} onChange={(value) => update('objects', { cardHeight: value })} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">{t("Background")}</span>
              <ColorControl value={objects.cardBackground} onChange={(value) => update('objects', { cardBackground: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Text colour")}</span>
              <ColorControl value={objects.cardText} onChange={(value) => update('objects', { cardText: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Border")}</span>
              <ColorControl value={objects.cardBorder} onChange={(value) => update('objects', { cardBorder: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Typeface")}</span>
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
            <SettingRow title={t("Corner radius")}>
              <NumberSlider value={objects.cardRadius} min={0} max={28} step={1} onChange={(value) => update('objects', { cardRadius: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Font size")}>
              <NumberSlider value={objects.cardFontSize} min={10} max={24} step={1} onChange={(value) => update('objects', { cardFontSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Opacity")}>
              <NumberSlider value={objects.cardOpacity} min={0.4} max={1} step={0.05} onChange={(value) => update('objects', { cardOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title={t("Shadow")}>
              <Toggle value={objects.cardShadow} onChange={(value) => update('objects', { cardShadow: value })} label={t("Card shadow")} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Sticky notes")}</h3>
        <p>{t("Paper-like notes. Double-click a note to write.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Width")}>
              <NumberSlider value={objects.noteWidth} min={160} max={420} step={10} onChange={(value) => update('objects', { noteWidth: value })} />
            </SettingRow>
            <SettingRow title={t("Height")}>
              <NumberSlider value={objects.noteHeight} min={120} max={360} step={10} onChange={(value) => update('objects', { noteHeight: value })} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">{t("Paper colour")}</span>
              <ColorControl value={objects.noteColor} onChange={(value) => update('objects', { noteColor: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Ink colour")}</span>
              <ColorControl value={objects.noteText} onChange={(value) => update('objects', { noteText: value })} />
            </div>
            <SettingRow title={t("Font size")}>
              <NumberSlider value={objects.noteFontSize} min={11} max={26} step={1} onChange={(value) => update('objects', { noteFontSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Line height")}>
              <NumberSlider value={objects.textLineHeight} min={1.2} max={2} step={0.05} onChange={(value) => update('objects', { textLineHeight: value })} format={(v) => v.toFixed(2)} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Threads")}</h3>
        <p>{t("New threads inherit these. Each connection can be changed independently.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">{t("Default colour")}</span>
              <ColorControl value={objects.threadColor} onChange={(value) => update('objects', { threadColor: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Style")}</span>
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
            <SettingRow title={t("Thickness")}>
              <NumberSlider value={objects.threadWidth} min={1} max={6} step={0.25} onChange={(value) => update('objects', { threadWidth: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Curve")}>
              <NumberSlider value={objects.threadCurve} min={-1} max={1} step={0.05} onChange={(value) => update('objects', { threadCurve: value })} format={(v) => v.toFixed(2)} />
            </SettingRow>
            <SettingRow title={t("Opacity")}>
              <NumberSlider value={objects.threadOpacity} min={0.3} max={1} step={0.05} onChange={(value) => update('objects', { threadOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title={t("Subtle glow")}>
              <Toggle value={objects.threadGlow} onChange={(value) => update('objects', { threadGlow: value })} label={t("Thread glow")} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Pins")}</h3>
        <p>{t("Pins are hidden until they are needed. Connected pins are always visible.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Size")}>
              <NumberSlider value={objects.pinSize} min={5} max={16} step={1} onChange={(value) => update('objects', { pinSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">{t("Pin colour")}</span>
              <ColorControl value={objects.pinColor} onChange={(value) => update('objects', { pinColor: value })} />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Shape")}</span>
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
              <span className="field-label">{t("Reveal unused pins")}</span>
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
        <h3>{t("Drawing & images")}</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">{t("Default ink")}</span>
              <ColorControl value={objects.drawColor} onChange={(value) => update('objects', { drawColor: value })} />
            </div>
            <SettingRow title={t("Brush width")}>
              <NumberSlider value={objects.drawWidth} min={1} max={12} step={0.5} onChange={(value) => update('objects', { drawWidth: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Ink opacity")}>
              <NumberSlider value={objects.drawOpacity} min={0.2} max={1} step={0.05} onChange={(value) => update('objects', { drawOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title={t("Smoothing")} description={t("Higher values produce softer freehand curves.")}>
              <NumberSlider value={objects.drawSmoothing} min={0} max={1} step={0.05} onChange={(value) => update('objects', { drawSmoothing: value })} format={(v) => v.toFixed(2)} />
            </SettingRow>
            <SettingRow title={t("Chalk grain")}>
              <Toggle value={objects.chalkTexture} onChange={(value) => update('objects', { chalkTexture: value })} label={t("Chalk grain")} />
            </SettingRow>
            <div className="field-col">
              <span className="field-label">{t("Image fit")}</span>
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
        <h3>{t("Theme")}</h3>
        <p>{t("The board surface has its own colour; the interface follows this theme.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <div className="field-col">
              <span className="field-label">{t("Language")}</span>
              <Select
                value={ui.language}
                onChange={(value) => update('ui', { language: value as 'ru' | 'en' })}
                options={[
                  { value: 'ru', label: 'Русский' },
                  { value: 'en', label: 'English' }
                ]}
              />
            </div>
            <div className="field-col">
              <span className="field-label">{t("Interface theme")}</span>
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
              <span className="field-label">{t("Accent")}</span>
              <ColorControl value={ui.accent} onChange={(value) => update('ui', { accent: value })} />
            </div>
            <SettingRow title={t("Density")} description={t("Compact reduces chrome and padding.")}>
              <Select
                value={ui.density}
                onChange={(value) => update('ui', { density: value as 'compact' | 'comfortable' })}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Text & control scale")} description={t("Scales interface text; the board is unaffected.")}>
              <NumberSlider value={ui.uiScale} min={0.85} max={1.15} step={0.01} onChange={(value) => update('ui', { uiScale: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title={t("Icon scale")}>
              <NumberSlider value={ui.iconScale} min={0.85} max={1.25} step={0.05} onChange={(value) => update('ui', { iconScale: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
            <SettingRow title={t("Panel opacity")}>
              <NumberSlider value={ui.panelOpacity} min={0.72} max={1} step={0.02} onChange={(value) => update('ui', { panelOpacity: value })} format={(v) => `${Math.round(v * 100)}%`} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Workspace chrome")}</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Tool rail")}>
              <Toggle value={ui.showToolRail} onChange={(value) => update('ui', { showToolRail: value })} label={t("Tool rail")} />
            </SettingRow>
            <SettingRow title={t("Inspector panel")}>
              <Toggle value={ui.showInspector} onChange={(value) => update('ui', { showInspector: value })} label={t("Inspector")} />
            </SettingRow>
            <SettingRow title={t("Inspector side")}>
              <Select
                value={ui.inspectorSide}
                onChange={(value) => update('ui', { inspectorSide: value as 'left' | 'right' })}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'left', label: 'Left' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Tool rail side")}>
              <Select
                value={ui.toolRailSide}
                onChange={(value) => update('ui', { toolRailSide: value as 'left' | 'right' })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Show tool options bar")}>
              <Toggle value={ui.showToolOptions} onChange={(value) => update('ui', { showToolOptions: value })} label={t("Tool options bar")} />
            </SettingRow>
            <SettingRow title={t("Options bar position")}>
              <Select
                value={ui.optionsBarPosition}
                onChange={(value) => update('ui', { optionsBarPosition: value as 'top' | 'bottom' })}
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Show the home screen on launch")}>
              <Toggle value={ui.showHomeOnLaunch} onChange={(value) => update('ui', { showHomeOnLaunch: value })} label={t("Home screen")} />
            </SettingRow>
            <SettingRow title={t("Board hints")}>
              <Toggle value={ui.showHints} onChange={(value) => update('ui', { showHints: value })} label={t("Board hints")} />
            </SettingRow>
            <SettingRow title={t("Animations")}>
              <Toggle value={ui.animations} onChange={(value) => update('ui', { animations: value })} label={t("Animations")} />
            </SettingRow>
            <SettingRow title={t("Reduce motion")} description={t("Overrides animations and transitions.")}>
              <Toggle value={ui.reducedMotion} onChange={(value) => update('ui', { reducedMotion: value })} label={t("Reduce motion")} />
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
        <h3>{t("Mouse & movement")}</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Zoom sensitivity")} description={t("Applies to the wheel and trackpad.")}>
              <NumberSlider value={interaction.zoomSensitivity} min={0.3} max={2.5} step={0.1} onChange={(value) => update('interaction', { zoomSensitivity: value })} format={(v) => `${v.toFixed(1)}×`} />
            </SettingRow>
            <SettingRow title={t("Invert zoom direction")}>
              <Toggle value={interaction.invertZoom} onChange={(value) => update('interaction', { invertZoom: value })} label={t("Invert zoom")} />
            </SettingRow>
            <SettingRow title={t("Wheel behaviour")}>
              <Select
                value={interaction.wheelModifier}
                onChange={(value) => update('interaction', { wheelModifier: value as 'none' | 'ctrl' })}
                options={[
                  { value: 'none', label: 'Wheel zooms' },
                  { value: 'ctrl', label: 'Ctrl + wheel zooms' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Middle button pans")}>
              <Toggle value={interaction.middleButtonPan} onChange={(value) => update('interaction', { middleButtonPan: value })} label={t("Middle button pans")} />
            </SettingRow>
            <SettingRow title={t("Space + drag pans")}>
              <Toggle value={interaction.spaceToPan} onChange={(value) => update('interaction', { spaceToPan: value })} label={t("Space pans")} />
            </SettingRow>
            <SettingRow title={t("Scroll speed")}>
              <NumberSlider value={interaction.scrollSpeed} min={0.4} max={2} step={0.1} onChange={(value) => update('interaction', { scrollSpeed: value })} format={(v) => `${v.toFixed(1)}×`} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Cards & connections")}</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Double-click empty board")} description={t("Creates a note at that point.")}>
              <Toggle value={interaction.doubleClickCreate} onChange={(value) => update('interaction', { doubleClickCreate: value })} label={t("Double-click creates note")} />
            </SettingRow>
            <SettingRow title={t("Double-click card edits")}>
              <Toggle value={interaction.doubleClickCardEdit} onChange={(value) => update('interaction', { doubleClickCardEdit: value })} label={t("Double-click edits")} />
            </SettingRow>
            <SettingRow title={t("Snap to grid")} description={t("Only while dragging or resizing; positions are never changed automatically.")}>
              <Toggle value={interaction.snapToGrid} onChange={(value) => update('interaction', { snapToGrid: value })} label={t("Snap to grid")} />
            </SettingRow>
            <SettingRow title={t("Snap spacing")}>
              <NumberSlider value={interaction.snapSize} min={8} max={96} step={4} onChange={(value) => update('interaction', { snapSize: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Marquee selection")} description={t("What counts as selected by a dragged rectangle.")}>
              <Select
                value={interaction.marqueeMode}
                onChange={(value) => update('interaction', { marqueeMode: value as 'intersect' | 'contain' })}
                options={[
                  { value: 'intersect', label: 'Touch to select' },
                  { value: 'contain', label: 'Fully inside only' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Drag threshold")}>
              <NumberSlider value={interaction.dragThreshold} min={1} max={16} step={1} onChange={(value) => update('interaction', { dragThreshold: value })} format={(v) => `${v}px`} />
            </SettingRow>
            <SettingRow title={t("Pins while connecting")} description={t("Require release exactly on a pin or snap to nearest.")}>
              <Select
                value={interaction.connectionTarget}
                onChange={(value) => update('interaction', { connectionTarget: value as 'nearest' | 'pin' })}
                options={[
                  { value: 'pin', label: 'Release on a pin' },
                  { value: 'nearest', label: 'Snap to nearest pin' }
                ]}
              />
            </SettingRow>
            <SettingRow title={t("Reveal pins on hover")}>
              <Toggle value={interaction.autoRevealPins} onChange={(value) => update('interaction', { autoRevealPins: value })} label={t("Reveal pins on hover")} />
            </SettingRow>
            <SettingRow title={t("Thread preview while dragging")}>
              <Toggle value={interaction.showLinkPreview} onChange={(value) => update('interaction', { showLinkPreview: value })} label={t("Thread preview")} />
            </SettingRow>
            <SettingRow title={t("Focus chain depth")} description={t("How many connection levels focus mode follows.")}>
              <NumberSlider value={interaction.focusDepth} min={1} max={4} step={1} onChange={(value) => update('interaction', { focusDepth: value })} format={(v) => `${v} ${t(v === 1 ? 'level' : 'levels')}`} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Keyboard shortcuts")}</h3>
        <p>{t("Click a key combination, then press the new shortcut. Esc cancels.")}</p>
        <div className="settings-card">
          <div className="keybindings">
            {DECOR_ACTIONS.map((action) => (
              <div key={action.id} className="keybinding-row">
                <span>{t(action.label)}</span>
                <button
                  className={`kbd ${recording === action.id ? 'is-recording' : ''}`}
                  onClick={() => setRecording(recording === action.id ? null : action.id)}
                >
                  {recording === action.id ? t('Press keys…') : interaction.keybindings[action.id] || t('Unset')}
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
                toast(t('Default shortcuts restored'), 'success', 1500)
              }}
            >
              <RotateCcw size={11} /> {t("Restore defaults")}{' '}</button>
            <span className="hint-text" style={{ alignSelf: 'center' }}>
              {t("Shortcuts are ignored while typing in a card.")}{' '}</span>
          </div>
        </div>
      </section>

      {advanced && (
        <section className="settings-section">
          <h3>{t("Advanced interaction")}</h3>
          <div className="settings-card">
            <div className="settings-grid">
              <div className="field-col">
                <span className="field-label">{t("Thread target rule")}</span>
                <span className="hint-text">
                  {t("Drop on a pin for exact control, or enable nearest-pin snapping for a faster gesture.")}{' '}</span>
              </div>
              <div className="field-col">
                <span className="field-label">{t("Focus depth")}</span>
                <span className="hint-text">
                  {settings.interaction.focusDepth} {t("level")}{' '}{settings.interaction.focusDepth === 1 ? '' : 's'} {t("of connections are highlighted.")}{' '}</span>
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
      <h3>{t("Rendering")}</h3>
      <p>
        {t("Lower quality switches off expensive shadows and filters. Your content and layout never change.")}{' '}</p>
      <div className="settings-card">
        <div className="settings-grid">
          <div className="field-col">
            <span className="field-label">{t("Quality preset")}</span>
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
          <SettingRow title={t("Shadows")} description={t("Card and thread shadows.")}>
            <Toggle value={performance.shadows} onChange={(value) => update('performance', { shadows: value })} label={t("Shadows")} />
          </SettingRow>
          <SettingRow title={t("Backdrop blur")} description={t("Blur behind floating panels.")}>
            <Toggle value={performance.blur} onChange={(value) => update('performance', { blur: value })} label={t("Blur")} />
          </SettingRow>
          <SettingRow title={t("Decorative effects")} description={t("Chalk grain, thread glow and filters.")}>
            <Toggle value={performance.effects} onChange={(value) => update('performance', { effects: value })} label={t("Effects")} />
          </SettingRow>
          <SettingRow title={t("Smooth drawing")} description={t("Smooth freehand strokes as they are rendered.")}>
            <Toggle value={performance.smoothDrawing} onChange={(value) => update('performance', { smoothDrawing: value })} label={t("Smooth drawing")} />
          </SettingRow>
          <SettingRow title={t("Cull off-screen objects")} description={t("Only render what is near the viewport.")}>
            <Toggle value={performance.cullOffscreen} onChange={(value) => update('performance', { cullOffscreen: value })} label={t("Cull off-screen")} />
          </SettingRow>
          <SettingRow title={t("Cull margin")} description={t("Pre-render distance outside the viewport.")} advanced>
            <NumberSlider value={performance.cullMargin} min={0} max={1600} step={80} onChange={(value) => update('performance', { cullMargin: value })} format={(v) => `${v}px`} />
          </SettingRow>
          <SettingRow title={t("Maximum visible cards")} description={t("Hard cap for very large boards.")} advanced>
            <NumberSlider value={performance.maxVisibleCards} min={100} max={3000} step={50} onChange={(value) => update('performance', { maxVisibleCards: value })} />
          </SettingRow>
        </div>
        {advanced && (
          <div className="warning-box" style={{ marginTop: 10 }}>
            {t("Measured strategy: cards and drawings are culled by the visible world rectangle. Threads are culled by curve bounds. At low zoom the board replaces card contents with readable labels, which is usually far cheaper than rendering thousands of text layouts.")}{' '}</div>
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
  const locale = useLocale()
  const data = settings.data
  return (
    <>
      <section className="settings-section">
        <h3>{t("Automatic saving")}</h3>
        <p>{t("Projects are written atomically. A crash cannot leave a half-written project file.")}</p>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Autosave")} description={t("Save after changes settle.")}>
              <Toggle value={data.autosave} onChange={(value) => update('data', { autosave: value })} label={t("Autosave")} />
            </SettingRow>
            <SettingRow title={t("Save interval")} description={t("Delay after the last change.")}>
              <NumberSlider value={data.autosaveInterval} min={400} max={5000} step={100} onChange={(value) => update('data', { autosaveInterval: value })} format={(v) => `${(v / 1000).toFixed(1)}s`} />
            </SettingRow>
            <SettingRow title={t("Rolling backups")} description={t("Kept inside each project folder.")}>
              <NumberSlider value={data.backups} min={3} max={50} step={1} onChange={(value) => update('data', { backups: value })} />
            </SettingRow>
            <SettingRow title={t("Undo history limit")}>
              <NumberSlider value={data.maxUndo} min={10} max={200} step={10} onChange={(value) => update('data', { maxUndo: value })} />
            </SettingRow>
            <SettingRow title={t("Snapshot before space deletion")}>
              <Toggle value={data.snapshotOnSpaceDelete} onChange={(value) => update('data', { snapshotOnSpaceDelete: value })} label={t("Snapshot on space delete")} />
            </SettingRow>
            <SettingRow title={t("Snapshot before project import")}>
              <Toggle value={data.snapshotOnImport} onChange={(value) => update('data', { snapshotOnImport: value })} label={t("Snapshot on import")} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Snapshots")}</h3>
        <p>{t("Manual recovery points for this project. Restoring first backs up the current board.")}</p>
        <div className="settings-card">
          <div className="settings-actions">
            <button className="btn btn-sm" disabled={snapshotBusy} onClick={() => void takeSnapshot()}>
              <Plus size={11} /> {snapshotBusy ? t('Saving…') : t('Create snapshot now')}
            </button>
            <button className="btn btn-sm" onClick={() => void refreshSnapshots()}>
              {t("Refresh")}{' '}</button>
            <button className="btn btn-sm" onClick={() => void openDataFolder()}>
              {t("Open data folder")}{' '}</button>
          </div>
          <div className="snapshot-list">
            {snapshots.map((snapshot) => (
              <div key={snapshot.file} className="snapshot-row">
                <span className="snap-time">{formatDate(snapshot.createdAt, locale)}</span>
                <span className="snap-size">{formatBytes(snapshot.size)}</span>
                <button className="btn btn-sm" onClick={() => restore(snapshot.file)}>
                  {t("Restore")}{' '}</button>
              </div>
            ))}
            {!snapshots.length && <div className="hint-text">{t("No snapshots yet for this project.")}</div>}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Storage")}</h3>
        <div className="settings-card">
          <div className="field-col">
            <span className="field-label">{t("Data folder")}</span>
            <div className="input" style={{ height: 'auto', padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 9.5, userSelect: 'text' }}>
              {dataDir || t('Loading…')}
            </div>
          </div>
          <div className="settings-actions" style={{ marginTop: 9 }}>
            <button className="btn btn-sm" onClick={() => void openDataFolder()}>
              {t("Open folder")}{' '}</button>
            <button
              className="btn btn-sm"
              onClick={() =>
                ask({
                  title: t('Move Mindtrace data?'),
                  message: t(
                    'Choose a folder and Mindtrace will copy every project, asset, setting and backup there. The app must be restarted afterwards.'
                  ),
                  confirmLabel: t('Choose folder'),
                  action: async () => {
                    const result = await chooseDataFolder()
                    if (!result.ok) {
                      if (result.error) toast(t(result.error), 'error')
                      return
                    }
                    toast(t('Data copied. Restart Mindtrace to use the new folder.'), 'success', 5000)
                  }
                })
              }
            >
              {t("Change location…")}{' '}</button>
            <span className="hint-text" style={{ alignSelf: 'center' }}>
              {t("Portable and installer builds use this same folder until changed.")}{' '}</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Export defaults")}</h3>
        <div className="settings-card">
          <div className="settings-grid">
            <SettingRow title={t("Image scale")} description={t("Multiplier for PNG / PDF output.")}>
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
            <SettingRow title={t("Include board surface")}>
              <Toggle value={data.exportIncludeBackground} onChange={(value) => update('data', { exportIncludeBackground: value })} label={t("Export background")} />
            </SettingRow>
            <SettingRow title={t("Include threads")}>
              <Toggle value={data.exportThreads} onChange={(value) => update('data', { exportThreads: value })} label={t("Export threads")} />
            </SettingRow>
            <SettingRow title={t("Include pins")}>
              <Toggle value={data.exportPins} onChange={(value) => update('data', { exportPins: value })} label={t("Export pins")} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Settings transfer")}</h3>
        <div className="settings-card">
          <div className="settings-actions">
            <button className="btn btn-sm" onClick={() => void useSettings.getState().exportToDisk()}>
              {t("Export settings")}{' '}</button>
            <button
              className="btn btn-sm"
              onClick={async () => {
                const result = await useSettings.getState().importFromDisk()
                toast(result.ok ? t('Settings imported') : t(result.error ?? 'Import cancelled'), result.ok ? 'success' : 'error')
              }}
            >
              {t("Import settings")}{' '}</button>
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------- categories ------------------------------ */

function ToolsSettings({ toast }: { toast: (message: string, kind?: 'info' | 'success' | 'error') => void }): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const [recording, setRecording] = useState<ToolAction | null>(null)

  useEffect(() => {
    if (!recording) return
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
      else if (key.length === 1) key = key.toUpperCase()
      parts.push(key)
      const combo = parts.join('+')
      const toolConflict = (Object.keys(settings.tools.bindings) as ToolAction[]).find(
        (action) => action !== recording && settings.tools.bindings[action]?.toLowerCase() === combo.toLowerCase()
      )
      const actionConflict = (Object.keys(settings.interaction.keybindings) as DecorAction[]).find(
        (action) => settings.interaction.keybindings[action]?.toLowerCase() === combo.toLowerCase()
      )
      if (toolConflict || actionConflict) {
        toast(`Shortcut conflict: ${combo}`, 'error')
        setRecording(null)
        return
      }
      update('tools', {
        bindings: { ...settings.tools.bindings, [recording]: combo }
      })
      setRecording(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, settings.tools.bindings, settings.interaction.keybindings, toast, update])

  const resetLayout = (): void => {
    update('ui', {
      showToolRail: true,
      toolRailSide: 'left',
      showInspector: true,
      inspectorSide: 'right',
      showToolOptions: true,
      optionsBarPosition: 'top'
    })
    update('tools', {
      order: [...DEFAULT_TOOL_ORDER],
      visibility: Object.fromEntries(TOOL_ACTIONS.map((tool) => [tool.id, true])) as Record<ToolAction, boolean>,
      bindings: { ...DEFAULT_TOOL_BINDINGS }
    })
    toast(t('Layout reset'), 'success')
  }

  return (
    <>
      <section className="settings-section">
        <h3>{t("Tool shortcuts")}</h3>
        <p>{t("Each tool can have its own single-key shortcut. Changes apply immediately. Conflicts are highlighted.")}</p>
        <div className="settings-card">
          <div className="keybindings">
            {TOOL_ACTIONS.map((tool) => {
              const conflict =
                (Object.keys(settings.tools.bindings) as ToolAction[]).some(
                  (other) =>
                    other !== tool.id &&
                    settings.tools.bindings[other] &&
                    settings.tools.bindings[other].toLowerCase() === settings.tools.bindings[tool.id]?.toLowerCase()
                ) ||
                Object.values(settings.interaction.keybindings).some(
                  (combo) => combo && combo.toLowerCase() === settings.tools.bindings[tool.id]?.toLowerCase()
                )
              return (
                <div key={tool.id} className="keybinding-row">
                  <span>{t(tool.label)}</span>
                  <button
                    className={`kbd ${recording === tool.id ? 'is-recording' : ''} ${conflict ? 'is-conflict' : ''}`}
                    onClick={() => setRecording(recording === tool.id ? null : tool.id)}
                    title={conflict ? t('Shortcut conflict') : t('Click to remap')}
                  >
                    {recording === tool.id ? t('Press keys…') : settings.tools.bindings[tool.id] || t('Unset')}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="divider-full" />
          <div className="settings-actions">
            <button className="btn btn-sm" onClick={resetLayout}>
              <RotateCcw size={11} /> {t("Reset layout")}{' '}</button>
            <button
              className="btn btn-sm"
              onClick={() => {
                update('tools', { bindings: { ...DEFAULT_TOOL_BINDINGS } })
                toast(t('Default tool shortcuts restored'), 'success')
              }}
            >
              <Keyboard size={11} /> {t("Reset shortcuts")}{' '}</button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Tools visible in the rail")}</h3>
        <p>{t("Hide tools you do not use. They remain available by shortcut unless you remove the shortcut.")}</p>
        <div className="settings-card">
          <div className="tool-visibility-grid">
            {TOOL_ACTIONS.map((tool) => (
              <div key={tool.id} className="setting-row">
                <div className="setting-label">
                  <strong>{t(tool.label)}</strong>
                </div>
                <button
                  className={`toggle ${settings.tools.visibility[tool.id] ? 'is-on' : ''}`}
                  onClick={() =>
                    update('tools', {
                      visibility: {
                        ...settings.tools.visibility,
                        [tool.id]: !settings.tools.visibility[tool.id]
                      }
                    })
                  }
                  aria-label={t(tool.label)}
                />
              </div>
            ))}
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
        <h3>{t("Categories")}</h3>
        <p>{t("Categories belong to this project. Cards can carry any number of them, and filters can combine them.")}</p>
        <div className="settings-card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input className="input" value={name} placeholder={t("New category")} onChange={(event) => setName(event.target.value)} />
            <input type="color" className="color-input" value={color} onChange={(event) => setColor(event.target.value)} />
            <button
              className="btn btn-sm"
              disabled={!name.trim()}
              onClick={() => {
                board.addCategory(name, color)
                setName('')
              }}
            >
              <Plus size={11} /> {t("Add")}{' '}</button>
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
                  title={t("Delete category")}
                  onClick={() =>
                    ask({
                      title: t('Delete category?'),
                      message: t(
                        '“{name}” will be removed from every card. Cards themselves are not deleted.',
                        { name: category.name }
                      ),
                      confirmLabel: t('Delete category'),
                      danger: true,
                      action: () => board.deleteCategory(category.id)
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!project.categories.length && <div className="hint-text">{t("No categories yet.")}</div>}
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
  const locale = useLocale()
  return (
    <>
      <section className="settings-section">
        <h3>{t("Workspace profiles")}</h3>
        <p>{t("A profile stores the whole configuration: theme, board, object defaults, interaction and quality.")}</p>
        <div className="settings-card">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              value={profileName}
              placeholder={t("Profile name (e.g. Late-night cork)")}
              onChange={(event) => setProfileName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && saveProfile()}
            />
            <button className="btn btn-sm" disabled={!profileName.trim()} onClick={saveProfile}>
              <Plus size={11} /> {t("Save")}{' '}</button>
          </div>
          <div className="profile-list">
            {profiles.map((profile) => (
              <div key={profile.id} className="profile-row">
                <span className="profile-name">{profile.name}</span>
                <span className="profile-date">{formatDate(profile.createdAt, locale)}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    useSettings.getState().applyProfile(profile.id)
                    toast(t('Applied “{name}”', { name: profile.name }), 'success', 1600)
                  }}
                >
                  {t("Apply")}{' '}</button>
                <button
                  className="icon-btn is-danger"
                  style={{ width: 24, height: 24 }}
                  onClick={() =>
                    ask({
                      title: t('Delete profile?'),
                      message: t('“{name}” will be removed. The current settings stay as they are.', {
                        name: profile.name
                      }),
                      confirmLabel: t('Delete profile'),
                      danger: true,
                      action: () => useSettings.getState().deleteProfile(profile.id)
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!profiles.length && <div className="hint-text">{t("No saved profiles yet.")}</div>}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("Reset")}</h3>
        <p>{t("Reset only what you want. Your project data is never touched by these buttons.")}</p>
        <div className="settings-card">
          <div className="settings-actions">
            {(['board', 'objects', 'ui', 'interaction', 'performance', 'data'] as const).map((section) => (
              <button
                key={section}
                className="btn btn-sm"
                onClick={() => {
                  useSettings.getState().resetSection(section)
                  toast(
                    t('Reset {name} settings', {
                      name: t(
                        section === 'ui'
                          ? 'Interface'
                          : section === 'board'
                            ? 'Board'
                            : section === 'objects'
                              ? 'Objects'
                              : section === 'interaction'
                                ? 'Interaction'
                                : section === 'performance'
                                  ? 'Performance'
                                  : 'Data'
                      )
                    }),
                    'success',
                    1500
                  )
                }}
              >
                <RotateCcw size={11} />{' '}
                {t(
                  section === 'ui'
                    ? 'Interface'
                    : section === 'board'
                      ? 'Board'
                      : section === 'objects'
                        ? 'Objects'
                        : section === 'interaction'
                          ? 'Interaction'
                          : section === 'performance'
                            ? 'Performance'
                            : 'Data'
                )}
              </button>
            ))}
          </div>
          <div className="divider-full" />
          <div className="settings-actions">
            <button
              className="btn btn-sm btn-danger"
              onClick={() =>
                ask({
                  title: t('Reset every setting?'),
                  message:
                    'All settings, themes, keybindings and profiles return to their defaults. Projects, cards, threads and drawings are untouched.',
                  confirmLabel: t('Reset all settings'),
                  danger: true,
                  action: () => {
                    useSettings.getState().resetAll()
                    toast(t('All settings reset'), 'success')
                  }
                })
              }
            >
              <RotateCcw size={11} /> {t("Reset everything")}{' '}</button>
          </div>
        </div>
      </section>
    </>
  )
}
