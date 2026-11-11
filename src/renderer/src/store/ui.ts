import { create } from 'zustand'
import type { Point } from '@shared/types'
import type { ToolId } from '@shared/types'

export type ModalId = 'settings' | 'projects' | 'search' | 'help' | 'export' | 'filters' | 'snapshots' | 'create' | null

export type ContextTarget =
  | { type: 'canvas'; world: Point; screen: Point }
  | { type: 'card'; id: string; world: Point; screen: Point }
  | { type: 'thread'; id: string; world: Point; screen: Point }
  | { type: 'stroke'; id: string; world: Point; screen: Point }
  | { type: 'group'; id: string; world: Point; screen: Point }
  | { type: 'spaceTab'; id: string; screen: Point }
  | { type: 'project'; id: string; screen: Point }

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'success' | 'error'
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  action: () => void | Promise<void>
}

export interface Lightbox {
  src: string
  title: string
  caption?: string
}

interface UiState {
  modal: ModalId
  modalPayload: string | null
  contextMenu: ContextTarget | null
  toasts: Toast[]
  confirmDialog: ConfirmOptions | null
  lightbox: Lightbox | null
  exportState: { busy: boolean; message: string; progress: number }
  quickConnectTool: boolean
  panelCollapsed: boolean
  activeDrawingTool: Exclude<ToolId, 'select' | 'hand' | 'note' | 'text'>
  renameSpaceId: string | null
  boardInteracting: boolean
  homeOpen: boolean
  openModal: (modal: ModalId, payload?: string) => void
  closeModal: () => void
  openContextMenu: (target: ContextTarget) => void
  closeContextMenu: () => void
  toast: (message: string, kind?: Toast['kind'], ttl?: number) => void
  dismissToast: (id: string) => void
  ask: (options: ConfirmOptions) => void
  resolveConfirm: (confirmed: boolean) => Promise<void>
  openLightbox: (lightbox: Lightbox) => void
  closeLightbox: () => void
  setExportState: (state: Partial<UiState['exportState']>) => void
  setQuickConnectTool: (value: boolean) => void
  setPanelCollapsed: (value: boolean) => void
  setActiveDrawingTool: (tool: UiState['activeDrawingTool']) => void
  setRenameSpaceId: (id: string | null) => void
  setBoardInteracting: (value: boolean) => void
  openHome: () => void
  closeHome: () => void
}

export const useUi = create<UiState>((set, get) => ({
  modal: null,
  modalPayload: null,
  contextMenu: null,
  toasts: [],
  confirmDialog: null,
  lightbox: null,
  exportState: { busy: false, message: '', progress: 0 },
  quickConnectTool: false,
  panelCollapsed: false,
  activeDrawingTool: 'chalk',
  renameSpaceId: null,
  boardInteracting: false,
  homeOpen: false,

  openModal: (modal: ModalId, payload: string | null = null) => set({ modal, modalPayload: payload, contextMenu: null }),
  closeModal: () => set({ modal: null, modalPayload: null }),
  openContextMenu: (target) => set({ contextMenu: target }),
  closeContextMenu: () => set({ contextMenu: null }),

  toast: (message, kind = 'info', ttl = 3200) => {
    const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, kind }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, ttl)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  ask: (options) => set({ confirmDialog: options, contextMenu: null }),

  resolveConfirm: async (confirmed) => {
    const dialog = get().confirmDialog
    set({ confirmDialog: null })
    if (confirmed && dialog) {
      try {
        await dialog.action()
      } catch (error) {
        get().toast((error as Error).message, 'error')
      }
    }
  },

  openLightbox: (lightbox) => set({ lightbox }),
  closeLightbox: () => set({ lightbox: null }),

  setExportState: (state) =>
    set((current) => ({ exportState: { ...current.exportState, ...state } })),

  setQuickConnectTool: (value) => set({ quickConnectTool: value }),
  setPanelCollapsed: (value) => set({ panelCollapsed: value }),
  setActiveDrawingTool: (tool) => set({ activeDrawingTool: tool }),
  setRenameSpaceId: (id) => set({ renameSpaceId: id }),
  setBoardInteracting: (value) => set({ boardInteracting: value }),
  openHome: () => set({ homeOpen: true }),
  closeHome: () => set({ homeOpen: false })
}))
