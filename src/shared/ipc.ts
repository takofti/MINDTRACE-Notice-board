import type {
  Project,
  ProjectFile,
  ProjectSummary,
  StorageSnapshot,
  TemplateSummary
} from '@shared/types'
import type { SettingsFile } from '@shared/settings'

export interface ImportedAsset {
  name: string
  url: string
  mime: string
  size: number
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  dataDir: string
  lastProjectId: string | null
  uncleanShutdown: boolean
  lastOpenedAt: number | null
  isPackaged: boolean
}

export interface SaveResult {
  ok: boolean
  savedAt?: number
  error?: string
}

export interface SnapshotResult {
  ok: boolean
  snapshot?: StorageSnapshot
  error?: string
}

export interface ExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
}

export interface ImportProjectResult {
  ok: boolean
  project?: Project
  summary?: ProjectSummary
  canceled?: boolean
  error?: string
}

export interface MindtraceAPI {
  isElectron: true
  info(): Promise<AppInfo>
  projects: {
    list(): Promise<ProjectSummary[]>
    create(name: string, description?: string): Promise<Project>
    load(id: string): Promise<ProjectFile>
    save(project: Project, opts?: { backups?: number; snapshotLabel?: string }): Promise<SaveResult>
    rename(id: string, name: string): Promise<void>
    duplicate(id: string): Promise<Project>
    remove(id: string): Promise<void>
    import(): Promise<ImportProjectResult>
    export(id: string): Promise<ExportResult>
    snapshots(id: string): Promise<StorageSnapshot[]>
    snapshot(id: string, label?: string): Promise<SnapshotResult>
    restore(id: string, file: string): Promise<ProjectFile>
    reveal(id: string): Promise<void>
  }
  assets: {
    pick(projectId: string): Promise<ImportedAsset[]>
    importBytes(projectId: string, name: string, bytes: ArrayBuffer): Promise<ImportedAsset>
    importPaths(projectId: string, paths: string[]): Promise<ImportedAsset[]>
    pathForFile(file: File): string
    open(ref: string): Promise<void>
    reveal(ref: string): Promise<void>
  }
  templates: {
    list(): Promise<TemplateSummary[]>
    save(projectId: string, name: string, description: string): Promise<TemplateSummary>
    instantiate(templateId: string, name: string): Promise<Project>
    remove(templateId: string): Promise<void>
  }
  settings: {
    load(): Promise<SettingsFile>
    save(file: SettingsFile): Promise<SaveResult>
    export(file: SettingsFile): Promise<ExportResult>
    import(): Promise<{ ok: boolean; file?: SettingsFile; canceled?: boolean; error?: string }>
    openFolder(): Promise<void>
  }
  storage: {
    chooseFolder(): Promise<{ ok: boolean; path?: string; requiresRestart?: boolean; error?: string }>
    openFolder(): Promise<void>
  }
  export: {
    savePng(dataUrl: string, suggestedName: string): Promise<ExportResult>
    savePdf(bytes: ArrayBuffer, suggestedName: string): Promise<ExportResult>
    saveImage(dataUrl: string, suggestedName: string, format: string): Promise<ExportResult>
  }
  shell: {
    openPath(path: string): Promise<void>
    openExternal(url: string): Promise<void>
    showItem(path: string): Promise<void>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximized(cb: (value: boolean) => void): () => void
  }
  session: {
    start(projectId: string): void
    end(): void
  }
  onBeforeClose(cb: () => void): () => void
  closeReady(): void
}

declare global {
  interface Window {
    mindtrace?: MindtraceAPI
  }
}
