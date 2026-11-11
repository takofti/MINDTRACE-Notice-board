import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron'
import { promises as fs, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, normalize, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import JSZip from 'jszip'
import type {
  AppInfo,
  ExportResult,
  ImportProjectResult,
  ImportedAsset,
  SaveResult,
  SnapshotResult
} from '@shared/ipc'
import {
  PROJECT_FORMAT_VERSION,
  type Project,
  type ProjectFile,
  type ProjectSummary,
  type StorageSnapshot,
  type TemplateSummary
} from '@shared/types'
import { mergeSettings, DEFAULT_SETTINGS, type SettingsFile } from '@shared/settings'

app.setName('Mindtrace')

// Isolated storage for automated smoke tests.
if (process.env.MINDTRACE_USER_DATA) {
  app.setPath('userData', process.env.MINDTRACE_USER_DATA)
}

/* --------------------------------- paths -------------------------------- */

let dataRoot = process.env.PORTABLE_EXECUTABLE_DIR
  ? join(process.env.PORTABLE_EXECUTABLE_DIR, 'Mindtrace Data')
  : join(app.getPath('userData'), 'data')
const configPath = () => join(app.getPath('userData'), 'storage-config.json')

function projectsRoot(): string {
  return join(dataRoot, 'projects')
}

function templatesRoot(): string {
  return join(dataRoot, 'templates')
}

function projectDir(id: string): string {
  assertId(id)
  return join(projectsRoot(), id)
}

function projectFile(id: string): string {
  return join(projectDir(id), 'project.json')
}

function assetsDir(id: string): string {
  return join(projectDir(id), 'assets')
}

function backupsDir(id: string): string {
  return join(projectDir(id), 'backups')
}

function assertId(id: string): void {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new Error('Invalid project id')
}

function assertTemplateId(id: string): void {
  if (!/^tpl_[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new Error('Invalid template id')
}

function safeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+$/, '')
    .slice(0, 120)
}

function projectLabel(name: string): string {
  return safeName(name).trim() || 'Untitled project'
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(join(path, '..'))
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  const body = JSON.stringify(value, null, 1)
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(body, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(tmp, path)
}

/* ---------------------------- write serialization ----------------------- */

const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(task, task)
  queues.set(
    key,
    next.catch(() => undefined)
  )
  return next
}

/* -------------------------------- projects ------------------------------ */

function emptySpace(name = 'Board'): Project['spaces'][number] {
  const now = Date.now()
  return {
    id: `sp_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
    name,
    description: '',
    camera: { x: 0, y: 0, zoom: 1 },
    cards: {},
    threads: {},
    strokes: {},
    groups: {},
    createdAt: now,
    updatedAt: now
  }
}

function newProject(name: string, description = ''): Project {
  const now = Date.now()
  const id = `prj_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  const space = emptySpace('Board 01')
  return {
    format: PROJECT_FORMAT_VERSION,
    id,
    name: projectLabel(name),
    description,
    createdAt: now,
    updatedAt: now,
    activeSpaceId: space.id,
    spaces: [space],
    categories: []
  }
}

async function saveProjectInner(
  project: Project,
  opts: { backups?: number; forceBackup?: boolean } = {}
): Promise<SaveResult> {
  assertId(project.id)
  const dir = projectDir(project.id)
  await ensureDir(dir)
  await ensureDir(assetsDir(project.id))
  const target = projectFile(project.id)

  if (existsSync(target)) {
    const existing = readJson<Project>(target)
    const changed =
      !existing ||
      JSON.stringify(existing.spaces) !== JSON.stringify(project.spaces) ||
      existing.name !== project.name
    const lastBackup = await latestBackupTime(project.id)
    const shouldBackup = opts.forceBackup || (changed && Date.now() - lastBackup > 60_000)
    if (shouldBackup) {
      await createBackup(project.id, existing ?? project, opts.backups ?? 15)
    }
  }

  const stamped: Project = { ...project, updatedAt: Date.now() }
  await writeJsonAtomic(target, stamped)
  return { ok: true, savedAt: stamped.updatedAt }
}

async function latestBackupTime(id: string): Promise<number> {
  const dir = backupsDir(id)
  try {
    const files = await fs.readdir(dir)
    if (!files.length) return 0
    files.sort()
    const stats = await fs.stat(join(dir, files[files.length - 1]))
    return stats.mtimeMs
  } catch {
    return 0
  }
}

async function createBackup(id: string, project: Project, keep = 15): Promise<StorageSnapshot> {
  const dir = backupsDir(id)
  await ensureDir(dir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${stamp}.json`)
  await writeJsonAtomic(file, project)
  const stat = await fs.stat(file)
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort()
  while (files.length > Math.max(1, keep)) {
    const victim = files.shift()
    if (victim) await fs.unlink(join(dir, victim)).catch(() => undefined)
  }
  return { file: basename(file), createdAt: stat.mtimeMs, size: stat.size }
}

async function listSnapshots(id: string): Promise<StorageSnapshot[]> {
  try {
    const dir = backupsDir(id)
    const files = await fs.readdir(dir)
    const out: StorageSnapshot[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const stat = await fs.stat(join(dir, file))
      out.push({ file, createdAt: stat.mtimeMs, size: stat.size })
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

async function projectSummary(project: Project, path?: string): Promise<ProjectSummary> {
  let cards = 0
  for (const space of project.spaces) cards += Object.keys(space.cards).length
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    cardCount: cards,
    spaceCount: project.spaces.length,
    path
  }
}

async function loadProject(id: string): Promise<ProjectFile> {
  const snapshots = await listSnapshots(id)
  const project = readJson<Project>(projectFile(id))
  return { project, snapshots }
}

async function duplicateProject(id: string): Promise<Project> {
  const source = readJson<Project>(projectFile(id))
  if (!source) throw new Error('Project not found')
  const clone = structuredClone(source)
  const newId = `prj_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  clone.id = newId
  clone.name = `${source.name} copy`
  clone.createdAt = Date.now()
  clone.updatedAt = Date.now()
  const json = JSON.stringify(clone).replaceAll(`mtasset://${id}/`, `mtasset://${newId}/`)
  clone.spaces = JSON.parse(json).spaces

  await ensureDir(projectDir(newId))
  await ensureDir(assetsDir(newId))
  await fs.cp(assetsDir(id), assetsDir(newId), { recursive: true, force: true }).catch(() => undefined)
  await writeJsonAtomic(projectFile(newId), clone)
  return clone
}

async function removeProject(id: string): Promise<void> {
  await fs.rm(projectDir(id), { recursive: true, force: true })
}

/* ------------------------------- templates ------------------------------ */

function templateDir(id: string): string {
  assertTemplateId(id)
  return join(templatesRoot(), id)
}

async function listTemplates(): Promise<TemplateSummary[]> {
  await ensureDir(templatesRoot())
  const dirs = await fs.readdir(templatesRoot(), { withFileTypes: true })
  const out: TemplateSummary[] = []
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const meta = readJson<TemplateSummary & { sourceProjectId?: string }>(join(templatesRoot(), dir.name, 'template.json'))
    if (meta) out.push({ ...meta, custom: true })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

async function saveTemplateFromProject(
  projectId: string,
  name: string,
  description: string
): Promise<TemplateSummary> {
  assertId(projectId)
  const project = readJson<Project>(projectFile(projectId))
  if (!project) throw new Error('Project not found')
  const id = `tpl_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  const dir = templateDir(id)
  await ensureDir(dir)
  await ensureDir(join(dir, 'assets'))
  await fs.copyFile(projectFile(projectId), join(dir, 'project.json'))
  await fs.cp(assetsDir(projectId), join(dir, 'assets'), { recursive: true, force: true }).catch(() => undefined)
  let cards = 0
  for (const space of project.spaces) cards += Object.keys(space.cards).length
  const summary: TemplateSummary = {
    id,
    name: safeName(name).slice(0, 120) || project.name,
    description: description.slice(0, 400),
    createdAt: Date.now(),
    cardCount: cards,
    spaceCount: project.spaces.length,
    custom: true
  }
  await writeJsonAtomic(join(dir, 'template.json'), summary)
  return summary
}

async function instantiateTemplate(templateId: string, name: string): Promise<Project> {
  assertTemplateId(templateId)
  const dir = templateDir(templateId)
  const source = readJson<Project>(join(dir, 'project.json'))
  if (!source) throw new Error('Template project could not be read')
  const newId = `prj_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  await ensureDir(projectDir(newId))
  await ensureDir(assetsDir(newId))
  await fs.cp(join(dir, 'assets'), assetsDir(newId), { recursive: true, force: true }).catch(() => undefined)
  const oldId = source.id
  const project: Project = structuredClone(source)
  project.id = newId
  project.name = projectLabel(name || source.name)
  project.createdAt = Date.now()
  project.updatedAt = Date.now()
  project.format = PROJECT_FORMAT_VERSION
  if (oldId && oldId !== newId) {
    project.spaces = JSON.parse(
      JSON.stringify(project.spaces).replaceAll(`mtasset://${oldId}/`, `mtasset://${newId}/`)
    )
  }
  await writeJsonAtomic(projectFile(newId), project)
  return project
}

async function removeTemplate(templateId: string): Promise<void> {
  assertTemplateId(templateId)
  await fs.rm(templateDir(templateId), { recursive: true, force: true })
}

function formatFromExt(file: string): string {
  const ext = extname(file).toLowerCase()
  if (ext === '.mndtr' || ext === '.zip' || ext === '.mindtrace') return 'project'
  return 'file'
}

async function exportProject(id: string): Promise<ExportResult> {
  const project = readJson<Project>(projectFile(id))
  if (!project) return { ok: false, error: 'Project not found' }
  const result = await dialog.showSaveDialog({
    title: await dialogText('Экспорт проекта Mindtrace', 'Export Mindtrace project'),
    defaultPath: `${projectLabel(project.name)}.mndtr`,
    filters: [{ name: await dialogText('Проект Mindtrace', 'Mindtrace project'), extensions: ['mndtr'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }

  const zip = new JSZip()
  zip.file('project.json', JSON.stringify(project, null, 1))
  zip.file(
    'manifest.json',
    JSON.stringify({ app: 'Mindtrace', format: PROJECT_FORMAT_VERSION, exportedAt: Date.now() }, null, 1)
  )
  try {
    const files = await fs.readdir(assetsDir(id))
    for (const file of files) {
      const body = await fs.readFile(join(assetsDir(id), file))
      zip.file(`assets/${file}`, body)
    }
  } catch {
    /* project without assets is valid */
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  await fs.writeFile(result.filePath, buffer)
  return { ok: true, path: result.filePath }
}

async function importProject(): Promise<ImportProjectResult> {
  const picked = await dialog.showOpenDialog({
    title: await dialogText('Импорт проекта Mindtrace', 'Import Mindtrace project'),
    properties: ['openFile'],
    filters: [
      { name: await dialogText('Проект Mindtrace', 'Mindtrace project'), extensions: ['mndtr', 'mindtrace'] },
      { name: await dialogText('Все файлы', 'All files'), extensions: ['*'] }
    ]
  })
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true }
  const sourcePath = picked.filePaths[0]
  if (formatFromExt(sourcePath) !== 'project') return { ok: false, error: 'Choose a .mndtr project file' }

  try {
    const zip = await JSZip.loadAsync(await fs.readFile(sourcePath))
    const projectEntry = zip.file('project.json')
    if (!projectEntry) return { ok: false, error: 'The archive does not contain project.json' }
    const parsed = JSON.parse(await projectEntry.async('string')) as Project
    if (!parsed || !Array.isArray(parsed.spaces)) return { ok: false, error: 'Unsupported project format' }

    const oldId = parsed.id
    const newId = `prj_${randomUUID().replace(/-/g, '').slice(0, 18)}`
    parsed.id = newId
    parsed.name = `${projectLabel(parsed.name)}`
    parsed.createdAt = parsed.createdAt || Date.now()
    parsed.updatedAt = Date.now()
    parsed.format = PROJECT_FORMAT_VERSION

    await ensureDir(assetsDir(newId))
    const maxEntries = 20_000
    let count = 0
    let totalBytes = 0
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      if (++count > maxEntries) return { ok: false, error: 'Archive contains too many files' }
      if (!name.startsWith('assets/')) continue
      const fileName = basename(name)
      if (!fileName || fileName.startsWith('.')) continue
      if (fileName.includes('..') || fileName.includes('\\') || fileName.includes('/')) continue
      const body = await entry.async('nodebuffer')
      if (body.byteLength > 1024 * 1024 * 1024) return { ok: false, error: 'An asset exceeds the 1 GB limit' }
      totalBytes += body.byteLength
      if (totalBytes > 2 * 1024 * 1024 * 1024) {
        return { ok: false, error: 'Archive exceeds the 2 GB total limit' }
      }
      await fs.writeFile(join(assetsDir(newId), fileName), body)
    }

    if (oldId && oldId !== newId) {
      const rewired = JSON.stringify(parsed).replaceAll(`mtasset://${oldId}/`, `mtasset://${newId}/`)
      parsed.spaces = JSON.parse(rewired).spaces
    }
    await writeJsonAtomic(projectFile(newId), parsed)
    return { ok: true, project: parsed, summary: await projectSummary(parsed, projectDir(newId)) }
  } catch (error) {
    return { ok: false, error: `Could not import project: ${(error as Error).message}` }
  }
}

async function importAssetFile(projectId: string, sourcePath: string): Promise<ImportedAsset> {
  assertId(projectId)
  const stat = await fs.stat(sourcePath)
  const ext = extname(sourcePath).toLowerCase()
  const base = safeName(basename(sourcePath, ext)).slice(0, 60) || 'asset'
  const fileName = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}-${base}${ext}`
  await ensureDir(assetsDir(projectId))
  await fs.copyFile(sourcePath, join(assetsDir(projectId), fileName))
  return {
    name: basename(sourcePath),
    url: `mtasset://${projectId}/${encodeURIComponent(fileName)}`,
    mime: mimeFromExt(ext),
    size: stat.size
  }
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.zip': 'application/zip'
  }
  return map[ext] ?? 'application/octet-stream'
}

async function importAssetBytes(
  projectId: string,
  name: string,
  bytes: ArrayBuffer
): Promise<ImportedAsset> {
  assertId(projectId)
  const ext = extname(name).toLowerCase()
  const base = safeName(basename(name, ext)).slice(0, 60) || 'asset'
  const fileName = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}-${base}${ext}`
  await ensureDir(assetsDir(projectId))
  const body = Buffer.from(bytes)
  const max = 1024 * 1024 * 1024
  if (body.byteLength > max) throw new Error('File exceeds the 1 GB limit')
  await fs.writeFile(join(assetsDir(projectId), fileName), body)
  return {
    name,
    url: `mtasset://${projectId}/${encodeURIComponent(fileName)}`,
    mime: mimeFromExt(ext),
    size: body.byteLength
  }
}

function assetPathFromRef(ref: string): string {
  const url = new URL(ref)
  if (url.protocol !== 'mtasset:') throw new Error('Invalid asset reference')
  const id = url.hostname
  const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  assertId(id)
  if (!fileName || fileName.includes('..') || fileName.includes('\\') || fileName.includes('/')) {
    throw new Error('Invalid asset path')
  }
  const file = resolve(assetsDir(id), fileName)
  if (!file.startsWith(resolve(assetsDir(id)))) throw new Error('Invalid asset path')
  if (!existsSync(file)) throw new Error('Asset not found')
  return file
}

/* -------------------------------- settings ------------------------------ */

async function loadSettings(): Promise<SettingsFile> {
  const raw = readJson<SettingsFile>(join(dataRoot, 'settings.json'))
  if (!raw) return { settings: structuredClone(DEFAULT_SETTINGS), profiles: [] }
  return {
    settings: mergeSettings(raw.settings),
    profiles: Array.isArray(raw.profiles) ? raw.profiles : []
  }
}

async function saveSettings(file: SettingsFile): Promise<SaveResult> {
  await ensureDir(dataRoot)
  await writeJsonAtomic(join(dataRoot, 'settings.json'), file)
  return { ok: true, savedAt: Date.now() }
}

/** Native dialogs follow the interface language stored in settings. */
async function dialogText(ru: string, en: string): Promise<string> {
  try {
    const file = await loadSettings()
    return file.settings.ui.language === 'ru' ? ru : en
  } catch {
    return en
  }
}

/* --------------------------------- export ------------------------------- */

async function saveDataUrl(dataUrl: string, suggestedName: string): Promise<ExportResult> {
  const picked = await dialog.showSaveDialog({
    title: await dialogText('Экспорт изображения доски', 'Export board image'),
    defaultPath: suggestedName,
    filters: [{ name: await dialogText('Изображение PNG', 'PNG image'), extensions: ['png'] }]
  })
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return { ok: false, error: 'Invalid image data' }
  const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64')
  await fs.writeFile(picked.filePath, buffer)
  return { ok: true, path: picked.filePath }
}

async function saveImage(dataUrl: string, suggestedName: string, format: string): Promise<ExportResult> {
  const normalized = format === 'jpg' || format === 'jpeg' ? 'jpeg' : format === 'webp' ? 'webp' : 'png'
  const extension = normalized === 'jpeg' ? 'jpg' : normalized
  const filters =
    normalized === 'jpeg'
      ? [{ name: await dialogText('Изображение JPEG', 'JPEG image'), extensions: ['jpg', 'jpeg'] }]
      : normalized === 'webp'
        ? [{ name: await dialogText('Изображение WebP', 'WebP image'), extensions: ['webp'] }]
        : [{ name: await dialogText('Изображение PNG', 'PNG image'), extensions: ['png'] }]
  const picked = await dialog.showSaveDialog({
    title: await dialogText('Экспорт изображения доски', 'Export board image'),
    defaultPath: suggestedName,
    filters
  })
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return { ok: false, error: 'Invalid image data' }
  const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64')
  await fs.writeFile(picked.filePath, buffer)
  return { ok: true, path: picked.filePath }
}

async function savePdf(bytes: ArrayBuffer, suggestedName: string): Promise<ExportResult> {
  const picked = await dialog.showSaveDialog({
    title: await dialogText('Экспорт доски в PDF', 'Export board PDF'),
    defaultPath: suggestedName,
    filters: [{ name: await dialogText('Документ PDF', 'PDF document'), extensions: ['pdf'] }]
  })
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
  await fs.writeFile(picked.filePath, Buffer.from(bytes))
  return { ok: true, path: picked.filePath }
}

/* ------------------------------- session -------------------------------- */

const sessionPath = () => join(dataRoot, 'session.json')
let lastSession: { projectId?: string; startedAt?: number; updatedAt?: number } | null = null

async function readSession(): Promise<void> {
  lastSession = readJson(sessionPath()) ?? null
}

function markSession(projectId: string): void {
  try {
    writeFileSync(sessionPath(), JSON.stringify({ projectId, startedAt: Date.now(), updatedAt: Date.now() }))
  } catch {
    /* session tracking is best-effort */
  }
}

function clearSession(): void {
  try {
    if (existsSync(sessionPath())) writeFileSync(sessionPath(), '')
  } catch {
    /* ignore */
  }
}

/* --------------------------------- window ------------------------------- */

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    frame: false,
    thickFrame: true,
    hasShadow: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    backgroundColor: '#101114',
    title: 'Mindtrace',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (current && url !== current) event.preventDefault()
  })

  const sendMax = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized', mainWindow.isMaximized())
    }
  }
  mainWindow.on('maximize', sendMax)
  mainWindow.on('unmaximize', sendMax)

  let closeArmed = false
  mainWindow.on('close', (event) => {
    if (closeArmed) return
    event.preventDefault()
    if (!mainWindow) return
    mainWindow.webContents.send('app:request-flush')
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      closeArmed = true
      clearSession()
      mainWindow.close()
    }, 2500)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* ---------------------------------- ipc --------------------------------- */

function registerIpc(): void {
  ipcMain.handle('app:info', async (): Promise<AppInfo> => {
    await ensureDir(dataRoot)
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      dataDir: dataRoot,
      lastProjectId: lastSession?.projectId ?? null,
      uncleanShutdown: Boolean(lastSession?.projectId) && existsSync(sessionPath()),
      lastOpenedAt: lastSession?.updatedAt ?? null,
      isPackaged: app.isPackaged
    }
  })

  ipcMain.handle('projects:list', async (): Promise<ProjectSummary[]> => {
    await ensureDir(projectsRoot())
    const dirs = await fs.readdir(projectsRoot(), { withFileTypes: true })
    const out: ProjectSummary[] = []
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const project = readJson<Project>(projectFile(dir.name))
      if (project) out.push(await projectSummary(project, projectDir(dir.name)))
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  })

  ipcMain.handle('projects:create', async (_e, name: string, description = ''): Promise<Project> => {
    const project = newProject(name, description)
    await ensureDir(projectDir(project.id))
    await ensureDir(assetsDir(project.id))
    await writeJsonAtomic(projectFile(project.id), project)
    return project
  })

  ipcMain.handle('projects:load', async (_e, id: string): Promise<ProjectFile> => {
    return enqueue(`load:${id}`, () => loadProject(id))
  })

  ipcMain.handle(
    'projects:save',
    async (_e, project: Project, opts?: { backups?: number; snapshotLabel?: string }): Promise<SaveResult> => {
      if (!project?.id) return { ok: false, error: 'Missing project id' }
      return enqueue(`save:${project.id}`, async () => {
        try {
          const result = await saveProjectInner(project, { backups: opts?.backups })
          if (opts?.snapshotLabel) {
            await createBackup(project.id, project, opts.backups ?? 15)
          }
          markSession(project.id)
          return result
        } catch (error) {
          return { ok: false, error: (error as Error).message }
        }
      })
    }
  )

  ipcMain.handle('projects:rename', async (_e, id: string, name: string) => {
    await enqueue(`save:${id}`, async () => {
      const project = readJson<Project>(projectFile(id))
      if (!project) throw new Error('Project not found')
      project.name = projectLabel(name)
      project.updatedAt = Date.now()
      await writeJsonAtomic(projectFile(id), project)
    })
  })

  ipcMain.handle('projects:duplicate', async (_e, id: string) => {
    return enqueue(`duplicate:${id}`, () => duplicateProject(id))
  })

  ipcMain.handle('projects:remove', async (_e, id: string) => {
    await enqueue(`remove:${id}`, () => removeProject(id))
  })

  ipcMain.handle('projects:import', async () => importProject())
  ipcMain.handle('projects:export', async (_e, id: string) => exportProject(id))

  ipcMain.handle('projects:snapshots', async (_e, id: string) => listSnapshots(id))

  ipcMain.handle('projects:snapshot', async (_e, id: string, label?: string): Promise<SnapshotResult> => {
    try {
      const project = readJson<Project>(projectFile(id))
      if (!project) return { ok: false, error: 'Project not found' }
      if (label) {
        const clean = safeName(label).slice(0, 40) || 'snapshot'
        const target = join(backupsDir(id), `${clean}-${Date.now()}.json`)
        await writeJsonAtomic(target, project)
      }
      const snapshot = await createBackup(id, project, 999)
      return { ok: true, snapshot }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('projects:restore', async (_e, id: string, file: string): Promise<ProjectFile> => {
    assertId(id)
    const target = normalize(join(backupsDir(id), basename(file)))
    if (!target.startsWith(normalize(backupsDir(id)))) throw new Error('Invalid snapshot path')
    const project = readJson<Project>(target)
    if (!project) throw new Error('Snapshot could not be read')
    await enqueue(`save:${id}`, async () => {
      const current = readJson<Project>(projectFile(id))
      if (current) await createBackup(id, current, 15)
      project.id = id
      project.updatedAt = Date.now()
      await writeJsonAtomic(projectFile(id), project)
    })
    return loadProject(id)
  })

  ipcMain.handle('projects:reveal', async (_e, id: string) => {
    shell.showItemInFolder(projectFile(id))
  })

  ipcMain.handle('templates:list', async () => listTemplates())
  ipcMain.handle('templates:save', async (_e, projectId: string, name: string, description: string) =>
    saveTemplateFromProject(projectId, name, description)
  )
  ipcMain.handle('templates:instantiate', async (_e, templateId: string, name: string) =>
    enqueue(`template:${templateId}`, () => instantiateTemplate(templateId, name))
  )
  ipcMain.handle('templates:remove', async (_e, templateId: string) => removeTemplate(templateId))

  ipcMain.handle('assets:pick', async (_e, projectId: string): Promise<ImportedAsset[]> => {
    const picked = await dialog.showOpenDialog({
      title: await dialogText('Добавить материал на доску', 'Add material to board'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: await dialogText('Все поддерживаемые материалы', 'All supported materials'),
          extensions: [
            'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg',
            'mp4', 'webm', 'mov', 'mkv', 'avi',
            'mp3', 'wav', 'ogg', 'm4a', 'flac',
            'pdf', 'docx', 'doc', 'txt', 'md', 'json', 'csv'
          ]
        },
        { name: await dialogText('Изображения', 'Images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg'] },
        { name: await dialogText('Видео', 'Video'), extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] },
        { name: await dialogText('Документы', 'Documents'), extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] },
        { name: await dialogText('Все файлы', 'All files'), extensions: ['*'] }
      ]
    })
    if (picked.canceled) return []
    const out: ImportedAsset[] = []
    for (const path of picked.filePaths) {
      try {
        out.push(await importAssetFile(projectId, path))
      } catch (error) {
        console.error('asset import failed', error)
      }
    }
    return out
  })

  ipcMain.handle('assets:bytes', async (_e, projectId: string, name: string, bytes: ArrayBuffer) => {
    return importAssetBytes(projectId, name, bytes)
  })

  ipcMain.handle('assets:import-paths', async (_e, projectId: string, paths: string[]): Promise<ImportedAsset[]> => {
    const out: ImportedAsset[] = []
    for (const path of paths.slice(0, 100)) {
      try {
        out.push(await importAssetFile(projectId, path))
      } catch (error) {
        console.error('asset import failed', error)
      }
    }
    return out
  })

  ipcMain.handle('assets:open', async (_e, ref: string) => {
    const file = assetPathFromRef(ref)
    const result = await shell.openPath(file)
    if (result) throw new Error(result)
  })

  ipcMain.handle('assets:reveal', async (_e, ref: string) => {
    shell.showItemInFolder(assetPathFromRef(ref))
  })

  ipcMain.handle('settings:load', async () => loadSettings())
  ipcMain.handle('settings:save', async (_e, file: SettingsFile) =>
    enqueue('settings', () => saveSettings(file))
  )
  ipcMain.handle('settings:export', async (_e, file: SettingsFile): Promise<ExportResult> => {
    const picked = await dialog.showSaveDialog({
      title: await dialogText('Экспорт настроек', 'Export settings'),
      defaultPath: 'mindtrace-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
    await fs.writeFile(picked.filePath, JSON.stringify(file, null, 2), 'utf8')
    return { ok: true, path: picked.filePath }
  })
  ipcMain.handle('settings:import', async () => {
    const picked = await dialog.showOpenDialog({
      title: await dialogText('Импорт настроек', 'Import settings'),
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true }
    try {
      const raw = JSON.parse(await fs.readFile(picked.filePaths[0], 'utf8')) as SettingsFile
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
  })
  ipcMain.handle('settings:folder', async () => {
    await ensureDir(dataRoot)
    await shell.openPath(dataRoot)
  })

  ipcMain.handle('storage:choose', async () => {
    const picked = await dialog.showOpenDialog({
      title: await dialogText('Выберите папку данных Mindtrace', 'Choose a folder for Mindtrace data'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (picked.canceled || !picked.filePaths[0]) return { ok: false }
    const target = picked.filePaths[0]
    try {
      const newData = join(target, 'Mindtrace Data')
      if (normalize(newData) === normalize(dataRoot)) {
        return { ok: false, error: 'That is already the current data folder.' }
      }
      if (normalize(newData).startsWith(`${normalize(dataRoot)}${sep}`)) {
        return { ok: false, error: 'Choose a folder outside the current data folder.' }
      }
      await ensureDir(newData)
      await fs.cp(dataRoot, newData, { recursive: true, force: true })
      await fs.writeFile(
        configPath(),
        JSON.stringify({ dataDir: newData }, null, 2),
        'utf8'
      )
      return { ok: true, path: newData, requiresRestart: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('storage:folder', async () => {
    await ensureDir(dataRoot)
    await shell.openPath(dataRoot)
  })

  ipcMain.handle('export:png', async (_e, dataUrl: string, name: string) => saveDataUrl(dataUrl, name))
  ipcMain.handle('export:pdf', async (_e, bytes: ArrayBuffer, name: string) => savePdf(bytes, name))
  ipcMain.handle('export:image', async (_e, dataUrl: string, name: string, format: string) => {
    return saveImage(dataUrl, name, format)
  })

  ipcMain.handle('shell:openPath', async (_e, path: string) => {
    if (!existsSync(path)) throw new Error('File not found')
    const result = await shell.openPath(path)
    if (result) throw new Error(result)
  })
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (!/^(https?:|mailto:)/i.test(url)) throw new Error('Blocked external URL')
    await shell.openExternal(url)
  })
  ipcMain.handle('shell:showItem', async (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })

  ipcMain.on('session:start', (_e, projectId: string) => {
    if (projectId) markSession(projectId)
  })
  ipcMain.on('session:end', () => clearSession())
  ipcMain.on('app:close-ready', () => {
    clearSession()
    const win = mainWindow
    if (!win) return
    // Bypass the close guard by destroying after the renderer flushed.
    win.removeAllListeners('close')
    win.close()
  })
}

/* -------------------------------- protocol ------------------------------ */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mtasset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false
    }
  }
])

function registerProtocol(): void {
  protocol.handle('mtasset', async (request) => {
    try {
      const url = new URL(request.url)
      const id = url.hostname
      const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return new Response('Invalid project', { status: 400 })
      if (!fileName || fileName.includes('..') || fileName.includes('\\') || fileName.includes('/')) {
        return new Response('Invalid asset', { status: 400 })
      }
      const file = resolve(assetsDir(id), fileName)
      const root = resolve(assetsDir(id))
      const rel = relative(root, file)
      if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
        return new Response('Invalid asset', { status: 400 })
      }
      if (!existsSync(file)) return new Response('Not found', { status: 404 })
      const response = await net.fetch(pathToFileURL(file).toString())
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(response.body, { status: response.status, headers })
    } catch (error) {
      console.error('asset protocol error', error)
      return new Response('Asset error', { status: 500 })
    }
  })
}

/* ---------------------------------- boot -------------------------------- */

async function loadStorageConfig(): Promise<void> {
  const config = readJson<{ dataDir?: string }>(configPath())
  if (config?.dataDir) {
    try {
      await fs.access(config.dataDir)
      dataRoot = config.dataDir
    } catch {
      /* fall back to default */
    }
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    registerProtocol()
    await loadStorageConfig()
    await ensureDir(dataRoot)
    await ensureDir(projectsRoot())
    await readSession()
    registerIpc()
    app.setAppUserModelId('com.mindtrace.board')

    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; img-src 'self' data: blob: mtasset:; media-src 'self' data: blob: mtasset:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; connect-src 'self' mtasset:; frame-src 'self' mtasset: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'"
            ]
          }
        })
      })
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    // The close handler has a 2.5s safety timeout; never leave a stuck process.
    setTimeout(() => app.exit(0), 3000)
  })
}
