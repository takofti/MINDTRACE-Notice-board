import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  Filter,
  Focus,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  PanelRight,
  Plus,
  Scan,
  Search,
  Settings,
  X
} from 'lucide-react'
import type { SpaceMode } from '@shared/types'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { isElectron, windowControls } from '@/services/storage'

const MODES: { id: SpaceMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'normal', label: 'Board', icon: LayoutGrid },
  { id: 'focus', label: 'Focus', icon: Focus },
  { id: 'overview', label: 'Overview', icon: Scan }
]

export default function TitleBar(): React.JSX.Element {
  const project = useBoard((state) => state.project)
  const activeSpaceId = useBoard((state) => state.activeSpaceId)
  const mode = useBoard((state) => state.mode)
  const setMode = useBoard((state) => state.setMode)
  const switchSpace = useBoard((state) => state.switchSpace)
  const addSpace = useBoard((state) => state.addSpace)
  const renameSpace = useBoard((state) => state.renameSpace)
  const saveState = useBoard((state) => state.saveState)
  const lastSavedAt = useBoard((state) => state.lastSavedAt)
  const filter = useBoard((state) => state.filter)
  const openModal = useUi((state) => state.openModal)
  const openContextMenu = useUi((state) => state.openContextMenu)
  const renameRequest = useUi((state) => state.renameSpaceId)
  const setRenameRequest = useUi((state) => state.setRenameSpaceId)
  const showMinimap = useSettings((state) => state.settings.board.showMinimap)
  const showInspector = useSettings((state) => state.settings.ui.showInspector)
  const [maximized, setMaximized] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isElectron) return
    void windowControls.isMaximized().then(setMaximized)
    return windowControls.onMaximized(setMaximized)
  }, [])

  useEffect(() => {
    if (!renameRequest) return
    const space = project?.spaces.find((item) => item.id === renameRequest)
    if (!space) return
    setRenaming(space.id)
    setRenameValue(space.name)
    setRenameRequest(null)
  }, [renameRequest, project, setRenameRequest])

  useEffect(() => {
    if (renaming) {
      requestAnimationFrame(() => {
        renameRef.current?.focus()
        renameRef.current?.select()
      })
    }
  }, [renaming])

  if (!project) return <div className="titlebar" />

  const commitRename = (spaceId: string): void => {
    if (renameValue.trim()) renameSpace(spaceId, renameValue)
    setRenaming(null)
  }

  const filterActive = filter.active && Boolean(filter.query || filter.categories.length || filter.kinds.length)

  return (
    <header className="titlebar">
      <div className="brand" title="Mindtrace — investigation workspace">
        <span className="brand-mark">M</span>
        <span className="brand-name">MINDTRACE</span>
      </div>
      <div className="title-divider" />

      <button
        className="project-button no-drag"
        onClick={() => openModal('projects')}
        title={project.description || 'Open project manager'}
      >
        <span className="project-name">{project.name}</span>
        <ChevronDown size={12} className="chevron" />
      </button>

      <div className="space-tabs no-drag">
        {project.spaces.map((space) => (
          <div
            key={space.id}
            className={`space-tab ${space.id === activeSpaceId ? 'is-active' : ''}`}
            onClick={() => space.id !== activeSpaceId && switchSpace(space.id)}
            onDoubleClick={() => {
              setRenaming(space.id)
              setRenameValue(space.name)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openContextMenu({
                type: 'spaceTab',
                id: space.id,
                screen: { x: event.clientX, y: event.clientY }
              })
            }}
            title={space.description || space.name}
          >
            {space.id === activeSpaceId && <span className="tab-dot" />}
            {renaming === space.id ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={() => commitRename(space.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename(space.id)
                  if (event.key === 'Escape') setRenaming(null)
                  event.stopPropagation()
                }}
              />
            ) : (
              <span className="tab-label">{space.name}</span>
            )}
          </div>
        ))}
        <button
          className="add-space no-drag"
          onClick={() => {
            const id = addSpace()
            if (id) {
              window.setTimeout(() => {
                const space = useBoard.getState().project?.spaces.find((item) => item.id === id)
                if (space) {
                  setRenaming(id)
                  setRenameValue(space.name)
                }
              }, 30)
            }
          }}
          title="New space"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="title-actions no-drag">
        <div
          className={`save-status ${saveState}`}
          title={lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : 'Project loaded'}
        >
          <span className="dot" />
          <span>
            {saveState === 'saving'
              ? 'Saving'
              : saveState === 'error'
                ? 'Save failed'
                : lastSavedAt
                  ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Loaded'}
          </span>
        </div>

        <div className="mode-switch" title="View mode (F cycles)">
          {MODES.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={mode === item.id ? 'is-active' : ''}
                onClick={() => setMode(item.id)}
              >
                <Icon size={12} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        <button className="icon-btn" onClick={() => openModal('search')} title="Search (Ctrl+K)">
          <Search size={15} />
        </button>
        <button
          className={`icon-btn ${filterActive ? 'is-active' : ''}`}
          onClick={() => openModal('filters')}
          title="Filter cards and materials"
        >
          <Filter size={15} />
        </button>
        <button
          className={`icon-btn ${showMinimap ? 'is-active' : ''}`}
          onClick={() => useSettings.getState().update('board', { showMinimap: !showMinimap })}
          title="Toggle minimap"
        >
          <Scan size={15} />
        </button>
        <button
          className={`icon-btn ${showInspector ? 'is-active' : ''}`}
          onClick={() => useSettings.getState().update('ui', { showInspector: !showInspector })}
          title="Toggle inspector panel"
        >
          <PanelRight size={15} />
        </button>
        <button className="icon-btn" onClick={() => openModal('export')} title="Export board (Ctrl+E)">
          <Download size={15} />
        </button>
        <button className="icon-btn" onClick={() => openModal('settings')} title="Settings (Ctrl+,)">
          <Settings size={15} />
        </button>

        {isElectron && (
          <div className="window-controls">
            <button onClick={() => windowControls.minimize()} title="Minimize">
              <Minus size={14} />
            </button>
            <button
              onClick={() => {
                windowControls.toggleMaximize()
                setMaximized(!maximized)
              }}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button className="close-window" onClick={() => windowControls.close()} title="Close">
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
