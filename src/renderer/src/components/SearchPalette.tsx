import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  FileText,
  FolderOpen,
  Layers,
  Plus,
  Search,
  StickyNote,
  Type,
  X
} from 'lucide-react'
import type { Card, Project, Space, Thread } from '@shared/types'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { contentBounds, plainTextFromHtml } from '@/core/geometry'
import { groupBounds } from '@/core/geometry'
import { emitBoardEvent, BOARD_EVENTS } from '@/services/events'

type Item =
  | { kind: 'card'; key: string; space: Space; card: Card; title: string; sub: string }
  | { kind: 'thread'; key: string; space: Space; thread: Thread; title: string; sub: string }
  | { kind: 'group'; key: string; space: Space; groupId: string; title: string; sub: string }
  | { kind: 'space'; key: string; space: Space; title: string; sub: string }

export default function SearchPalette(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const project = useBoard((state) => state.project)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (modal !== 'search') {
      setQuery('')
      setActive(0)
      return
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [modal])

  const items = useMemo(() => (project ? buildItems(project, query) : []), [project, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-result-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (modal !== 'search' || !project) return null

  const open = (item: Item): void => {
    const board = useBoard.getState()
    board.switchSpace(item.space.id)
    if (item.kind === 'card') {
      board.clearSelection()
      board.selectCard(item.card.id)
      board.setCamera(item.space.id, {
        x: item.card.x + item.card.w / 2,
        y: item.card.y + item.card.h / 2,
        zoom: Math.max(item.space.camera.zoom, 0.82)
      })
    } else if (item.kind === 'thread') {
      const from = item.space.cards[item.thread.from.cardId]
      const to = item.space.cards[item.thread.to.cardId]
      board.selectThread(item.thread.id)
      if (from && to) {
        board.setCamera(item.space.id, {
          x: (from.x + from.w / 2 + to.x + to.w / 2) / 2,
          y: (from.y + from.h / 2 + to.y + to.h / 2) / 2,
          zoom: Math.max(item.space.camera.zoom, 0.7)
        })
      }
    } else if (item.kind === 'group') {
      const group = item.space.groups[item.groupId]
      board.selectGroup(item.groupId)
      if (group) {
        const bounds = groupBounds(group, item.space.cards)
        board.setCamera(item.space.id, {
          x: bounds.x + bounds.w / 2,
          y: bounds.y + bounds.h / 2,
          zoom: Math.max(item.space.camera.zoom, 0.6)
        })
      }
    } else {
      board.switchSpace(item.space.id)
      const bounds = contentBounds(item.space, { includeStrokes: true })
      if (bounds) {
        board.setCamera(item.space.id, {
          x: bounds.x + bounds.w / 2,
          y: bounds.y + bounds.h / 2
        })
      }
    }
    close()
  }

  const createCardFromQuery = (kind: 'note' | 'text'): void => {
    const board = useBoard.getState()
    const space = board.project?.spaces.find((item) => item.id === board.activeSpaceId)
    if (!space) return
    const center = {
      x: space.camera.x,
      y: space.camera.y
    }
    const card = board.createCard(kind, center, {
      title: query.trim(),
      body: `<p>${escapeHtml(query.trim())}</p>`
    })
    if (card) {
      board.setEditingCard(card.id)
      board.setCamera(space.id, center)
    }
    close()
  }

  const groups = {
    card: items.filter((item) => item.kind === 'card'),
    thread: items.filter((item) => item.kind === 'thread'),
    group: items.filter((item) => item.kind === 'group'),
    space: items.filter((item) => item.kind === 'space')
  }
  const orderedItems = [...groups.card, ...groups.thread, ...groups.group, ...groups.space]

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((value) => Math.min(orderedItems.length - 1, value + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((value) => Math.max(0, value - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = orderedItems[active]
      if (item) open(item)
      else if (query.trim()) createCardFromQuery('note')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  let index = -1

  return (
    <div className="search-overlay" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search">
        <div className="search-input-row">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            placeholder="Search cards, notes, files, categories, threads…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="kbd">Esc</span>
          <button className="icon-btn" onClick={close} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="search-results" ref={listRef}>
          {items.length === 0 && query.trim() && (
            <div className="search-empty">
              <p>Nothing matches “{query.trim()}” yet.</p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button className="btn btn-sm" onClick={() => createCardFromQuery('note')}>
                  <StickyNote size={12} /> Create a note with this title
                </button>
                <button className="btn btn-sm" onClick={() => createCardFromQuery('text')}>
                  <Type size={12} /> Create a card
                </button>
              </div>
            </div>
          )}
          {items.length === 0 && !query.trim() && (
            <div className="search-empty">Start typing to search every space in this project.</div>
          )}

          {groups.card.length > 0 && (
            <>
              <div className="search-group-label">Cards &amp; materials</div>
              {groups.card.map((item) => {
                index++
                return (
                  <ResultRow
                    key={item.key}
                    index={index}
                    active={index === active}
                    icon={<FileText size={13} />}
                    title={item.title}
                    sub={item.sub}
                    space={item.space.name}
                    onClick={() => open(item)}
                    onHover={() => setActive(index)}
                  />
                )
              })}
            </>
          )}

          {groups.thread.length > 0 && (
            <>
              <div className="search-group-label">Threads</div>
              {groups.thread.map((item) => {
                index++
                return (
                  <ResultRow
                    key={item.key}
                    index={index}
                    active={index === active}
                    icon={<ArrowRight size={13} />}
                    title={item.title}
                    sub={item.sub}
                    space={item.space.name}
                    onClick={() => open(item)}
                    onHover={() => setActive(index)}
                  />
                )
              })}
            </>
          )}

          {groups.group.length > 0 && (
            <>
              <div className="search-group-label">Groups</div>
              {groups.group.map((item) => {
                index++
                return (
                  <ResultRow
                    key={item.key}
                    index={index}
                    active={index === active}
                    icon={<Layers size={13} />}
                    title={item.title}
                    sub={item.sub}
                    space={item.space.name}
                    onClick={() => open(item)}
                    onHover={() => setActive(index)}
                  />
                )
              })}
            </>
          )}

          {groups.space.length > 0 && (
            <>
              <div className="search-group-label">Spaces</div>
              {groups.space.map((item) => {
                index++
                return (
                  <ResultRow
                    key={item.key}
                    index={index}
                    active={index === active}
                    icon={<FolderOpen size={13} />}
                    title={item.title}
                    sub={item.sub}
                    space=""
                    onClick={() => open(item)}
                    onHover={() => setActive(index)}
                  />
                )
              })}
            </>
          )}

          {!query.trim() && (
            <div style={{ display: 'flex', gap: 5, padding: '12px 8px' }}>
              <button
                className="btn btn-sm"
                onClick={() => {
                  useUi.getState().closeModal()
                  emitBoardEvent(BOARD_EVENTS.create, { kind: 'note' })
                }}
              >
                <StickyNote size={11} /> New note
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  useUi.getState().closeModal()
                  emitBoardEvent(BOARD_EVENTS.attach)
                }}
              >
                <Plus size={11} /> Add material
              </button>
            </div>
          )}
        </div>

        <div className="search-footer">
          <span className="kbd">↑↓</span> navigate
          <span className="kbd">Enter</span> jump to board
          <span className="spacer" />
          <span>Cards, files, categories and threads are searched together</span>
        </div>
      </div>
    </div>
  )
}

function ResultRow({
  index,
  active,
  icon,
  title,
  sub,
  space,
  onClick,
  onHover
}: {
  index: number
  active: boolean
  icon: React.ReactNode
  title: string
  sub: string
  space: string
  onClick: () => void
  onHover: () => void
}): React.JSX.Element {
  return (
    <button
      className={`search-result ${active ? 'is-active' : ''}`}
      data-result-index={index}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <span className="result-icon">{icon}</span>
      <span className="result-main">
        <span className="result-title">{title || 'Untitled'}</span>
        {sub && <span className="result-sub">{sub}</span>}
      </span>
      {space && <span className="result-space">{space}</span>}
    </button>
  )
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildItems(project: Project, query: string): Item[] {
  const term = query.trim().toLowerCase()
  const items: Item[] = []
  const categoryName = (id: string): string =>
    project.categories.find((category) => category.id === id)?.name ?? ''
  for (const space of project.spaces) {
    if (!term || space.name.toLowerCase().includes(term) || space.description.toLowerCase().includes(term)) {
      items.push({
        kind: 'space',
        key: `space:${space.id}`,
        space,
        title: space.name,
        sub: space.description || `${Object.keys(space.cards).length} cards`
      })
    }
    for (const card of Object.values(space.cards)) {
      if (card.hidden) continue
      const categoryText = card.categories.map(categoryName).join(' ')
      const haystack = [
        card.title,
        plainTextFromHtml(card.body),
        card.assetName ?? '',
        card.caption ?? '',
        card.kind,
        card.mime ?? '',
        categoryText
      ]
        .join(' ')
        .toLowerCase()
      if (term && !haystack.includes(term)) continue
      items.push({
        kind: 'card',
        key: `card:${card.id}`,
        space,
        card,
        title: card.title || card.assetName || plainTextFromHtml(card.body).slice(0, 60) || card.kind,
        sub:
          [card.kind, categoryText, card.caption ?? ''].filter(Boolean).join(' · ') ||
          plainTextFromHtml(card.body).slice(0, 90)
      })
      if (!term && items.filter((item) => item.kind === 'card').length >= 12) break
    }
    for (const thread of Object.values(space.threads)) {
      const label = thread.label ?? ''
      if (!term) continue
      if (!label.toLowerCase().includes(term)) continue
      items.push({
        kind: 'thread',
        key: `thread:${thread.id}`,
        space,
        thread,
        title: label,
        sub: 'Connection label'
      })
    }
    for (const group of Object.values(space.groups)) {
      if (!term || !group.title.toLowerCase().includes(term)) continue
      const count = Object.values(space.cards).filter((card) => card.groupId === group.id).length
      items.push({
        kind: 'group',
        key: `group:${group.id}`,
        space,
        groupId: group.id,
        title: group.title,
        sub: `${count} cards`
      })
    }
  }
  return items.slice(0, 80)
}
