import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Circle,
  Eraser,
  Italic,
  Minus,
  RotateCcw,
  Square,
  ArrowUpRight
} from 'lucide-react'
import type { AppSettings, ShapeKind } from '@shared/settings'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import ColorField from './ColorField'

const FONT_OPTIONS = [
  { value: 'Inter, "Segoe UI", sans-serif', key: 'Interface sans' },
  { value: 'Georgia, "Palatino Linotype", serif', key: 'Book serif' },
  { value: '"Palatino Linotype", "Iowan Old Style", Georgia, serif', key: 'Display serif' },
  { value: '"Cascadia Mono", Consolas, monospace', key: 'Monospace' }
]

const LINE_STYLES = [
  { value: 'solid', key: 'Solid' },
  { value: 'dashed', key: 'Dashed' },
  { value: 'dotted', key: 'Dotted' }
] as const

function isShapeTool(tool: string): tool is ShapeKind {
  return tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow'
}

function isBrushTool(tool: string): tool is 'pencil' | 'chalk' | 'marker' {
  return tool === 'pencil' || tool === 'chalk' || tool === 'marker'
}

export default function ToolOptionsBar(): React.JSX.Element | null {
  const tool = useBoard((state) => state.tool)
  const setTool = useBoard((state) => state.setTool)
  const selection = useBoard((state) => state.selection)
  const board = useBoard()
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const t = useT()

  if (tool === 'select' || tool === 'hand') return null

  const begin = (): void => {
    const hasSelection =
      selection.strokes.length ||
      selection.threads.length ||
      selection.cards.length ||
      selection.groups.length
    if (hasSelection) board.beginHistory('Tool options')
  }
  const end = (): void => {
    board.commitHistory()
  }

  const applyStrokePatch = (patch: Record<string, unknown>): void => {
    for (const id of selection.strokes) board.updateStroke(id, patch)
  }
  const applyThreadPatch = (patch: Record<string, unknown>): void => {
    for (const id of selection.threads) board.updateThread(id, patch)
  }
  const applyTextPatch = (patch: Record<string, unknown>): void => {
    for (const id of selection.cards) {
      const space = board.project?.spaces.find((item) => item.id === board.activeSpaceId)
      const card = space?.cards[id]
      if (!card || (card.kind !== 'text' && card.kind !== 'note')) continue
      board.updateCard(id, { style: { ...card.style, ...patch } })
    }
  }
  const applyNotePatch = (patch: Record<string, unknown>): void => {
    for (const id of selection.cards) {
      const space = board.project?.spaces.find((item) => item.id === board.activeSpaceId)
      const card = space?.cards[id]
      if (!card || card.kind !== 'note') continue
      const style = { ...card.style }
      if ('color' in patch) board.updateCard(id, { color: patch.color as string })
      if ('fontSize' in patch) board.updateCard(id, { style: { ...style, fontSize: patch.fontSize as number } })
    }
  }

  const resetTool = (): void => {
    const key = isBrushTool(tool) ? tool : tool === 'eraser' ? 'eraser' : isShapeTool(tool) ? 'shape' : tool
    const source = DEFAULT_SETTINGS.tools[key as keyof typeof DEFAULT_SETTINGS.tools]
    const defaults = structuredClone(source) as unknown as Record<string, unknown>
    update('tools', { [key]: defaults } as never)
    if (isBrushTool(tool)) {
      begin()
      applyStrokePatch({
        color: (defaults as { color: string }).color,
        width: (defaults as { width: number }).width,
        opacity: (defaults as { opacity: number }).opacity,
        lineStyle: (defaults as { lineStyle: string }).lineStyle
      })
      end()
    }
  }

  const label =
    isBrushTool(tool)
      ? t(tool === 'pencil' ? 'Pencil' : tool === 'chalk' ? 'Chalk' : 'Marker')
      : tool === 'eraser'
        ? t('Eraser')
        : tool === 'text'
          ? t('Text')
          : tool === 'note'
            ? t('Sticky note')
            : tool === 'thread'
              ? t('Thread / connection')
              : t(
                  tool === 'rect'
                    ? 'Rectangle'
                    : tool === 'ellipse'
                      ? 'Ellipse'
                      : tool === 'line'
                        ? 'Line'
                        : 'Arrow'
                )

  return (
    <div
      className={`tool-options tool-options-${settings.ui.optionsBarPosition}`}
      onPointerDown={(event) => event.stopPropagation()}
      role="toolbar"
      aria-label={t('Tool settings')}
    >
      <div className="tool-options-title">
        <span>{label}</span>
        <button className="icon-btn" onClick={resetTool} title={t('Reset tool')} aria-label={t('Reset tool')}>
          <RotateCcw size={12} />
        </button>
      </div>

      {isBrushTool(tool) && (
        <BrushOptions
          tool={tool}
          settings={settings}
          update={update}
          begin={begin}
          end={end}
          applyStrokePatch={applyStrokePatch}
          t={t}
        />
      )}

      {tool === 'eraser' && (
        <>
          <NumberControl
            label={t('Size')}
            value={settings.tools.eraser.size}
            min={6}
            max={120}
            step={1}
            onChange={(value) => update('tools', { eraser: { ...settings.tools.eraser, size: value } })}
          />
          <NumberControl
            label={t('Hardness')}
            value={Math.round(settings.tools.eraser.hardness * 100)}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) =>
              update('tools', { eraser: { ...settings.tools.eraser, hardness: value / 100 } })
            }
          />
          <SelectControl
            label={t('Shape')}
            value={settings.tools.eraser.shape}
            onChange={(value) =>
              update('tools', {
                eraser: { ...settings.tools.eraser, shape: value as 'circle' | 'square' }
              })
            }
            options={[
              { value: 'circle', label: t('Circle') },
              { value: 'square', label: t('Square') }
            ]}
          />
        </>
      )}

      {isShapeTool(tool) && (
        <>
          <div className="tool-options-group">
            {(['rect', 'ellipse', 'line', 'arrow'] as ShapeKind[]).map((shape) => {
              const Icon = shape === 'rect' ? Square : shape === 'ellipse' ? Circle : shape === 'line' ? Minus : ArrowUpRight
              return (
                <button
                  key={shape}
                  className={`tool-option-icon ${tool === shape ? 'is-active' : ''}`}
                  onClick={() => {
                    update('tools', { lastShape: shape })
                    setTool(shape)
                  }}
                  title={t(shape === 'rect' ? 'Rectangle' : shape === 'ellipse' ? 'Ellipse' : shape === 'line' ? 'Line' : 'Arrow')}
                >
                  <Icon size={13} />
                </button>
              )
            })}
          </div>
          <ColorControl
            label={t('Stroke')}
            color={settings.tools.shape.stroke}
            onChange={(color) => {
              begin()
              update('tools', { shape: { ...settings.tools.shape, stroke: color } })
              applyStrokePatch({ color })
              end()
            }}
            t={t}
          />
          <NumberControl
            label={t('Stroke width')}
            value={settings.tools.shape.strokeWidth}
            min={1}
            max={24}
            step={0.5}
            onChange={(value) => {
              update('tools', { shape: { ...settings.tools.shape, strokeWidth: value } })
              applyStrokePatch({ width: value })
            }}
          />
          {tool !== 'line' && tool !== 'arrow' && (
            <>
              <ColorControl
                label={t('Fill')}
                color={settings.tools.shape.fill}
                onChange={(color) => {
                  begin()
                  update('tools', { shape: { ...settings.tools.shape, fill: color } })
                  applyStrokePatch({ fill: color })
                  end()
                }}
                t={t}
              />
              <NumberControl
                label={t('Fill opacity')}
                value={Math.round(settings.tools.shape.fillOpacity * 100)}
                min={0}
                max={100}
                step={1}
                suffix="%"
                onChange={(value) => {
                  update('tools', { shape: { ...settings.tools.shape, fillOpacity: value / 100 } })
                  applyStrokePatch({ fillOpacity: value / 100 })
                }}
              />
              <NumberControl
                label={t('Radius')}
                value={settings.tools.shape.radius}
                min={0}
                max={80}
                step={1}
                onChange={(value) => {
                  update('tools', { shape: { ...settings.tools.shape, radius: value } })
                  applyStrokePatch({ cornerRadius: value })
                }}
              />
            </>
          )}
          <NumberControl
            label={t('Opacity')}
            value={Math.round(settings.tools.shape.opacity * 100)}
            min={5}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) => {
              update('tools', { shape: { ...settings.tools.shape, opacity: value / 100 } })
              applyStrokePatch({ opacity: value / 100 })
            }}
          />
          <SelectControl
            label={t('Line style')}
            value={settings.tools.shape.lineStyle}
            onChange={(value) => {
              update('tools', { shape: { ...settings.tools.shape, lineStyle: value as typeof settings.tools.shape.lineStyle } })
              applyStrokePatch({ lineStyle: value })
            }}
            options={LINE_STYLES.map((style) => ({ value: style.value, label: t(style.key) }))}
          />
        </>
      )}

      {tool === 'text' && (
        <>
          <SelectControl
            label={t('Font')}
            value={settings.tools.text.fontFamily}
            onChange={(value) => {
              update('tools', { text: { ...settings.tools.text, fontFamily: value } })
              applyTextPatch({ fontFamily: value })
            }}
            options={FONT_OPTIONS.map((font) => ({ value: font.value, label: t(font.key) }))}
          />
          <NumberControl
            label={t('Size')}
            value={settings.tools.text.fontSize}
            min={8}
            max={96}
            step={1}
            onChange={(value) => {
              update('tools', { text: { ...settings.tools.text, fontSize: value } })
              applyTextPatch({ fontSize: value })
            }}
          />
          <ColorControl
            label={t('Color')}
            color={settings.tools.text.color}
            onChange={(color) => {
              begin()
              update('tools', { text: { ...settings.tools.text, color } })
              applyTextPatch({ color })
              end()
            }}
            t={t}
          />
          <div className="tool-options-group">
            <button
              className={`tool-option-icon ${settings.tools.text.bold ? 'is-active' : ''}`}
              onClick={() => {
                const bold = !settings.tools.text.bold
                update('tools', { text: { ...settings.tools.text, bold } })
                applyTextPatch({ bold })
              }}
              title={t('Bold')}
            >
              <Bold size={13} />
            </button>
            <button
              className={`tool-option-icon ${settings.tools.text.italic ? 'is-active' : ''}`}
              onClick={() => {
                const italic = !settings.tools.text.italic
                update('tools', { text: { ...settings.tools.text, italic } })
                applyTextPatch({ italic })
              }}
              title={t('Italic')}
            >
              <Italic size={13} />
            </button>
            {(['left', 'center', 'right'] as const).map((align) => {
              const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
              return (
                <button
                  key={align}
                  className={`tool-option-icon ${settings.tools.text.align === align ? 'is-active' : ''}`}
                  onClick={() => {
                    update('tools', { text: { ...settings.tools.text, align } })
                    applyTextPatch({ align })
                  }}
                  title={t(align === 'left' ? 'Align left' : align === 'center' ? 'Align center' : 'Align right')}
                >
                  <Icon size={13} />
                </button>
              )
            })}
          </div>
          <NumberControl
            label={t('Line height')}
            value={settings.tools.text.lineHeight * 100}
            min={100}
            max={220}
            step={5}
            suffix="%"
            onChange={(value) => {
              update('tools', { text: { ...settings.tools.text, lineHeight: value / 100 } })
              applyTextPatch({ lineHeight: value / 100 })
            }}
          />
          <span className="tool-options-hint">{t('Text tool: click the board to place a text card.')}</span>
        </>
      )}

      {tool === 'note' && (
        <>
          <ColorControl
            label={t('Color')}
            color={settings.tools.note.color}
            onChange={(color) => {
              update('tools', { note: { ...settings.tools.note, color } })
              applyNotePatch({ color })
            }}
            t={t}
          />
          <NumberControl
            label={t('Size')}
            value={settings.tools.note.fontSize}
            min={10}
            max={40}
            step={1}
            onChange={(value) => {
              update('tools', { note: { ...settings.tools.note, fontSize: value } })
              applyNotePatch({ fontSize: value })
            }}
          />
          <span className="tool-options-hint">{t('Note tool: click the board to place a sticky note.')}</span>
        </>
      )}

      {tool === 'thread' && (
        <>
          <ColorControl
            label={t('Color')}
            color={settings.tools.thread.color}
            onChange={(color) => {
              update('tools', { thread: { ...settings.tools.thread, color } })
              begin()
              applyThreadPatch({ color })
              end()
            }}
            t={t}
          />
          <NumberControl
            label={t('Thickness')}
            value={settings.tools.thread.width}
            min={1}
            max={8}
            step={0.5}
            onChange={(value) => {
              update('tools', { thread: { ...settings.tools.thread, width: value } })
              applyThreadPatch({ width: value })
            }}
          />
          <NumberControl
            label={t('Opacity')}
            value={Math.round(settings.tools.thread.opacity * 100)}
            min={10}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) => {
              update('tools', { thread: { ...settings.tools.thread, opacity: value / 100 } })
              applyThreadPatch({ opacity: value / 100 })
            }}
          />
          <SelectControl
            label={t('Line style')}
            value={settings.tools.thread.lineStyle}
            onChange={(value) => {
              update('tools', { thread: { ...settings.tools.thread, lineStyle: value as typeof settings.tools.thread.lineStyle } })
              applyThreadPatch({ lineStyle: value })
            }}
            options={LINE_STYLES.map((style) => ({ value: style.value, label: t(style.key) }))}
          />
          <SelectControl
            label={t('Visual style')}
            value={settings.tools.thread.visualStyle}
            onChange={(value) => {
              update('tools', { thread: { ...settings.tools.thread, visualStyle: value as typeof settings.tools.thread.visualStyle } })
              applyThreadPatch({ visualStyle: value })
            }}
            options={[
              { value: 'minimal', label: t('Minimal') },
              { value: 'neon', label: t('Neon') },
              { value: 'realistic', label: t('Realistic') }
            ]}
          />
          <SelectControl
            label={t('Connection type')}
            value={settings.tools.thread.connectionType}
            onChange={(value) => {
              update('tools', { thread: { ...settings.tools.thread, connectionType: value as typeof settings.tools.thread.connectionType } })
              applyThreadPatch({ connectionType: value })
            }}
            options={[
              { value: 'curved', label: t('Curved') },
              { value: 'straight', label: t('Straight') },
              { value: 'elbow', label: t('Elbow') }
            ]}
          />
          <span className="tool-options-hint">{t('Click a card, then drag a pin to another card.')}</span>
        </>
      )}
    </div>
  )
}

function BrushOptions({
  tool,
  settings,
  update,
  begin,
  end,
  applyStrokePatch,
  t
}: {
  tool: 'pencil' | 'chalk' | 'marker'
  settings: AppSettings
  update: ReturnType<typeof useSettings.getState>['update']
  begin: () => void
  end: () => void
  applyStrokePatch: (patch: Record<string, unknown>) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}): React.JSX.Element {
  const brush = settings.tools[tool]
  return (
    <>
      <ColorControl
        label={t('Color')}
        color={brush.color}
        onChange={(color) => {
          begin()
          update('tools', { [tool]: { ...brush, color } } as never)
          applyStrokePatch({ color })
          end()
        }}
        t={t}
      />
      <NumberControl
        label={t('Thickness')}
        value={brush.width}
        min={1}
        max={36}
        step={0.5}
        onChange={(value) => {
          update('tools', { [tool]: { ...brush, width: value } } as never)
          applyStrokePatch({ width: value })
        }}
      />
      <NumberControl
        label={t('Opacity')}
        value={Math.round(brush.opacity * 100)}
        min={5}
        max={100}
        step={1}
        suffix="%"
        onChange={(value) => {
          update('tools', { [tool]: { ...brush, opacity: value / 100 } } as never)
          applyStrokePatch({ opacity: value / 100 })
        }}
      />
      <NumberControl
        label={t('Smoothing')}
        value={Math.round(brush.smoothing * 100)}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(value) => {
          update('tools', { [tool]: { ...brush, smoothing: value / 100 } } as never)
          applyStrokePatch({ smoothing: value / 100 })
        }}
      />
      <SelectControl
        label={t('Line style')}
        value={brush.lineStyle}
        onChange={(value) => {
          update('tools', { [tool]: { ...brush, lineStyle: value as typeof brush.lineStyle } } as never)
          applyStrokePatch({ lineStyle: value })
        }}
        options={LINE_STYLES.map((style) => ({ value: style.value, label: t(style.key) }))}
      />
    </>
  )
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <label className="tool-option-field">
      <span>{label}</span>
      <input
        type="range"
        className="range tool-option-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="tool-option-value">
        {Math.round(value)}
        {suffix ?? ''}
      </span>
    </label>
  )
}

function SelectControl({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <label className="tool-option-field">
      <span>{label}</span>
      <select className="select tool-option-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ColorControl({
  label,
  color,
  onChange,
  t
}: {
  label: string
  color: string
  onChange: (color: string) => void
  t: (key: string) => string
}): React.JSX.Element {
  return (
    <div className="tool-option-field">
      <span>{label}</span>
      <ColorField value={color} onChange={onChange} compact />
    </div>
  )
}
