import { useMemo, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Focus,
  Layers,
  Lock,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
  Unlock,
  X
} from 'lucide-react'
import type { Card, CardKind, Group, Stroke, Thread } from '@shared/types'
import { CARD_PALETTE, NOTE_PALETTE, THREAD_PALETTE } from '@/core/defaults'
import { useActiveSpace, useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { openAsset, openExternal, revealAsset } from '@/services/storage'

const FONT_OPTIONS = [
  { label: 'Interface sans', value: 'Inter, "Segoe UI", sans-serif' },
  { label: 'Book serif', value: 'Georgia, "Palatino Linotype", serif' },
  { label: 'Display serif', value: '"Palatino Linotype", "Iowan Old Style", Georgia, serif' },
  { label: 'Monospace', value: '"Cascadia Mono", Consolas, monospace' }
]

const TEXT_COLORS = ['#e9e6de', '#c9c6bd', '#24211a', '#c8553d', '#c99a3d', '#5b8db8', '#6e9c73', '#a06aa8']

export default function Inspector(): React.JSX.Element | null {
  const space = useActiveSpace()
  const selection = useBoard((state) => state.selection)
  const board = useBoard()
  const settings = useSettings((state) => state.settings)
  const updateSettings = useSettings((state) => state.update)
  const toast = useUi((state) => state.toast)
  const [newCategory, setNewCategory] = useState('')
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  if (!space) return null

  const cards = selection.cards.map((id) => space.cards[id]).filter(Boolean) as Card[]
  const threads = selection.threads.map((id) => space.threads[id]).filter(Boolean) as Thread[]
  const strokes = selection.strokes.map((id) => space.strokes[id]).filter(Boolean) as Stroke[]
  const groups = selection.groups.map((id) => space.groups[id]).filter(Boolean) as Group[]

  const begin = (label: string): void => board.beginHistory(label)
  const commit = (): void => board.commitHistory()

  const title = cards.length
    ? cards.length > 1
      ? `${cards.length} cards`
      : cards[0].title || kindLabel(cards[0].kind)
    : threads.length
      ? threads.length > 1
        ? `${threads.length} threads`
        : threads[0].label || 'Thread'
      : strokes.length
        ? strokes.length > 1
          ? `${strokes.length} drawings`
          : `Drawing · ${strokes[0].tool}`
        : groups.length
          ? groups.length > 1
            ? `${groups.length} groups`
            : groups[0].title
          : 'Selection'

  const kicker = cards.length
    ? cards.length > 1
      ? 'MATERIALS'
      : kindLabel(cards[0].kind).toUpperCase()
    : threads.length
      ? 'CONNECTION'
      : strokes.length
        ? 'CHALK / INK'
        : 'GROUP'

  const clear = (): void => board.clearSelection()

  return (
    <aside className={`inspector ${settings.ui.inspectorSide === 'left' ? 'side-left' : ''}`} aria-label="Inspector">
      <div className="inspector-head">
        <div style={{ minWidth: 0 }}>
          <div className="inspector-kicker">{kicker}</div>
          <h2>{title}</h2>
          <div className="inspector-sub">
            {cards.length > 0 && `${cards.length} card${cards.length === 1 ? '' : 's'}`}
            {threads.length > 0 && `${threads.length} thread${threads.length === 1 ? '' : 's'}`}
            {strokes.length > 0 && `${strokes.length} drawing${strokes.length === 1 ? '' : 's'}`}
            {groups.length > 0 && `${groups.length} group${groups.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="head-actions">
          <button className="icon-btn" onClick={clear} title="Clear selection (Esc)">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {cards.length > 0 && (
          <CardsPanel
            cards={cards}
            categories={board.project?.categories ?? []}
            begin={begin}
            commit={commit}
            newCategory={newCategory}
            setNewCategory={setNewCategory}
            showCategoryInput={showCategoryInput}
            setShowCategoryInput={setShowCategoryInput}
          />
        )}

        {!cards.length && threads.length > 0 && (
          <ThreadsPanel threads={threads} begin={begin} commit={commit} />
        )}

        {!cards.length && !threads.length && strokes.length > 0 && (
          <StrokesPanel strokes={strokes} begin={begin} commit={commit} />
        )}

        {!cards.length && !threads.length && !strokes.length && groups.length > 0 && (
          <GroupsPanel groups={groups} begin={begin} commit={commit} />
        )}

        <div className="inspector-section">
          <div className="section-title">Canvas</div>
          <div className="inspector-actions">
            <button
              className="btn btn-sm"
              onClick={() =>
                updateSettings('ui', { showInspector: !settings.ui.showInspector })
              }
              title="Hide / show inspector panel"
            >
              {settings.ui.showInspector ? 'Hide inspector' : 'Show inspector'}
            </button>
            <button className="btn btn-sm" onClick={() => useUi.getState().openModal('settings', 'objects')}>
              Object defaults
            </button>
          </div>
        </div>
      </div>

      <div className="inspector-foot">
        <button className="btn btn-sm" onClick={() => toast('Everything is undoable — Ctrl+Z', 'info', 1800)}>
          <RotateCcw size={11} /> Undoable
        </button>
        <button
          className="btn btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            board.duplicateSelection()
            toast('Duplicated', 'success', 1200)
          }}
        >
          <Copy size={11} /> Duplicate
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => {
            board.deleteSelection()
            toast('Deleted — Ctrl+Z to restore', 'info', 1800)
          }}
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </aside>
  )
}

function kindLabel(kind: CardKind): string {
  switch (kind) {
    case 'text':
      return 'Text card'
    case 'note':
      return 'Note'
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
      return 'Web link'
  }
}

/* ------------------------------- cards ---------------------------------- */

function CardsPanel({
  cards,
  categories,
  begin,
  commit,
  newCategory,
  setNewCategory,
  showCategoryInput,
  setShowCategoryInput
}: {
  cards: Card[]
  categories: { id: string; name: string; color: string }[]
  begin: (label: string) => void
  commit: () => void
  newCategory: string
  setNewCategory: (value: string) => void
  showCategoryInput: boolean
  setShowCategoryInput: (value: boolean) => void
}): React.JSX.Element {
  const board = useBoard()
  const settings = useSettings((state) => state.settings)
  const single = cards.length === 1 ? cards[0] : null
  const cardIds = cards.map((card) => card.id)
  const allCategories = categories
  const updateAll = (patch: Partial<Card>, record = false): void => {
    board.updateCards(cardIds, patch, record)
  }
  const updateStyle = (patch: NonNullable<Card['style']>, record = false): void => {
    const style = single?.style ?? {}
    if (single) board.updateCard(single.id, { style: { ...style, ...patch } }, record)
    else {
      for (const card of cards) {
        board.updateCard(card.id, { style: { ...card.style, ...patch } })
      }
    }
  }
  const styleOf = (key: keyof NonNullable<Card['style']>): string | number | undefined => {
    if (single) return single.style?.[key] as string | number | undefined
    return cards[0]?.style?.[key] as string | number | undefined
  }
  const backgroundColor = single?.color ?? cards[0]?.color ?? settings.objects.cardBackground
  const noteMode = cards.every((card) => card.kind === 'note')

  return (
    <>
      <div className="inspector-section">
        {single && (single.kind === 'text' || single.kind === 'note') && (
          <div className="field-col">
            <span className="field-label">Title</span>
            <TextInput
              value={single.title}
              placeholder={single.kind === 'note' ? 'Note title (optional)' : 'Card title'}
              onFocus={() => begin('Edit title')}
              onChange={(value) => board.updateCard(single.id, { title: value })}
              onBlur={commit}
            />
            <button
              className="btn btn-sm"
              style={{ marginTop: 7, alignSelf: 'flex-start' }}
              onClick={() => {
                board.setEditingCard(single.id)
              }}
            >
              <Pencil size={11} /> Edit text on board
            </button>
          </div>
        )}

        {single && (single.kind === 'image' || single.kind === 'video' || single.kind === 'audio' || single.kind === 'pdf' || single.kind === 'doc' || single.kind === 'file') && (
          <div className="field-col">
            <span className="field-label">Material</span>
            <div className="file-name" style={{ fontSize: 11 }}>
              {single.assetName || single.title || 'Untitled material'}
            </div>
            <div className="hint-text" style={{ marginTop: 2 }}>
              {single.mime || 'Unknown type'}
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => single.assetUrl && void openAsset(single.assetUrl)}>
                <ExternalIcon /> Open
              </button>
              <button className="btn btn-sm" onClick={() => single.assetUrl && void revealAsset(single.assetUrl)}>
                Show in folder
              </button>
            </div>
          </div>
        )}

        {single && single.kind === 'image' && (
          <div className="field-col" style={{ marginTop: 12 }}>
            <span className="field-label">Caption</span>
            <textarea
              className="textarea"
              value={single.caption ?? ''}
              placeholder="What does this image show?"
              onFocus={() => begin('Edit caption')}
              onChange={(event) => board.updateCard(single.id, { caption: event.target.value })}
              onBlur={commit}
              rows={2}
            />
            <div className="field-row" style={{ marginTop: 7 }}>
              <span className="hint-text">Fit</span>
              <div className="mode-switch" style={{ height: 26 }}>
                <button
                  className={(single.style?.imageFit ?? settings.objects.imageFit) === 'cover' ? 'is-active' : ''}
                  onClick={() => board.updateCard(single.id, { style: { ...single.style, imageFit: 'cover' } }, true)}
                >
                  Cover
                </button>
                <button
                  className={(single.style?.imageFit ?? settings.objects.imageFit) === 'contain' ? 'is-active' : ''}
                  onClick={() => board.updateCard(single.id, { style: { ...single.style, imageFit: 'contain' } }, true)}
                >
                  Contain
                </button>
              </div>
            </div>
          </div>
        )}

        {single && single.kind === 'link' && (
          <div className="field-col">
            <span className="field-label">Web address</span>
            <TextInput
              value={single.assetUrl ?? ''}
              placeholder="https://…"
              onFocus={() => begin('Edit link')}
              onChange={(value) => board.updateCard(single.id, { assetUrl: value })}
              onBlur={commit}
            />
            <button
              className="btn btn-sm"
              style={{ marginTop: 7, alignSelf: 'flex-start' }}
              onClick={() => single.assetUrl && void openExternal(single.assetUrl)}
            >
              Open link
            </button>
          </div>
        )}

        {!single && (
          <div className="field-col">
            <span className="field-label">{cards.length} selected cards</span>
            <p className="multi-note" style={{ margin: 0 }}>
              Changes below apply to every selected card. Individual text is preserved.
            </p>
          </div>
        )}
      </div>

      <div className="inspector-section">
        <div className="section-title">Position &amp; size</div>
        <div className="transform-grid">
          <NumberField
            label="X"
            value={single?.x ?? cards[0]?.x ?? 0}
            onFocus={() => begin('Move card')}
            onChange={(value) => {
              if (single) board.updateCard(single.id, { x: value })
            }}
            onBlur={commit}
            disabled={!single}
          />
          <NumberField
            label="Y"
            value={single?.y ?? cards[0]?.y ?? 0}
            onFocus={() => begin('Move card')}
            onChange={(value) => {
              if (single) board.updateCard(single.id, { y: value })
            }}
            onBlur={commit}
            disabled={!single}
          />
          <NumberField
            label="W"
            value={single?.w ?? cards[0]?.w ?? 0}
            onFocus={() => begin('Resize card')}
            onChange={(value) => {
              if (single) board.updateCard(single.id, { w: Math.max(130, value) })
            }}
            onBlur={commit}
            disabled={!single}
          />
          <NumberField
            label="H"
            value={single?.h ?? cards[0]?.h ?? 0}
            onFocus={() => begin('Resize card')}
            onChange={(value) => {
              if (single) board.updateCard(single.id, { h: Math.max(90, value) })
            }}
            onBlur={commit}
            disabled={!single}
          />
        </div>
        <div className="hint-text" style={{ marginTop: 7 }}>
          Drag the card or its corner handles on the board. Nothing snaps unless you enable it in
          Settings → Interaction.
        </div>
      </div>

      <div className="inspector-section">
        <div className="section-title">Appearance</div>
        <div className="field-col">
          <span className="field-label">Background</span>
          <div className="style-swatches">
            {(noteMode ? NOTE_PALETTE : CARD_PALETTE).map((color) => (
              <button
                key={color}
                className={`style-swatch ${backgroundColor === color ? 'is-active' : ''}`}
                style={{ background: color }}
                onClick={() => updateAll({ color }, true)}
                title={color}
              />
            ))}
            <input
              type="color"
              className="color-input"
              value={normalizeColor(backgroundColor)}
              onChange={(event) => updateAll({ color: event.target.value }, true)}
              title="Custom background"
            />
          </div>
        </div>

        <div className="field-row" style={{ marginTop: 10 }}>
          <span className="field-label">Corner radius</span>
          <RangeField
            value={Number(styleOf('radius') ?? settings.objects.cardRadius)}
            min={0}
            max={30}
            step={1}
            suffix="px"
            onBegin={() => begin('Edit appearance')}
            onChange={(value) => updateStyle({ radius: value })}
            onEnd={commit}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Opacity</span>
          <RangeField
            value={Number(styleOf('opacity') ?? settings.objects.cardOpacity)}
            min={0.2}
            max={1}
            step={0.05}
            format={(value) => `${Math.round(value * 100)}%`}
            onBegin={() => begin('Edit appearance')}
            onChange={(value) => updateStyle({ opacity: value })}
            onEnd={commit}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Font size</span>
          <RangeField
            value={Number(styleOf('fontSize') ?? settings.objects.cardFontSize)}
            min={10}
            max={34}
            step={1}
            suffix="px"
            onBegin={() => begin('Edit text style')}
            onChange={(value) => updateStyle({ fontSize: value })}
            onEnd={commit}
          />
        </div>
        <div className="field-row" style={{ marginTop: 5 }}>
          <span className="field-label">Shadow</span>
          <button
            className={`toggle ${(styleOf('shadow') ?? true) ? 'is-on' : ''}`}
            onClick={() =>
              updateStyle({ shadow: !(styleOf('shadow') ?? true) }, true)
            }
            aria-label="Card shadow"
          />
        </div>

        {single && (
          <>
            <div className="field-col" style={{ marginTop: 10 }}>
              <span className="field-label">Text colour</span>
              <div className="style-swatches">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    className="style-swatch"
                    style={{ background: color }}
                    onClick={() =>
                      board.updateCard(
                        single.id,
                        { style: { ...single.style, color } },
                        true
                      )
                    }
                    title={color}
                  />
                ))}
                <input
                  type="color"
                  className="color-input"
                  value={normalizeColor(single.style?.color ?? '#e9e6de')}
                  onChange={(event) =>
                    board.updateCard(single.id, { style: { ...single.style, color: event.target.value } }, true)
                  }
                />
              </div>
            </div>
            <div className="field-col" style={{ marginTop: 10 }}>
              <span className="field-label">Typeface</span>
              <select
                className="select"
                value={single.style?.fontFamily ?? settings.objects.cardFontFamily}
                onChange={(event) =>
                  board.updateCard(single.id, { style: { ...single.style, fontFamily: event.target.value } }, true)
                }
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ marginTop: 9 }}>
              <span className="field-label">Alignment</span>
              <div className="mode-switch" style={{ height: 26 }}>
                {[
                  { value: 'left', icon: AlignLeft },
                  { value: 'center', icon: AlignCenter },
                  { value: 'right', icon: AlignRight }
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.value}
                      className={(single.style?.align ?? 'left') === item.value ? 'is-active' : ''}
                      onClick={() =>
                        board.updateCard(
                          single.id,
                          { style: { ...single.style, align: item.value as 'left' | 'center' | 'right' } },
                          true
                        )
                      }
                    >
                      <Icon size={12} />
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="inspector-section">
        <div className="section-title">
          Categories
          <span className="spacer" />
          <button
            className="icon-btn"
            style={{ width: 20, height: 20 }}
            onClick={() => setShowCategoryInput(!showCategoryInput)}
            title="New category"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="chip-row">
          {allCategories.map((category) => {
            const activeCount = cards.filter((card) => card.categories.includes(category.id)).length
            return (
              <button
                key={category.id}
                className={`chip ${activeCount === cards.length ? 'is-active' : ''}`}
                style={activeCount ? { borderColor: category.color } : undefined}
                onClick={() => {
                  if (activeCount !== cards.length && single) {
                    if (!board.selection.cards.includes(single.id)) board.selectCard(single.id)
                  }
                  board.toggleCategoryOnSelection(category.id)
                }}
              >
                <span className="chip-dot" style={{ background: category.color }} />
                {category.name}
                {activeCount > 0 && activeCount < cards.length && (
                  <span style={{ opacity: 0.6 }}>{activeCount}</span>
                )}
              </button>
            )
          })}
          {!allCategories.length && <span className="hint-text">No categories yet. Create one above.</span>}
        </div>
        {showCategoryInput && (
          <div className="row" style={{ display: 'flex', gap: 5, marginTop: 8 }}>
            <input
              className="input"
              value={newCategory}
              placeholder="Category name"
              autoFocus
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && newCategory.trim()) {
                  const id = board.addCategory(
                    newCategory,
                    ['#c8553d', '#c99a3d', '#5b8db8', '#6e9c73', '#a06aa8'][
                      (board.project?.categories.length ?? 0) % 5
                    ]
                  )
                  setNewCategory('')
                  setShowCategoryInput(false)
                  if (id) {
                    if (single && !board.selection.cards.includes(single.id)) board.selectCard(single.id)
                    board.toggleCategoryOnSelection(id)
                  }
                }
                if (event.key === 'Escape') setShowCategoryInput(false)
              }}
            />
            <button
              className="btn btn-sm"
              onClick={() => {
                if (!newCategory.trim()) return
                const id = board.addCategory(
                  newCategory,
                  ['#c8553d', '#c99a3d', '#5b8db8', '#6e9c73', '#a06aa8'][
                    (board.project?.categories.length ?? 0) % 5
                  ]
                )
                setNewCategory('')
                setShowCategoryInput(false)
                if (id) {
                  if (single && !board.selection.cards.includes(single.id)) board.selectCard(single.id)
                  board.toggleCategoryOnSelection(id)
                }
              }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div className="inspector-section">
        <div className="section-title">Pins &amp; threads</div>
        {single ? <PinsPanel card={single} /> : <p className="multi-note">Select one card to inspect its pins.</p>}
      </div>

      <div className="inspector-section">
        <div className="section-title">Arrange</div>
        <div className="inspector-actions">
          <button className="btn btn-sm" onClick={() => board.bringForward('front')}>
            <ChevronsUp size={11} /> Bring front
          </button>
          <button className="btn btn-sm" onClick={() => board.bringForward('back')}>
            <ChevronsDown size={11} /> Send back
          </button>
          <button className="btn btn-sm" onClick={() => board.bringForward('forward')}>
            <ArrowUp size={11} /> Forward
          </button>
          <button className="btn btn-sm" onClick={() => board.bringForward('backward')}>
            <ArrowDown size={11} /> Backward
          </button>
          <button className="btn btn-sm" onClick={() => board.toggleLockSelection()}>
            {(single?.locked ? <Unlock size={11} /> : <Lock size={11} />)}
            {single?.locked ? 'Unlock' : 'Lock'}
          </button>
          <button className="btn btn-sm" onClick={() => board.toggleHiddenSelection()}>
            {(single?.hidden ? <Eye size={11} /> : <EyeOff size={11} />)}
            {single?.hidden ? 'Show' : 'Hide'}
          </button>
          <button className="btn btn-sm" onClick={() => board.groupSelection()}>
            <Layers size={11} /> Group
          </button>
          <button className="btn btn-sm" onClick={() => board.duplicateSelection()}>
            <Copy size={11} /> Duplicate
          </button>
        </div>
      </div>
    </>
  )
}

function PinsPanel({ card }: { card: Card }): React.JSX.Element {
  const space = useActiveSpace()
  const board = useBoard()
  const pinsUsed = useMemo(() => {
    if (!space) return 0
    let count = 0
    for (const thread of Object.values(space.threads)) {
      if (thread.from.cardId === card.id || thread.to.cardId === card.id) count++
    }
    return count
  }, [space, card.id])
  return (
    <>
      <div className="field-row">
        <span className="field-label">Threads attached</span>
        <span className="kind-pill">{pinsUsed}</span>
      </div>
      <div className="field-row">
        <span className="field-label">Custom pins</span>
        <span className="kind-pill">{card.pins.length}</span>
      </div>
      {card.pins.length > 0 && (
        <div className="profile-list" style={{ marginTop: 8 }}>
          {card.pins.map((pin) => (
            <div key={pin.id} className="profile-row" style={{ padding: '4px 6px' }}>
              <Pin size={11} style={{ color: 'var(--gold)' }} />
              <span className="profile-name">
                {Math.round(pin.x * 100)}% · {Math.round(pin.y * 100)}%
              </span>
              <button
                className="icon-btn"
                style={{ width: 20, height: 20 }}
                title="Remove pin and its threads"
                onClick={() => board.removePin(card.id, pin.id)}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="hint-text" style={{ marginTop: 8, lineHeight: 1.5 }}>
        Hover the card and drag from a pin to tie a thread. Hold <span className="kbd">Alt</span> and click
        anywhere on the card to place a new pin at that exact point.
      </div>
    </>
  )
}

/* ------------------------------- threads -------------------------------- */

function ThreadsPanel({
  threads,
  begin,
  commit
}: {
  threads: Thread[]
  begin: (label: string) => void
  commit: () => void
}): React.JSX.Element {
  const board = useBoard()
  const space = useActiveSpace()
  const settings = useSettings((state) => state.settings)
  const single = threads.length === 1 ? threads[0] : null
  const ids = threads.map((thread) => thread.id)
  const thread = single
  const fromCard = thread && space ? space.cards[thread.from.cardId] : null
  const toCard = thread && space ? space.cards[thread.to.cardId] : null
  const commonColor = threads[0]?.color
  const commonWidth = threads[0]?.width

  return (
    <>
      {single && (
        <div className="inspector-section">
          <div className="thread-preview-strip">
            <svg viewBox="0 0 200 26" preserveAspectRatio="none">
              <path
                d="M 4 22 C 60 -8, 140 34, 196 6"
                fill="none"
                stroke={single.color}
                strokeWidth={Math.max(1.2, single.width)}
                strokeLinecap="round"
                strokeDasharray={
                  single.style === 'dashed' ? '7 6' : single.style === 'dotted' ? '1 6' : undefined
                }
              />
            </svg>
          </div>
          <div className="field-row" style={{ marginTop: 9 }}>
            <span className="field-label">From</span>
            <span className="hint-text">{fromCard?.title || fromCard?.assetName || 'Unknown card'}</span>
          </div>
          <div className="field-row">
            <span className="field-label">To</span>
            <span className="hint-text">{toCard?.title || toCard?.assetName || 'Unknown card'}</span>
          </div>
        </div>
      )}

      <div className="inspector-section">
        <div className="section-title">Thread appearance</div>
        <div className="field-col">
          <span className="field-label">Colour</span>
          <div className="style-swatches">
            {THREAD_PALETTE.map((color) => (
              <button
                key={color}
                className={`style-swatch ${commonColor === color ? 'is-active' : ''}`}
                style={{ background: color }}
                onClick={() => board.updateThreads(ids, { color }, true)}
              />
            ))}
            <input
              type="color"
              className="color-input"
              value={normalizeColor(commonColor ?? '#b33a3a')}
              onChange={(event) => board.updateThreads(ids, { color: event.target.value }, true)}
            />
          </div>
        </div>
        <div className="field-row" style={{ marginTop: 10 }}>
          <span className="field-label">Thickness</span>
          <RangeField
            value={commonWidth ?? settings.objects.threadWidth}
            min={1}
            max={7}
            step={0.25}
            suffix="px"
            onBegin={() => begin('Edit thread')}
            onChange={(value) => board.updateThreads(ids, { width: value })}
            onEnd={commit}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Opacity</span>
          <RangeField
            value={single?.opacity ?? settings.objects.threadOpacity}
            min={0.2}
            max={1}
            step={0.05}
            format={(value) => `${Math.round(value * 100)}%`}
            onBegin={() => begin('Edit thread')}
            onChange={(value) => board.updateThreads(ids, { opacity: value })}
            onEnd={commit}
          />
        </div>
        {single && (
          <>
            <div className="field-row">
              <span className="field-label">Curve</span>
              <RangeField
                value={single.curve}
                min={-1}
                max={1}
                step={0.05}
                format={(value) => value.toFixed(2)}
                onBegin={() => begin('Edit thread')}
                onChange={(value) => board.updateThread(ids[0], { curve: value })}
                onEnd={commit}
              />
            </div>
            <div className="field-col" style={{ marginTop: 8 }}>
              <span className="field-label">Style</span>
              <select
                className="select"
                value={single.style}
                onChange={(event) =>
                  board.updateThreads(ids, { style: event.target.value as Thread['style'] }, true)
                }
              >
                <option value="thread">Thread</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div className="field-col" style={{ marginTop: 8 }}>
              <span className="field-label">Label</span>
              <TextInput
                value={single.label ?? ''}
                placeholder="Optional label on thread"
                onFocus={() => begin('Edit thread label')}
                onChange={(value) => board.updateThread(ids[0], { label: value })}
                onBlur={commit}
              />
            </div>
          </>
        )}
        <div className="field-row" style={{ marginTop: 9 }}>
          <span className="field-label">Hide thread</span>
          <button
            className={`toggle ${threads.every((item) => item.hidden) ? 'is-on' : ''}`}
            onClick={() => board.hideThreads(ids, !threads.every((item) => item.hidden))}
            aria-label="Hide threads"
          />
        </div>
      </div>

      <div className="inspector-section">
        <div className="section-title">Trace</div>
        <div className="inspector-actions">
          <button
            className="btn btn-sm"
            onClick={() => {
              board.setMode('focus')
              board.selectConnected(settings.interaction.focusDepth)
            }}
          >
            <Focus size={11} /> Select chain
          </button>
          <button className="btn btn-sm" onClick={() => board.selectAll()}>
            Select all
          </button>
        </div>
        <button
          className="btn btn-sm btn-danger"
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => board.deleteThreads(ids)}
        >
          <Trash2 size={11} /> Remove connection
        </button>
      </div>
    </>
  )
}

/* ------------------------------- strokes -------------------------------- */

function StrokesPanel({
  strokes,
  begin,
  commit
}: {
  strokes: Stroke[]
  begin: (label: string) => void
  commit: () => void
}): React.JSX.Element {
  const board = useBoard()
  const settings = useSettings((state) => state.settings)
  const ids = strokes.map((stroke) => stroke.id)
  const single = strokes.length === 1 ? strokes[0] : null
  return (
    <>
      <div className="inspector-section">
        <div className="section-title">Drawing</div>
        <div className="field-row">
          <span className="field-label">Tool</span>
          <span className="kind-pill">{single?.tool ?? `${strokes.length} drawings`}</span>
        </div>
        <div className="field-row">
          <span className="field-label">Points</span>
          <span className="kind-pill">{single ? Math.floor(single.points.length / 2) : '—'}</span>
        </div>
        <div className="field-col" style={{ marginTop: 9 }}>
          <span className="field-label">Ink colour</span>
          <div className="style-swatches">
            {['#e9e6dd', '#c8553d', '#c99a3d', '#5b8db8', '#6e9c73', '#a06aa8', '#8d94a0', '#1b1c20'].map(
              (color) => (
                <button
                  key={color}
                  className="style-swatch"
                  style={{ background: color }}
                  onClick={() => board.updateStroke(ids[0], { color }, true)}
                />
              )
            )}
            <input
              type="color"
              className="color-input"
              value={normalizeColor(strokes[0]?.color ?? settings.objects.drawColor)}
              onChange={(event) => {
                for (const id of ids) board.updateStroke(id, { color: event.target.value })
              }}
              onBlur={() => board.updateStroke(ids[0], { color: strokes[0]?.color }, true)}
            />
          </div>
        </div>
        <div className="field-row" style={{ marginTop: 9 }}>
          <span className="field-label">Width</span>
          <RangeField
            value={single?.width ?? settings.objects.drawWidth}
            min={1}
            max={24}
            step={0.5}
            suffix="px"
            onBegin={() => begin('Edit drawing')}
            onChange={(value) => {
              for (const id of ids) board.updateStroke(id, { width: value })
            }}
            onEnd={commit}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Opacity</span>
          <RangeField
            value={single?.opacity ?? settings.objects.drawOpacity}
            min={0.1}
            max={1}
            step={0.05}
            format={(value) => `${Math.round(value * 100)}%`}
            onBegin={() => begin('Edit drawing')}
            onChange={(value) => {
              for (const id of ids) board.updateStroke(id, { opacity: value })
            }}
            onEnd={commit}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Locked</span>
          <button
            className={`toggle ${strokes.every((stroke) => stroke.locked) ? 'is-on' : ''}`}
            onClick={() => board.toggleLockSelection()}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Hidden</span>
          <button
            className={`toggle ${strokes.every((stroke) => stroke.hidden) ? 'is-on' : ''}`}
            onClick={() => {
              const hidden = !strokes.every((stroke) => stroke.hidden)
              for (const id of ids) board.updateStroke(id, { hidden }, true)
            }}
          />
        </div>
      </div>
      <div className="inspector-section">
        <button
          className="btn btn-sm btn-danger"
          style={{ width: '100%' }}
          onClick={() => board.deleteStrokes(ids)}
        >
          <Trash2 size={11} /> Erase drawing
        </button>
      </div>
    </>
  )
}

/* -------------------------------- groups -------------------------------- */

function GroupsPanel({
  groups,
  begin,
  commit
}: {
  groups: Group[]
  begin: (label: string) => void
  commit: () => void
}): React.JSX.Element {
  const board = useBoard()
  const space = useActiveSpace()
  const single = groups.length === 1 ? groups[0] : null
  const members = single && space ? Object.values(space.cards).filter((card) => card.groupId === single.id) : []
  return (
    <>
      <div className="inspector-section">
        {single && (
          <div className="field-col">
            <span className="field-label">Group title</span>
            <TextInput
              value={single.title}
              onFocus={() => begin('Rename group')}
              onChange={(value) => board.updateGroup(single.id, { title: value })}
              onBlur={commit}
            />
          </div>
        )}
        <div className="field-row" style={{ marginTop: 9 }}>
          <span className="field-label">Cards</span>
          <span className="kind-pill">{single ? members.length : groups.length}</span>
        </div>
        <div className="field-row">
          <span className="field-label">Collapsed</span>
          <button
            className={`toggle ${groups.every((group) => group.collapsed) ? 'is-on' : ''}`}
            onClick={() => {
              for (const group of groups) {
                if (group.collapsed === groups.every((item) => item.collapsed)) {
                  board.toggleGroupCollapsed(group.id)
                }
              }
            }}
          />
        </div>
        <div className="field-col" style={{ marginTop: 9 }}>
          <span className="field-label">Group colour</span>
          <div className="style-swatches">
            {THREAD_PALETTE.map((color) => (
              <button
                key={color}
                className="style-swatch"
                style={{ background: color }}
                onClick={() => {
                  for (const group of groups) board.updateGroup(group.id, { color }, true)
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="inspector-section">
        <div className="inspector-actions">
          <button
            className="btn btn-sm"
            onClick={() => {
              board.clearSelection()
              board.setSelection({ cards: members.map((card) => card.id) })
            }}
          >
            Select member cards
          </button>
          <button className="btn btn-sm" onClick={() => board.toggleLockSelection()}>
            {groups.every((group) => group.locked) ? <Unlock size={11} /> : <Lock size={11} />}
            Lock group
          </button>
        </div>
        <button
          className="btn btn-sm"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => board.ungroup(groups.map((group) => group.id))}
        >
          Ungroup (keep cards)
        </button>
      </div>
    </>
  )
}

/* ------------------------------- controls ------------------------------- */

function TextInput({
  value,
  placeholder,
  onFocus,
  onChange,
  onBlur
}: {
  value: string
  placeholder?: string
  onFocus: () => void
  onChange: (value: string) => void
  onBlur: () => void
}): React.JSX.Element {
  return (
    <input
      className="input"
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
      }}
    />
  )
}

function NumberField({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
  disabled
}: {
  label: string
  value: number
  onChange: (value: number) => void
  onFocus: () => void
  onBlur: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label className="field-col" style={{ gap: 3 }}>
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        value={Math.round(value)}
        disabled={disabled}
        onFocus={onFocus}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}

function RangeField({
  value,
  min,
  max,
  step,
  suffix,
  format,
  onBegin,
  onChange,
  onEnd
}: {
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  format?: (value: number) => string
  onBegin: () => void
  onChange: (value: number) => void
  onEnd: () => void
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
        onPointerDown={onBegin}
        onPointerUp={onEnd}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') onBegin()
        }}
        onKeyUp={onEnd}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="range-value">
        {format ? format(value) : `${Math.round(value * 10) / 10}${suffix ?? ''}`}
      </span>
    </div>
  )
}

function normalizeColor(color: string | undefined): string {
  if (!color) return '#000000'
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
  }
  return '#000000'
}

function ExternalIcon(): React.JSX.Element {
  return <FileText size={11} />
}
