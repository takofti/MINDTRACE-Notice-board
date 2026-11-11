import type { MindtraceAPI, AppInfo, ExportResult, ImportProjectResult, ImportedAsset, SaveResult, SnapshotResult } from '@shared/ipc'

export type { ImportedAsset } from '@shared/ipc'
import { mergeSettings, type SettingsFile } from '@shared/settings'
import {
  PROJECT_FORMAT_VERSION,
  type Project,
  type ProjectFile,
  type ProjectSummary,
  type StorageSnapshot,
  type TemplateSummary
} from '@shared/types'
import { downloadBlob, downloadDataUrl } from '@/core/geometry'
import { uid } from '@/core/id'

const electron: MindtraceAPI | undefined = typeof window !== 'undefined' ? window.mindtrace : undefined
export const isElectron = Boolean(electron)

/* --------------------------- browser persistence ------------------------ */

const LS_PROJECTS = 'mindtrace.projects.v1'
const LS_SETTINGS = 'mindtrace.settings.v1'
const DB_NAME = 'mindtrace-assets'
const DB_STORE = 'assets'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    })
  }
  return dbPromise
}

async function idbPut(key: string, value: Blob): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(key: string): Promise<Blob | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(key)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => resolve(null)
  })
}

async function idbKeys(): Promise<string[]> {
  const db = await openDb()
  if (!db) return []
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).getAllKeys()
    req.onsuccess = () => resolve((req.result as string[]) ?? [])
    req.onerror = () => resolve([])
  })
}

async function idbDeletePrefix(prefix: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  const keys = await idbKeys()
  const matches = keys.filter((key) => key.startsWith(prefix))
  if (!matches.length) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    for (const key of matches) tx.objectStore(DB_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

function readWebProjects(): Project[] {
  try {
    const raw = localStorage.getItem(LS_PROJECTS)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as Project[]) : []
  } catch {
    return []
  }
}

function writeWebProjects(projects: Project[]): void {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(projects))
}

function webSummary(project: Project): ProjectSummary {
  const cardCount = project.spaces.reduce((n, s) => n + Object.keys(s.cards).length, 0)
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    cardCount,
    spaceCount: project.spaces.length,
    path: 'Browser preview storage'
  }
}

function readWebSettings(): SettingsFile {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    if (!raw) return { settings: mergeSettings(undefined), profiles: [] }
    const parsed = JSON.parse(raw) as SettingsFile
    return { settings: mergeSettings(parsed.settings), profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [] }
  } catch {
    return { settings: mergeSettings(undefined), profiles: [] }
  }
}

function writeWebSettings(file: SettingsFile): void {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(file))
}

const webAssetCache = new Map<string, string>()

function webAssetKey(ref: string): { projectId: string; fileName: string } | null {
  try {
    const url = new URL(ref)
    if (url.protocol !== 'webasset:') return null
    return { projectId: url.hostname, fileName: decodeURIComponent(url.pathname.replace(/^\/+/, '')) }
  } catch {
    return null
  }
}

async function resolveWebAsset(ref: string): Promise<string> {
  if (webAssetCache.has(ref)) return webAssetCache.get(ref) as string
  const parsed = webAssetKey(ref)
  if (!parsed) return ref
  const blob = await idbGet(`${parsed.projectId}/${parsed.fileName}`)
  if (!blob) return ref
  const url = URL.createObjectURL(blob)
  webAssetCache.set(ref, url)
  return url
}

function pickWebFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.accept =
      'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.svg,.mndtr'
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const finish = (files: File[]): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => finish([]))
    input.click()
  })
}

async function webImportFiles(projectId: string, files: File[]): Promise<ImportedAsset[]> {
  const out: ImportedAsset[] = []
  for (const file of files) {
    const fileName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(
      /[^\w.\-() ]+/g,
      '_'
    )}`
    await idbPut(`${projectId}/${fileName}`, file)
    out.push({
      name: file.name,
      url: `webasset://${projectId}/${encodeURIComponent(fileName)}`,
      mime: file.type || mimeFromName(file.name),
      size: file.size
    })
  }
  return out
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown'
  }
  return map[ext] ?? 'application/octet-stream'
}

/* ------------------------------- projects ------------------------------- */

async function webListProjects(): Promise<ProjectSummary[]> {
  return readWebProjects()
    .map(webSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

async function webSaveProject(project: Project): Promise<SaveResult> {
  const projects = readWebProjects()
  const index = projects.findIndex((p) => p.id === project.id)
  const stamped = { ...project, updatedAt: Date.now() }
  if (index >= 0) projects[index] = stamped
  else projects.push(stamped)
  writeWebProjects(projects)
  void electron
  return { ok: true, savedAt: stamped.updatedAt }
}

async function webImportProject(): Promise<ImportProjectResult> {
  const [file] = await pickWebFiles(false)
  if (!file) return { ok: false, canceled: true }
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const projectEntry = zip.file('project.json')
    if (!projectEntry) return { ok: false, error: 'Archive does not contain project.json' }
    const project = JSON.parse(await projectEntry.async('string')) as Project
    if (!Array.isArray(project.spaces)) return { ok: false, error: 'Unsupported project format' }
    const oldId = project.id
    const newId = uid('prj')
    project.id = newId
    project.format = PROJECT_FORMAT_VERSION
    project.createdAt = project.createdAt || Date.now()
    project.updatedAt = Date.now()
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith('assets/')) continue
      const fileName = name.slice('assets/'.length)
      if (!fileName || fileName.includes('/') || fileName.includes('..')) continue
      const blob = await entry.async('blob')
      await idbPut(`${newId}/${fileName}`, blob)
    }
    project.spaces = JSON.parse(
      JSON.stringify(project.spaces)
        .replaceAll(`mtasset://${oldId}/`, `webasset://${newId}/`)
        .replaceAll(`webasset://${oldId}/`, `webasset://${newId}/`)
    )
    await webSaveProject(project)
    return { ok: true, project, summary: webSummary(project) }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

async function webExportProject(id: string): Promise<ExportResult> {
  const project = readWebProjects().find((p) => p.id === id)
  if (!project) return { ok: false, error: 'Project not found' }
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const portable = JSON.parse(JSON.stringify(project)) as Project
  portable.spaces = JSON.parse(JSON.stringify(portable.spaces).replaceAll(`webasset://${id}/`, `mtasset://${id}/`))
  zip.file('project.json', JSON.stringify(portable, null, 1))
  const keys = await idbKeys()
  for (const key of keys) {
    if (!key.startsWith(`${id}/`)) continue
    const blob = await idbGet(key)
    if (blob) zip.file(`assets/${key.slice(id.length + 1)}`, blob)
  }
  const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  downloadBlob(out, `${project.name.replace(/[^\w\- ]+/g, '') || 'mindtrace'}.mndtr`)
  return { ok: true }
}

function webSnapshots(id: string): StorageSnapshot[] {
  try {
    const raw = localStorage.getItem(`mindtrace.snapshots.${id}`)
    if (!raw) return []
    const list = JSON.parse(raw) as { file: string; createdAt: number; size: number }[]
    return list.map(({ file, createdAt, size }) => ({ file, createdAt, size })).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

async function webSnapshot(id: string, label?: string): Promise<SnapshotResult> {
  const project = readWebProjects().find((p) => p.id === id)
  if (!project) return { ok: false, error: 'Project not found' }
  const json = JSON.stringify(project)
  const file = `${label ? `${label}-` : ''}${Date.now()}.json`
  try {
    const raw = localStorage.getItem(`mindtrace.snapshots.${id}`)
    const list = raw ? (JSON.parse(raw) as { file: string; createdAt: number; size: number; json: string }[]) : []
    list.push({ file, createdAt: Date.now(), size: json.length, json })
    while (list.length > 8) list.shift()
    localStorage.setItem(`mindtrace.snapshots.${id}`, JSON.stringify(list))
    return { ok: true, snapshot: { file, createdAt: Date.now(), size: json.length } }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

/* -------------------------------- exports ------------------------------- */

export const appInfo: AppInfo = {
  version: '1.1.0',
  electron: 'browser preview',
  platform: 'web',
  dataDir: 'IndexedDB / localStorage',
  lastProjectId: null,
  uncleanShutdown: false,
  lastOpenedAt: null,
  isPackaged: false
}

export async function getAppInfo(): Promise<AppInfo> {
  if (electron) return electron.info()
  const settings = readWebSettings()
  return { ...appInfo, lastProjectId: settings.settings.data.lastProjectId }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return electron ? electron.projects.list() : webListProjects()
}

export async function createProjectOnDisk(name: string, description = ''): Promise<Project> {
  if (electron) return electron.projects.create(name, description)
  const project: Project = {
    format: PROJECT_FORMAT_VERSION,
    id: uid('prj'),
    name,
    description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activeSpaceId: '',
    spaces: [],
    categories: []
  }
  const { newSpace } = await import('@/core/defaults')
  const space = newSpace('Board 01')
  project.spaces = [space]
  project.activeSpaceId = space.id
  await webSaveProject(project)
  return project
}

export async function loadProjectFile(id: string): Promise<ProjectFile> {
  if (electron) return electron.projects.load(id)
  const project = readWebProjects().find((p) => p.id === id) ?? null
  return { project, snapshots: webSnapshots(id) }
}

export async function saveProjectFile(
  project: Project,
  opts?: { backups?: number }
): Promise<SaveResult> {
  return electron ? electron.projects.save(project, opts) : webSaveProject(project)
}

export async function renameProjectOnDisk(id: string, name: string): Promise<void> {
  if (electron) return electron.projects.rename(id, name)
  const projects = readWebProjects()
  const project = projects.find((p) => p.id === id)
  if (project) {
    project.name = name
    project.updatedAt = Date.now()
    writeWebProjects(projects)
  }
}

export async function duplicateProjectOnDisk(id: string): Promise<Project> {
  if (electron) return electron.projects.duplicate(id)
  const project = readWebProjects().find((p) => p.id === id)
  if (!project) throw new Error('Project not found')
  const clone = structuredClone(project)
  const newId = uid('prj')
  const body = JSON.stringify(clone)
    .replaceAll(`webasset://${id}/`, `webasset://${newId}/`)
    .replaceAll(`mtasset://${id}/`, `webasset://${newId}/`)
  const next = JSON.parse(body) as Project
  next.id = newId
  next.name = `${project.name} copy`
  next.createdAt = Date.now()
  next.updatedAt = Date.now()
  for (const key of await idbKeys()) {
    if (!key.startsWith(`${id}/`)) continue
    const blob = await idbGet(key)
    if (blob) await idbPut(`${newId}/${key.slice(id.length + 1)}`, blob)
  }
  await webSaveProject(next)
  return next
}

export async function deleteProjectOnDisk(id: string): Promise<void> {
  if (electron) return electron.projects.remove(id)
  writeWebProjects(readWebProjects().filter((p) => p.id !== id))
  localStorage.removeItem(`mindtrace.snapshots.${id}`)
  await idbDeletePrefix(`${id}/`)
}

export async function importProjectFromDisk(): Promise<ImportProjectResult> {
  return electron ? electron.projects.import() : webImportProject()
}

export async function exportProjectToDisk(id: string): Promise<ExportResult> {
  return electron ? electron.projects.export(id) : webExportProject(id)
}

export async function revealProject(id: string): Promise<void> {
  if (electron) await electron.projects.reveal(id)
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  if (electron) return electron.templates.list()
  return []
}

export async function saveProjectAsTemplate(
  projectId: string,
  name: string,
  description: string
): Promise<TemplateSummary> {
  if (!electron) throw new Error('Templates are available in the desktop app.')
  return electron.templates.save(projectId, name, description)
}

export async function instantiateTemplate(templateId: string, name: string): Promise<Project> {
  if (!electron) throw new Error('Templates are available in the desktop app.')
  return electron.templates.instantiate(templateId, name)
}

export async function removeTemplate(templateId: string): Promise<void> {
  if (electron) await electron.templates.remove(templateId)
}

export async function listSnapshots(id: string): Promise<StorageSnapshot[]> {
  return electron ? electron.projects.snapshots(id) : webSnapshots(id)
}

export async function createSnapshot(id: string, label?: string): Promise<SnapshotResult> {
  return electron ? electron.projects.snapshot(id, label) : webSnapshot(id, label)
}

export async function restoreSnapshot(id: string, file: string): Promise<ProjectFile> {
  if (electron) return electron.projects.restore(id, file)
  const raw = localStorage.getItem(`mindtrace.snapshots.${id}`)
  if (!raw) throw new Error('Snapshot not found')
  const list = JSON.parse(raw) as { file: string; json: string }[]
  const entry = list.find((item) => item.file === file)
  if (!entry) throw new Error('Snapshot not found')
  const project = JSON.parse(entry.json) as Project
  project.id = id
  project.updatedAt = Date.now()
  await webSaveProject(project)
  return { project, snapshots: webSnapshots(id) }
}

/* --------------------------------- assets ------------------------------- */

export async function pickAssets(projectId: string): Promise<ImportedAsset[]> {
  if (electron) return electron.assets.pick(projectId)
  const files = await pickWebFiles(true)
  return webImportFiles(projectId, files)
}

export async function importDroppedFiles(projectId: string, files: File[]): Promise<ImportedAsset[]> {
  if (electron) {
    const paths = files.map((file) => electron.assets.pathForFile(file)).filter(Boolean)
    if (paths.length === files.length && paths.length) {
      return electron.assets.importPaths(projectId, paths)
    }
    const out: ImportedAsset[] = []
    for (const file of files) {
      out.push(await electron.assets.importBytes(projectId, file.name, await file.arrayBuffer()))
    }
    return out
  }
  return webImportFiles(projectId, files)
}

export async function importAssetBytes(
  projectId: string,
  name: string,
  bytes: ArrayBuffer,
  mime = ''
): Promise<ImportedAsset> {
  if (electron) return electron.assets.importBytes(projectId, name, bytes)
  const fileName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${name.replace(
    /[^\w.\-() ]+/g,
    '_'
  )}`
  await idbPut(`${projectId}/${fileName}`, new Blob([bytes], { type: mime || mimeFromName(name) }))
  return {
    name,
    url: `webasset://${projectId}/${encodeURIComponent(fileName)}`,
    mime: mime || mimeFromName(name),
    size: bytes.byteLength
  }
}

export async function resolveAssetUrl(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined
  if (ref.startsWith('webasset://')) return resolveWebAsset(ref)
  return ref
}

export async function openAsset(ref: string): Promise<void> {
  if (electron) return electron.assets.open(ref)
  const resolved = await resolveAssetUrl(ref)
  if (resolved) window.open(resolved, '_blank', 'noopener')
}

export async function revealAsset(ref: string): Promise<void> {
  if (electron) return electron.assets.reveal(ref)
}

export async function readAssetText(ref: string): Promise<string> {
  const url = await resolveAssetUrl(ref)
  if (!url) throw new Error('Missing asset')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not read asset (${response.status})`)
  return response.text()
}

export async function readAssetBytes(ref: string): Promise<ArrayBuffer> {
  const url = await resolveAssetUrl(ref)
  if (!url) throw new Error('Missing asset')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not read asset (${response.status})`)
  return response.arrayBuffer()
}

export async function saveAssetBytes(ref: string, bytes: ArrayBuffer): Promise<void> {
  const parsed = webAssetKey(ref)
  if (parsed) await idbPut(`${parsed.projectId}/${parsed.fileName}`, new Blob([bytes]))
}

/* -------------------------------- settings ------------------------------ */

export async function loadSettingsFile(): Promise<SettingsFile> {
  return electron ? electron.settings.load() : readWebSettings()
}

export async function saveSettingsFile(file: SettingsFile): Promise<SaveResult> {
  if (electron) return electron.settings.save(file)
  writeWebSettings(file)
  return { ok: true, savedAt: Date.now() }
}

export async function exportSettingsFile(file: SettingsFile): Promise<ExportResult> {
  if (electron) return electron.settings.export(file)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  downloadBlob(blob, 'mindtrace-settings.json')
  return { ok: true }
}

export async function importSettingsFile(): Promise<{
  ok: boolean
  file?: SettingsFile
  canceled?: boolean
  error?: string
}> {
  if (electron) return electron.settings.import()
  const files = await pickWebFiles(false)
  if (!files.length) return { ok: false, canceled: true }
  try {
    const raw = JSON.parse(await files[0].text()) as SettingsFile
    return {
      ok: true,
      file: {
        settings: mergeSettings(raw.settings ?? raw),
        profiles: Array.isArray(raw.profiles) ? raw.profiles : []
      }
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function openDataFolder(): Promise<void> {
  if (electron) return electron.storage.openFolder()
  console.info('Browser preview stores projects in localStorage and assets in IndexedDB.')
}

export async function chooseDataFolder(): Promise<{ ok: boolean; path?: string; requiresRestart?: boolean; error?: string }> {
  if (electron) return electron.storage.chooseFolder()
  return { ok: false, error: 'Custom data folders are available in the desktop app.' }
}

/* --------------------------------- export ------------------------------- */

export async function savePng(dataUrl: string, suggestedName: string): Promise<ExportResult> {
  if (electron) return electron.export.savePng(dataUrl, suggestedName)
  downloadDataUrl(dataUrl, suggestedName)
  return { ok: true }
}

export async function saveImage(
  dataUrl: string,
  suggestedName: string,
  format: string
): Promise<ExportResult> {
  if (electron) return electron.export.saveImage(dataUrl, suggestedName, format)
  downloadDataUrl(dataUrl, suggestedName)
  return { ok: true }
}

export async function savePdf(bytes: ArrayBuffer, suggestedName: string): Promise<ExportResult> {
  if (electron) return electron.export.savePdf(bytes, suggestedName)
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), suggestedName)
  return { ok: true }
}

/* ---------------------------------- misc -------------------------------- */

export async function openExternal(url: string): Promise<void> {
  if (!/^(https?:|mailto:)/i.test(url)) throw new Error('Only web links can be opened')
  if (electron) return electron.shell.openExternal(url)
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function openPath(path: string): Promise<void> {
  if (electron) return electron.shell.openPath(path)
}

export function startSession(projectId: string): void {
  electron?.session.start(projectId)
}

export function endSession(): void {
  electron?.session.end()
}

export function onBeforeClose(callback: () => void): () => void {
  return electron ? electron.onBeforeClose(callback) : () => undefined
}

export function closeReady(): void {
  electron?.closeReady()
}

export const windowControls = {
  minimize: (): void => electron?.window.minimize(),
  toggleMaximize: (): void => electron?.window.toggleMaximize(),
  close: (): void => electron?.window.close(),
  isMaximized: async (): Promise<boolean> => (electron ? electron.window.isMaximized() : false),
  onMaximized: (cb: (value: boolean) => void): (() => void) =>
    electron ? electron.window.onMaximized(cb) : () => undefined
}
