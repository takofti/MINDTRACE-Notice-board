import { Filter, X } from 'lucide-react'
import type { CardKind } from '@shared/types'
import { useBoard, useActiveSpace, cardMatchesFilter } from '@/store/board'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'

const KIND_OPTIONS: { id: CardKind; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'note', label: 'Notes' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'pdf', label: 'PDF' },
  { id: 'doc', label: 'Documents' },
  { id: 'file', label: 'Files' },
  { id: 'link', label: 'Links' }
]

export default function FilterDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const filter = useBoard((state) => state.filter)
  const setFilter = useBoard((state) => state.setFilter)
  const clearFilter = useBoard((state) => state.clearFilter)
  const showHidden = useBoard((state) => state.showHidden)
  const setShowHidden = useBoard((state) => state.setShowHidden)
  const project = useBoard((state) => state.project)
  const space = useActiveSpace()
  const showMinimap = useSettings((state) => state.settings.board.showMinimap)

  if (modal !== 'filters') return null
  const categories = project?.categories ?? []
  const cards = Object.values(space?.cards ?? {})
  const matched = cards.filter((card) => cardMatchesFilter(card, filter, categories)).length
  const anyFilter = Boolean(filter.query || filter.categories.length || filter.kinds.length)

  const commit = (patch: Partial<typeof filter>): void => {
    const next = { ...filter, ...patch }
    setFilter({
      ...patch,
      active: Boolean(next.query || next.categories.length || next.kinds.length)
    })
  }

  const toggleCategory = (id: string): void => {
    commit({
      categories: filter.categories.includes(id)
        ? filter.categories.filter((category) => category !== id)
        : [...filter.categories, id]
    })
  }

  const toggleKind = (id: CardKind): void => {
    commit({
      kinds: filter.kinds.includes(id)
        ? filter.kinds.filter((kind) => kind !== id)
        : [...filter.kinds, id]
    })
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="dialog filter-dialog" role="dialog" aria-modal="true" aria-label="Filter cards">
        <div className="dialog-head">
          <div className="head-icon">
            <Filter size={16} />
          </div>
          <div>
            <h2>Filter this board</h2>
            <p>Filtered cards keep their position. Nothing is moved or deleted.</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title="Close">
            <X size={15} />
          </button>
        </div>
        <div className="dialog-body filter-body">
          <div className="field-col">
            <span className="field-label">Text in title, notes, files or categories</span>
            <input
              className="input"
              value={filter.query}
              onChange={(event) => commit({ query: event.target.value })}
              placeholder="Search this board…"
              autoFocus
            />
          </div>

          <div className="field-col" style={{ marginTop: 16 }}>
            <div className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Categories</span>
              <span className="filter-preview-count">
                {matched} / {cards.length} cards
              </span>
            </div>
            <div className="chip-row">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`chip ${filter.categories.includes(category.id) ? 'is-active' : ''}`}
                  style={filter.categories.includes(category.id) ? { borderColor: category.color } : undefined}
                  onClick={() => toggleCategory(category.id)}
                >
                  <span className="chip-dot" style={{ background: category.color }} />
                  {category.name}
                </button>
              ))}
              {!categories.length && <span className="hint-text">No categories yet.</span>}
            </div>
          </div>

          <div className="field-col" style={{ marginTop: 16 }}>
            <span className="field-label">Material type</span>
            <div className="filter-kinds">
              {KIND_OPTIONS.map((kind) => (
                <button
                  key={kind.id}
                  className={`chip ${filter.kinds.includes(kind.id) ? 'is-active' : ''}`}
                  onClick={() => toggleKind(kind.id)}
                >
                  {kind.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divider-full" />

          <div className="setting-row">
            <div className="setting-label">
              <strong>Show hidden cards</strong>
              <small>Reveal cards you tucked away, as faint ghosts.</small>
            </div>
            <button
              className={`toggle ${showHidden ? 'is-on' : ''}`}
              onClick={() => setShowHidden(!showHidden)}
              aria-label="Show hidden cards"
            />
          </div>

          <div className="setting-row" style={{ marginTop: 8 }}>
            <div className="setting-label">
              <strong>Minimap</strong>
              <small>Toggle the overview map for this and future sessions.</small>
            </div>
            <button
              className={`toggle ${showMinimap ? 'is-on' : ''}`}
              onClick={() => useSettings.getState().update('board', { showMinimap: !showMinimap })}
              aria-label="Show minimap"
            />
          </div>

          <div className="warning-box" style={{ marginTop: 14 }}>
            Active filter: {anyFilter ? 'yes' : 'no'}. Cards outside the filter are hidden, but their threads and
            layout are preserved. Clear the filter to bring them back.
          </div>
        </div>
        <div className="dialog-foot">
          <div className="left">
            {filter.active && <span>{matched} visible</span>}
            {!filter.active && <span>No filter active</span>}
          </div>
          <button
            className="btn"
            onClick={() => {
              clearFilter()
            }}
          >
            Clear filters
          </button>
          <button className="btn btn-primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
