import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  Pencil,
  Pin,
  Scan,
  StickyNote,
  Trash2,
  Type,
  Unlock,
  X
} from 'lucide-react'
import { THREAD_PALETTE } from '@/core/defaults'
import { groupBounds } from '@/core/geometry'
import { useActiveSpace, useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { emitBoardEvent, BOARD_EVENTS } from '@/services/events'
import { createSnapshot } from '@/services/storage'
import { useT } from '@/i18n'

export default function ContextMenu(): React.JSX.Element | null {
  const target = useUi((state) => state.contextMenu)
  const close = useUi((state) => state.closeContextMenu)
  const ask = useUi((state) => state.ask)
  const toast = useUi((state) => state.toast)
  const openModal = useUi((state) => state.openModal)
  const setRenameSpaceId = useUi((state) => state.setRenameSpaceId)
  const board = useBoard()
  const space = useActiveSpace()
  const settings = useSettings((state) => state.settings)
  const updateSettings = useSettings((state) => state.update)
  const t = useT()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!target) return
    const rect = menuRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(8, Math.min(target.screen.x, window.innerWidth - rect.width - 8))
    const y = Math.max(8, Math.min(target.screen.y, window.innerHeight - rect.height - 8))
    setPosition({ x, y })
  }, [target])

  useEffect(() => {
    if (!target) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) close()
    }
    const onScroll = (): void => close()
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('scroll', onScroll, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [target, close])

  if (!target || !space) return null

  const run = (action: () => void): void => {
    action()
    close()
  }

  const project = board.project
  const card = target.type === 'card' ? space.cards[target.id] : null
  const thread = target.type === 'thread' ? space.threads[target.id] : null
  const stroke = target.type === 'stroke' ? space.strokes[target.id] : null
  const group = target.type === 'group' ? space.groups[target.id] : null
  const targetSpace = target.type === 'spaceTab' ? project?.spaces.find((item) => item.id === target.id) : null

  const focusCard = (id: string, chain = false): void => {
    board.selectCard(id)
    if (chain) board.selectConnected(settings.interaction.focusDepth)
    board.setMode('focus')
  }

  const addPinHere = (): void => {
    if (!card || !target || target.type !== 'card') return
    const nx = Math.min(1, Math.max(0, (target.world.x - card.x) / card.w))
    const ny = Math.min(1, Math.max(0, (target.world.y - card.y) / card.h))
    const pin = board.addPin(card.id, nx, ny)
    if (pin) toast('Pin added. Drag from it to tie a thread.', 'success', 2400)
  }

  const deleteSpace = (id: string, name: string): void => {
    if (!project || project.spaces.length <= 1) {
      toast('A project needs at least one space.', 'info')
      return
    }
    ask({
      title: t('Delete space?'),
      message: t('“{name}” and everything pinned to it will be removed. An undo step is available immediately afterwards, and the project keeps rolling backups.', { name }),
      confirmLabel: t('Delete space'),
      danger: true,
      action: () => {
        if (project && settings.data.snapshotOnSpaceDelete) {
          void createSnapshot(project.id, 'before-space-delete')
        }
        board.deleteSpace(id)
        toast(t('Space deleted — Ctrl+Z to restore'), 'info', 2600)
      }
    })
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {card && (
        <>
          <div className="context-label">{kindLabel(card.kind)}</div>
          {(card.kind === 'text' || card.kind === 'note') && (
            <MenuItem
              icon={Pencil}
              label={t('Edit text')}
              onClick={() =>
                run(() => {
                  board.selectCard(card.id)
                  board.setEditingCard(card.id)
                })
              }
            />
          )}
          <MenuItem
            icon={Copy}
            label={t('Duplicate')}
            hint="Ctrl+D"
            onClick={() => run(() => board.duplicateSelection())}
          />
          <MenuItem
            icon={Copy}
            label={t('Copy')}
            hint="Ctrl+C"
            onClick={() => {
              const count = board.copySelection()
              close()
              if (count)
                toast(
                  t(count === 1 ? 'Copied {count} object' : 'Copied {count} objects', { count }),
                  'success',
                  1500
                )
            }}
          />
          <MenuItem
            icon={Focus}
            label={t('Focus on this card')}
            onClick={() => run(() => focusCard(card.id))}
          />
          <MenuItem
            icon={Link2}
            label={t('Select connected chain ({count})', { count: settings.interaction.focusDepth })}
            onClick={() => run(() => focusCard(card.id, true))}
          />
          <div className="context-sep" />
          <MenuItem
            icon={ChevronsUp}
            label={t('Bring to front')}
            onClick={() => run(() => board.bringForward('front'))}
          />
          <MenuItem
            icon={ArrowUp}
            label={t('Bring forward')}
            onClick={() => run(() => board.bringForward('forward'))}
          />
          <MenuItem
            icon={ArrowDown}
            label={t('Send backward')}
            onClick={() => run(() => board.bringForward('backward'))}
          />
          <MenuItem
            icon={ChevronsDown}
            label={t('Send to back')}
            onClick={() => run(() => board.bringForward('back'))}
          />
          <div className="context-sep" />
          <MenuItem icon={Pin} label={t('Add pin here')} hint="Alt+click" onClick={() => run(addPinHere)} />
          <MenuItem
            icon={card.locked ? Unlock : Lock}
            label={t(card.locked ? 'Unlock card' : 'Lock in place')}
            onClick={() =>
              run(() => {
                board.selectCard(card.id)
                board.toggleLockSelection()
              })
            }
          />
          <MenuItem
            icon={card.hidden ? Eye : EyeOff}
            label={t(card.hidden ? 'Show card' : 'Hide card')}
            onClick={() =>
              run(() => {
                board.selectCard(card.id)
                board.toggleHiddenSelection()
              })
            }
          />
          <MenuItem
            icon={Layers}
            label={t('Group selected cards')}
            hint="Ctrl+G"
            onClick={() => {
              const id = board.groupSelection()
              close()
              if (id) toast(t('Cards grouped'), 'success', 1500)
            }}
          />
          {project && project.categories.length > 0 && (
            <>
              <div className="context-sep" />
              <div className="context-label">{t('Categories')}</div>
              {project.categories.map((category) => {
                const active = card.categories.includes(category.id)
                return (
                  <button
                    key={category.id}
                    className="context-item"
                    onClick={() =>
                      run(() => {
                        if (!board.selection.cards.includes(card.id)) board.selectCard(card.id)
                        board.toggleCategoryOnSelection(category.id)
                      })
                    }
                  >
                    <span className="ctx-icon">
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: category.color,
                          display: 'block'
                        }}
                      />
                    </span>
                    <span>{category.name}</span>
                    {active && <Check size={12} style={{ marginLeft: 'auto', color: 'var(--success)' }} />}
                  </button>
                )
              })}
            </>
          )}
          <div className="context-sep" />
          <MenuItem
            icon={Trash2}
            label={t('Delete card')}
            hint="Del"
            danger
            onClick={() => run(() => board.deleteSelection())}
          />
        </>
      )}

      {thread && (
        <>
          <div className="context-label">{t('Thread')}</div>
          <div className="context-label" style={{ paddingTop: 2 }}>
            {t('Colour')}
          </div>
          <div className="context-swatches">
            {THREAD_PALETTE.map((color) => (
              <button
                key={color}
                className={`context-swatch ${thread.color === color ? 'is-active' : ''}`}
                style={{ background: color }}
                title={`Thread colour ${color}`}
                onClick={() => run(() => board.updateThread(thread.id, { color }, true))}
              />
            ))}
          </div>
          <MenuItem
            icon={EyeOff}
            label={t(thread.hidden ? 'Show thread' : 'Hide thread')}
            onClick={() => {
              board.hideThreads([thread.id], !thread.hidden)
              close()
            }}
          />
          <MenuItem
            icon={X}
            label={t('Remove thread')}
            hint="Del"
            danger
            onClick={() => run(() => board.deleteThreads([thread.id]))}
          />
          <div className="context-sep" />
          <div className="context-label" style={{ lineHeight: 1.5 }}>
            Select the thread to edit its label, width, curve and opacity in the inspector.
          </div>
        </>
      )}

      {stroke && (
        <>
          <div className="context-label">{t('Drawing')}</div>
          <MenuItem
            icon={stroke.locked ? Unlock : Lock}
            label={t(stroke.locked ? 'Unlock drawing' : 'Lock drawing')}
            onClick={() =>
              run(() => {
                board.selectStroke(stroke.id)
                board.toggleLockSelection()
              })
            }
          />
          <MenuItem
            icon={EyeOff}
            label={t(stroke.hidden ? 'Show drawing' : 'Hide drawing')}
            onClick={() => run(() => board.updateStroke(stroke.id, { hidden: !stroke.hidden }, true))}
          />
          <MenuItem
            icon={Trash2}
            label={t('Erase drawing')}
            hint="Del"
            danger
            onClick={() => run(() => board.deleteStrokes([stroke.id]))}
          />
        </>
      )}

      {group && (
        <>
          <div className="context-label">{t('Group')}</div>
          <MenuItem
            icon={group.collapsed ? ChevronsDown : ChevronsUp}
            label={t(group.collapsed ? 'Expand group' : 'Collapse group')}
            onClick={() => run(() => board.toggleGroupCollapsed(group.id))}
          />
          <div className="context-label">{t('Group colour')}</div>
          <div className="context-swatches">
            {THREAD_PALETTE.map((color) => (
              <button
                key={color}
                className={`context-swatch ${group.color === color ? 'is-active' : ''}`}
                style={{ background: color }}
                onClick={() => run(() => board.updateGroup(group.id, { color }, true))}
              />
            ))}
          </div>
          <MenuItem
            icon={group.locked ? Unlock : Lock}
            label={t(group.locked ? 'Unlock group' : 'Lock group')}
            onClick={() =>
              run(() => {
                board.selectGroup(group.id)
                board.toggleLockSelection()
              })
            }
          />
          <MenuItem
            icon={Layers}
            label={t('Ungroup (keep cards)')}
            onClick={() => run(() => board.ungroup([group.id]))}
          />
          <div className="context-sep" />
          <MenuItem
            icon={Trash2}
            label={t('Remove group frame')}
            danger
            onClick={() => run(() => board.ungroup([group.id]))}
          />
        </>
      )}

      {target.type === 'canvas' && (
        <>
          <div className="context-label">{t('Board')}</div>
          <MenuItem
            icon={StickyNote}
            label={t('New note here')}
            onClick={() => run(() => board.createCard('note', target.world))}
          />
          <MenuItem
            icon={Type}
            label={t('New text card here')}
            onClick={() => run(() => board.createCard('text', target.world))}
          />
          <MenuItem
            icon={Pin}
            label={t('Add material…')}
            onClick={() => {
              emitBoardEvent(BOARD_EVENTS.attach)
              close()
            }}
          />
          <MenuItem
            icon={Copy}
            label={t('Paste here')}
            hint="Ctrl+V"
            disabled={!board.clipboard}
            onClick={() => {
              const count = board.pasteClipboard(target.world)
              close()
              if (count)
                toast(
                  t(count === 1 ? 'Pasted {count} object' : 'Pasted {count} objects', { count }),
                  'success',
                  1400
                )
            }}
          />
          <div className="context-sep" />
          <MenuItem icon={Scan} label={t('Fit board')} hint="Ctrl+0" onClick={() => run(() => emitBoardEvent(BOARD_EVENTS.fit))} />
          <MenuItem
            icon={Crosshair}
            label={t('Center on content')}
            onClick={() => run(() => emitBoardEvent(BOARD_EVENTS.center))}
          />
          <MenuItem
            icon={LayoutGrid}
            label={t(settings.ui.showGridByDefault ? 'Hide grid' : 'Show grid')}
            onClick={() => {
              updateSettings('ui', { showGridByDefault: !settings.ui.showGridByDefault })
              close()
            }}
          />
          <MenuItem
            icon={board.showHidden ? EyeOff : Eye}
            label={t(board.showHidden ? 'Hide hidden cards' : 'Show hidden cards')}
            onClick={() => {
              board.setShowHidden(!board.showHidden)
              close()
            }}
          />
          <div className="context-sep" />
          <MenuItem
            icon={Focus}
            label={t(board.mode === 'focus' ? 'Leave focus mode' : 'Select all & focus')}
            onClick={() =>
              run(() => {
                board.selectAll()
                board.setMode(board.mode === 'focus' ? 'normal' : 'focus')
              })
            }
          />
          <MenuItem icon={Layers} label={t('Select all')} hint="Ctrl+A" onClick={() => run(() => board.selectAll())} />
        </>
      )}

      {target.type === 'spaceTab' && targetSpace && (
        <>
          <div className="context-label">{t('Space')}</div>
          <MenuItem
            icon={Pencil}
            label={t('Rename space')}
            onClick={() => {
              board.switchSpace(targetSpace.id)
              setRenameSpaceId(targetSpace.id)
              close()
            }}
          />
          <MenuItem icon={Copy} label={t('Duplicate space')} onClick={() => run(() => board.duplicateSpace(targetSpace.id))} />
          <MenuItem
            icon={Trash2}
            label={t('Delete space')}
            danger
            disabled={(project?.spaces.length ?? 0) <= 1}
            onClick={() => {
              close()
              deleteSpace(targetSpace.id, targetSpace.name)
            }}
          />
          <div className="context-sep" />
          <div className="context-label" style={{ lineHeight: 1.5 }}>
            {t('{cards} cards · {threads} threads', {
              cards: Object.keys(targetSpace.cards).length,
              threads: Object.keys(targetSpace.threads).length
            })}
          </div>
        </>
      )}

      {target.type === 'project' && (
        <>
          <div className="context-label">{t('Project')}</div>
          <MenuItem icon={Scan} label={t('Open project manager…')} onClick={() => run(() => openModal('projects'))} />
          <MenuItem icon={Copy} label={t('Export board or project…')} onClick={() => run(() => openModal('export'))} />
        </>
      )}

      {!card && !thread && !stroke && !group && target.type !== 'canvas' && target.type !== 'spaceTab' && target.type !== 'project' && (
        <div className="context-label">{t('Nothing selected')}</div>
      )}

      <div className="context-sep" />
      <div className="context-label" style={{ paddingBottom: 5 }}>
        {card && `${Math.round(card.w)} × ${Math.round(card.h)} px`}
        {thread && `${Math.round(thread.width)} px thread`}
        {group && `${groupBounds(group, space.cards).w | 0} × ${groupBounds(group, space.cards).h | 0} px`}
        {target.type === 'canvas' && `x ${Math.round(target.world.x)} · y ${Math.round(target.world.y)}`}
        {target.type === 'spaceTab' && targetSpace?.description}
      </div>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  danger,
  disabled,
  onClick
}: {
  icon: typeof Copy
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={`context-item ${danger ? 'is-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
    >
      <span className="ctx-icon">
        <Icon size={13} />
      </span>
      <span>{label}</span>
      {hint && <span className="ctx-hint">{hint}</span>}
    </button>
  )
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}