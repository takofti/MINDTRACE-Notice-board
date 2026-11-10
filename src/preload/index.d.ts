import type { MindtraceAPI } from '@shared/ipc'

declare global {
  interface Window {
    mindtrace?: MindtraceAPI
  }
}

export {}
