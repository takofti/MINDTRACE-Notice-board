import { useEffect } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { DecorAction } from '@shared/settings'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { emitBoardEvent, BOARD_EVENTS } from '@/services/events'
import { saveProjectNow } from '@/services/bootstrap'

interface ParsedCombo {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
}

export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  const keyPart = parts.length ? parts[parts.length - 1] : ''
  return {
    key: keyPart.toLowerCase(),
    ctrl: parts.some((part) => /^(ctrl|control|cmd|meta)$/i.test(part)),
    shift: parts.some((part) => /^shift$/i.test(part)),
    alt: parts.some((part) => /^alt$/i.test(part))
  }
}

export function comboMatches(event: KeyboardEvent | ReactKeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo)
  if (!parsed.key) return false
  const key = event.key.toLowerCase()
  const normalizedKey =
    key === ' ' ? 'space' : key === 'esc' ? 'escape' : key === 'del' ? 'delete' : key
  if (normalizedKey !== parsed.key) return false
  const ctrl = event.ctrlKey || event.metaKey
  if (ctrl !== parsed.ctrl) return false
  if (event.shiftKey !== parsed.shift) return false
  if (event.altKey !== parsed.alt) return false
  return true
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [data-allow-keys]')
  )
}

export function useHotkeys(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const board = useBoard.getState()
      const ui = useUi.getState()
      const settings = useSettings.getState().settings
      const bindings = settings.interaction.keybindings
      const editing = isEditingTarget(event.target)

      if (event.key === 'Escape') {
        if (ui.lightbox) {
          ui.closeLightbox()
          event.preventDefault()
          return
        }
        if (ui.confirmDialog) {
          void ui.resolveConfirm(false)
          event.preventDefault()
          return
        }
        if (ui.contextMenu) {
          ui.closeContextMenu()
          event.preventDefault()
          return
        }
        if (ui.modal) {
          ui.closeModal()
          event.preventDefault()
          return
        }
        emitBoardEvent(BOARD_EVENTS.escape)
        if (editing) (event.target as HTMLElement).blur()
        else if (board.editingCardId) board.setEditingCard(null)
        else if (
          board.selection.cards.length ||
          board.selection.threads.length ||
          board.selection.strokes.length ||
          board.selection.groups.length
        ) {
          board.clearSelection()
        } else if (board.tool !== 'select') {
          board.setTool('select')
        }
        event.preventDefault()
        return
      }

      if (ui.lightbox || ui.confirmDialog) return

      const matches = (action: DecorAction): boolean => {
        const combo = bindings[action]
        return combo ? comboMatches(event, combo) : false
      }

      if (!editing && matches('search')) {
        event.preventDefault()
        ui.openModal(ui.modal === 'search' ? null : 'search')
        return
      }

      if (editing) return

      if (ui.modal) return

      if (matches('undo')) {
        event.preventDefault()
        board.undo()
        return
      }
      if (matches('redo')) {
        event.preventDefault()
        board.redo()
        return
      }
      if (matches('copy')) {
        event.preventDefault()
        const count = board.copySelection()
        if (count) ui.toast(`Copied ${count} object${count === 1 ? '' : 's'}`, 'success', 1600)
        else ui.toast('Select cards or drawings to copy', 'info', 1600)
        return
      }
      if (matches('paste')) {
        event.preventDefault()
        if (board.clipboard) emitBoardEvent(BOARD_EVENTS.paste)
        else ui.toast('Clipboard is empty', 'info', 1600)
        return
      }
      if (matches('duplicate')) {
        event.preventDefault()
        board.duplicateSelection()
        return
      }
      if (matches('delete')) {
        event.preventDefault()
        board.deleteSelection()
        return
      }
      if (matches('selectAll')) {
        event.preventDefault()
        board.selectAll()
        return
      }
      if (matches('group')) {
        event.preventDefault()
        if (board.selection.cards.length) {
          board.groupSelection()
          ui.toast('Cards grouped', 'success', 1400)
        }
        return
      }
      if (matches('newNote')) {
        event.preventDefault()
        emitBoardEvent(BOARD_EVENTS.create, { kind: 'note' })
        return
      }
      if (matches('newText')) {
        event.preventDefault()
        emitBoardEvent(BOARD_EVENTS.create, { kind: 'text' })
        return
      }
      if (matches('fitBoard')) {
        event.preventDefault()
        emitBoardEvent(BOARD_EVENTS.fit)
        return
      }
      if (matches('resetZoom')) {
        event.preventDefault()
        emitBoardEvent(BOARD_EVENTS.resetZoom)
        return
      }
      if (matches('toggleMode')) {
        event.preventDefault()
        const order = ['normal', 'focus', 'overview'] as const
        board.setMode(order[(order.indexOf(board.mode) + 1) % order.length])
        return
      }
      if (matches('save')) {
        event.preventDefault()
        void saveProjectNow().then(() => {
          const state = useBoard.getState()
          if (state.saveState === 'error') {
            useUi.getState().toast(state.saveError ?? 'Could not save project', 'error', 4000)
          } else {
            useUi.getState().toast('Project saved', 'success', 1400)
          }
        })
        return
      }
      if (matches('toggleGrid')) {
        event.preventDefault()
        useSettings.getState().update('ui', { showGridByDefault: !settings.ui.showGridByDefault })
        ui.toast(settings.ui.showGridByDefault ? 'Grid hidden' : 'Grid shown', 'info', 1200)
        return
      }
      if (matches('toggleMinimap')) {
        event.preventDefault()
        useSettings.getState().update('board', { showMinimap: !settings.board.showMinimap })
        return
      }
      if (matches('settings')) {
        event.preventDefault()
        ui.openModal('settings')
        return
      }
      if (matches('export')) {
        event.preventDefault()
        ui.openModal('export')
        return
      }

      if (event.key === 'Enter' && board.selection.cards.length === 1) {
        const space = board.project?.spaces.find((item) => item.id === board.activeSpaceId)
        const card = space?.cards[board.selection.cards[0]]
        if (card && (card.kind === 'text' || card.kind === 'note')) {
          event.preventDefault()
          board.setEditingCard(card.id)
        }
        return
      }

      if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey) {
        const hasSelection = board.selection.cards.length || board.selection.strokes.length
        if (!hasSelection) return
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const delta = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step]
        }[event.key]
        if (delta) board.nudgeSelection(delta[0], delta[1])
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
