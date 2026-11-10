import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import type { Space } from '@shared/types'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { groupBounds, groupMemberCards } from '@/core/geometry'

interface GroupLayerProps {
  space: Space
  visibleCardIds: Set<string>
  visibleGroupIds: Set<string>
  focusIds: Set<string> | null
}

export default function GroupLayer({ space, visibleCardIds, visibleGroupIds, focusIds }: GroupLayerProps): React.JSX.Element {
  const selection = useBoard((state) => state.selection)
  const mode = useBoard((state) => state.mode)
  const toggleGroup = useBoard((state) => state.toggleGroupCollapsed)
  const updateGroup = useBoard((state) => state.updateGroup)
  const openContextMenu = useUi((state) => state.openContextMenu)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedGroups = new Set(selection.groups)

  useEffect(() => {
    if (renaming) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [renaming])

  const groups = Object.values(space.groups).filter((group) => {
    const members = groupMemberCards(group.id, space.cards)
    if (!members.length) return false
    if (selectedGroups.has(group.id)) return true
    if (visibleGroupIds.has(group.id)) return true
    return members.some((card) => visibleCardIds.has(card.id))
  })

  return (
    <div className="groups-layer">
      {groups.map((group) => {
        const members = groupMemberCards(group.id, space.cards)
        const bounds = groupBounds(group, space.cards)
        const selected = selectedGroups.has(group.id)
        const dimmed =
          mode === 'focus' &&
          Boolean(focusIds?.size) &&
          !members.some((card) => focusIds?.has(card.id))
        return (
          <div
            key={group.id}
            className={[
              'group-frame',
              group.collapsed ? 'is-collapsed' : '',
              selected ? 'selected' : '',
              dimmed ? 'is-dimmed' : ''
            ].join(' ')}
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.w,
              height: bounds.h,
              ['--group-color' as string]: group.color
            }}
          >
            <div
              className="group-head"
              data-group-id={group.id}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openContextMenu({
                  type: 'group',
                  id: group.id,
                  screen: { x: event.clientX, y: event.clientY },
                  world: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
                })
              }}
            >
              <button
                data-no-drag
                data-interactive
                onClick={(event) => {
                  event.stopPropagation()
                  toggleGroup(group.id)
                }}
                title={group.collapsed ? 'Expand group' : 'Collapse group'}
              >
                {group.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              {renaming === group.id ? (
                <input
                  ref={inputRef}
                  className="group-title"
                  value={draft}
                  data-interactive
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: 0,
                    outline: 'none',
                    borderRadius: 3,
                    padding: '1px 4px',
                    color: 'inherit',
                    font: 'inherit',
                    minWidth: 60
                  }}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => {
                    if (draft.trim()) updateGroup(group.id, { title: draft.trim() }, true)
                    setRenaming(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                    if (event.key === 'Escape') setRenaming(null)
                    event.stopPropagation()
                  }}
                />
              ) : (
                <span
                  className="group-title"
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    setDraft(group.title)
                    setRenaming(group.id)
                  }}
                  title="Double-click to rename"
                >
                  {group.title}
                </span>
              )}
              <span className="group-count">{members.length}</span>
              {group.locked && <Lock size={10} style={{ opacity: 0.6 }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
