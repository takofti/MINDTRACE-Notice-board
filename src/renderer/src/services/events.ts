import type { CardKind, Point } from '@shared/types'

export const BOARD_EVENTS = {
  fit: 'mindtrace:fit',
  resetZoom: 'mindtrace:reset-zoom',
  center: 'mindtrace:center',
  escape: 'mindtrace:escape',
  create: 'mindtrace:create',
  attach: 'mindtrace:attach',
  paste: 'mindtrace:paste',
  selectChain: 'mindtrace:select-chain'
} as const

export type BoardEventName = (typeof BOARD_EVENTS)[keyof typeof BOARD_EVENTS]

export function emitBoardEvent(name: BoardEventName, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function onBoardEvent<T = unknown>(
  name: BoardEventName,
  handler: (detail: T) => void
): () => void {
  const listener = (event: Event): void => handler((event as CustomEvent<T>).detail)
  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}

export interface CreateEventDetail {
  kind: CardKind
  at?: Point
}
