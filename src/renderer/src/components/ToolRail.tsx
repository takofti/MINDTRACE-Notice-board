import {
  ArrowUpRight,
  Circle,
  Eraser,
  Hand,
  HelpCircle,
  Highlighter,
  Layers,
  Minus,
  MousePointer2,
  Paperclip,
  Pencil,
  PenLine,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2
} from 'lucide-react'
import type { ToolId } from '@shared/types'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { emitBoardEvent, BOARD_EVENTS } from '@/services/events'

const DRAWING_TOOLS: { id: ToolId; label: string; icon: typeof PenLine }[] = [
  { id: 'chalk', label: 'Chalk', icon: PenLine },
  { id: 'marker', label: 'Marker', icon: Highlighter },
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser }
]

const SHAPE_TOOLS: { id: ToolId; label: string; icon: typeof PenLine }[] = [
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle }
]

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
  const activeDrawing = useUi((state) => state.activeDrawingTool)
  const setActiveDrawing = useUi((state) => state.setActiveDrawingTool)
  const drawColor = useSettings((state) => state.settings.objects.drawColor)

  const chooseDrawing = (id: ToolId): void => {
    setTool(tool === id ? 'select' : id)
    if (id !== 'eraser') {
      setActiveDrawing(id as typeof activeDrawing)
    }
  }

  return (
    <nav className="tool-rail" aria-label="Board tools">
      <button
        className={`tool-btn ${tool === 'select' ? 'is-active' : ''}`}
        onClick={() => setTool('select')}
        title="Select & move (V)"
      >
        <MousePointer2 size={17} />
      </button>
      <button
        className={`tool-btn ${tool === 'hand' ? 'is-active' : ''}`}
        onClick={() => setTool(tool === 'hand' ? 'select' : 'hand')}
        title="Pan board (Space + drag)"
      >
        <Hand size={17} />
      </button>

      <div className="tool-divider" />

      <button
        className="tool-btn"
        onClick={() => emitBoardEvent(BOARD_EVENTS.create, { kind: 'note' })}
        title="New sticky note (N)"
      >
        <StickyNote size={16} />
      </button>
      <button
        className="tool-btn"
        onClick={() => emitBoardEvent(BOARD_EVENTS.create, { kind: 'text' })}
        title="New text card (T)"
      >
        <Type size={16} />
      </button>
      <button
        className="tool-btn"
        onClick={() => emitBoardEvent(BOARD_EVENTS.attach)}
        title="Add image, video, audio, PDF or document"
      >
        <Paperclip size={16} />
      </button>

      <div className="tool-divider" />

      {DRAWING_TOOLS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            className={`tool-btn ${tool === item.id ? 'is-active' : ''}`}
            onClick={() => chooseDrawing(item.id)}
            title={item.label}
          >
            <Icon size={16} />
          </button>
        )
      })}

      <div className="tool-divider" />

      {SHAPE_TOOLS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            className={`tool-btn ${tool === item.id ? 'is-active' : ''}`}
            onClick={() => chooseDrawing(item.id)}
            title={item.label}
          >
            <Icon size={16} />
          </button>
        )
      })}

      <div className="tool-divider" />

      <button
        className="tool-btn"
        disabled={!selection.cards.length}
        onClick={() => {
          const id = groupSelection()
          if (id) toast('Cards grouped — drag the label to move them together', 'success')
        }}
        title="Group selected cards (Ctrl+G)"
      >
        <Layers size={16} />
      </button>

      <div className="tool-spacer" />

      <button
        className="tool-btn"
        onClick={() => openModal('settings', 'objects')}
        title="Drawing colour & brush settings"
      >
        <span className="tool-color" style={{ background: drawColor }} />
      </button>

      <div className="tool-divider" />

      <button className="tool-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button className="tool-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={16} />
      </button>
      <button className="tool-btn" onClick={() => openModal('help')} title="Shortcuts & how it works">
        <HelpCircle size={16} />
      </button>
    </nav>
  )
}
