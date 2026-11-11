import {
  ArrowUpRight,
  Circle,
  Eraser,
  Hand,
  Highlighter,
  Layers,
  Link2,
  Minus,
  MousePointer2,
  Paperclip,
  Pencil,
  PenLine,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2,
  HelpCircle
} from 'lucide-react'
import type { ToolAction } from '@shared/settings'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { emitBoardEvent, BOARD_EVENTS } from '@/services/events'

const TOOL_ICONS: Record<ToolAction, typeof Pencil> = {
  select: MousePointer2,
  hand: Hand,
  note: StickyNote,
  text: Type,
  pencil: Pencil,
  chalk: PenLine,
  marker: Highlighter,
  eraser: Eraser,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  arrow: ArrowUpRight,
  thread: Link2
}

export default function ToolRail(): React.JSX.Element {
  const tool = useBoard((state) => state.tool)
  const setTool = useBoard((state) => state.setTool)
  const selection = useBoard((state) => state.selection)
  const groupSelection = useBoard((state) => state.groupSelection)
  const undo = useBoard((state) => state.undo)
  const redo = useBoard((state) => state.redo)
  const canUndo = useBoard((state) => state.history.past.length > 0)
  const canRedo = useBoard((state) => state.history.future.length > 0)
  const openModal = useUi((state) => state.openModal)
  const toast = useUi((state) => state.toast)
  const settings = useSettings((state) => state.settings)
  const t = useT()

  const binding = (action: ToolAction): string => settings.tools.bindings[action] ?? ''
  const visible = (action: ToolAction): boolean => settings.tools.visibility[action] !== false
  const activate = (action: ToolAction): void => {
    if (action === 'rect' || action === 'ellipse' || action === 'line' || action === 'arrow') {
      useSettings.getState().update('tools', { lastShape: action })
    }
    setTool(tool === action ? 'select' : action)
  }

  const brushColor = (): string => {
    if (tool === 'pencil') return settings.tools.pencil.color
    if (tool === 'chalk') return settings.tools.chalk.color
    if (tool === 'marker') return settings.tools.marker.color
    if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
      return settings.tools.shape.stroke
    }
    return settings.tools.pencil.color
  }

  const button = (action: ToolAction): React.JSX.Element | null => {
    if (!visible(action)) return null
    const Icon = TOOL_ICONS[action]
    const label = t(
      action === 'select'
        ? 'Select & move'
        : action === 'hand'
          ? 'Pan'
          : action === 'note'
            ? 'Sticky note'
            : action === 'text'
              ? 'Text'
              : action === 'pencil'
                ? 'Pencil'
                : action === 'chalk'
                  ? 'Chalk'
                  : action === 'marker'
                    ? 'Marker'
                    : action === 'eraser'
                      ? 'Eraser'
                      : action === 'rect'
                        ? 'Rectangle'
                        : action === 'ellipse'
                          ? 'Ellipse'
                          : action === 'line'
                            ? 'Line'
                            : action === 'arrow'
                              ? 'Arrow'
                              : 'Thread / connection'
    )
    const key = binding(action)
    return (
      <button
        key={action}
        className={`tool-btn ${tool === action ? 'is-active' : ''}`}
        onClick={() => activate(action)}
        title={`${label}${key ? ` (${key})` : ''}`}
        aria-label={`${label}${key ? ` (${key})` : ''}`}
        aria-pressed={tool === action}
      >
        <Icon size={16} />
      </button>
    )
  }

  return (
    <nav className="tool-rail" aria-label={t('Tools')}>
      {button('select')}
      {button('hand')}
      {(visible('select') || visible('hand')) && <div className="tool-divider" />}
      {button('note')}
      {button('text')}
      <button
        className="tool-btn"
        onClick={() => emitBoardEvent(BOARD_EVENTS.attach)}
        title={t('Add image, video, audio, PDF or document')}
        aria-label={t('Add image, video, audio, PDF or document')}
      >
        <Paperclip size={16} />
      </button>
      <div className="tool-divider" />
      {button('pencil')}
      {button('chalk')}
      {button('marker')}
      {button('eraser')}
      <div className="tool-divider" />
      {button('rect')}
      {button('ellipse')}
      {button('line')}
      {button('arrow')}
      {button('thread')}
      <div className="tool-divider" />
      <button
        className="tool-btn"
        disabled={!selection.cards.length}
        onClick={() => {
          const id = groupSelection()
          if (id) toast('Cards grouped', 'success')
        }}
        title={t('Group selected cards (Ctrl+G)')}
        aria-label={t('Group selected cards (Ctrl+G)')}
      >
        <Layers size={16} />
      </button>

      <div className="tool-spacer" />

      <button
        className="tool-btn"
        onClick={() => openModal('settings', 'tools')}
        title={t('Drawing colour & brush settings')}
        aria-label={t('Drawing colour & brush settings')}
      >
        <span className="tool-color" style={{ background: brushColor() }} />
      </button>
      <div className="tool-divider" />
      <button className="tool-btn" disabled={!canUndo} onClick={undo} title={t('Undo (Ctrl+Z)')} aria-label={t('Undo (Ctrl+Z)')}>
        <Undo2 size={16} />
      </button>
      <button className="tool-btn" disabled={!canRedo} onClick={redo} title={t('Redo (Ctrl+Shift+Z)')} aria-label={t('Redo (Ctrl+Shift+Z)')}>
        <Redo2 size={16} />
      </button>
      <button className="tool-btn" onClick={() => openModal('help')} title={t('Shortcuts & how it works')} aria-label={t('Shortcuts & how it works')}>
        <HelpCircle size={16} />
      </button>
    </nav>
  )
}
