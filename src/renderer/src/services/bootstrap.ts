import type { Project } from '@shared/types'
import { applyAppearance, flushSettings, useSettings } from '@/store/settings'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { createDemoProject, createStarterProject as buildStarterProject } from '@/core/demo'
import { newSpace } from '@/core/defaults'
import { normalizeProject } from '@/core/migrations'
import {
  createProjectOnDisk,
  getAppInfo,
  instantiateTemplate,
  listProjects,
  loadProjectFile,
  saveProjectFile,
  startSession,
  type ImportedAsset
} from '@/services/storage'
import { buildBuiltinProject } from '@/core/templates'

export interface BootstrapResult {
  ok: boolean
  uncleanShutdown: boolean
  projectName?: string
  error?: string
}

let saveChain: Promise<void> = Promise.resolve()
let saveScheduled = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastQueued = false

export function scheduleProjectSave(force = false): void {
  const board = useBoard.getState()
  if (!board.project || board.isLoading) return
  if (!force && !useSettings.getState().settings.data.autosave) return
  if (board.saveState !== 'saving') board.setSaveState('saving')
  if (saveTimer) clearTimeout(saveTimer)
  const delay = force ? 0 : Math.max(300, useSettings.getState().settings.data.autosaveInterval)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void saveProjectNow()
  }, delay)
}

export function saveProjectNow(): Promise<void> {
  if (saveScheduled) {
    lastQueued = true
    return saveChain
  }
  saveScheduled = true
  const run = async (): Promise<void> => {
    saveScheduled = false
    if (lastQueued) {
      lastQueued = false
      saveScheduled = true
      // Re-run once more after the current capture to include very recent changes.
      saveChain = saveChain.then(run).catch(() => undefined)
    }
    const state = useBoard.getState()
    if (!state.project) return
    state.setSaveState('saving')
    try {
      const result = await saveProjectFile(state.project, {
        backups: useSettings.getState().settings.data.backups
      })
      if (!result.ok) {
        state.setSaveState('error', undefined, result.error ?? 'Could not save project')
        useUi.getState().toast(result.error ?? 'Could not save project', 'error')
      } else {
        state.setSaveState('saved', result.savedAt)
      }
    } catch (error) {
      state.setSaveState('error', undefined, (error as Error).message)
      useUi.getState().toast(`Save failed: ${(error as Error).message}`, 'error')
    }
  }
  saveChain = saveChain.then(run, run).catch(() => undefined)
  return saveChain
}

export async function saveNowAndFlush(): Promise<void> {
  try {
    await saveProjectNow()
  } finally {
    await useSettings.getState().saveNow()
    flushSettings()
  }
}

export async function bootstrapApp(): Promise<BootstrapResult> {
  await useSettings.getState().load()
  applyAppearance(useSettings.getState().settings)
  let info
  try {
    info = await getAppInfo()
  } catch (error) {
    return { ok: false, uncleanShutdown: false, error: (error as Error).message }
  }

  let projects = await listProjects()
  if (!projects.length) {
    try {
      const placeholder = await createProjectOnDisk(
        'The Emerald Case',
        'A demonstration investigation board. Make it your own.'
      )
      const demo = createDemoProject()
      demo.id = placeholder.id
      demo.createdAt = placeholder.createdAt
      await saveProjectFile(demo, { backups: 0 })
      projects = await listProjects()
    } catch (error) {
      return { ok: false, uncleanShutdown: info.uncleanShutdown, error: (error as Error).message }
    }
  }

  const preferred = useSettings.getState().settings.data.lastProjectId ?? info.lastProjectId
  const target =
    projects.find((project) => project.id === preferred) ??
    projects.find((project) => project.id === projects[0].id) ??
    projects[0]
  if (!target) {
    return { ok: false, uncleanShutdown: info.uncleanShutdown, error: 'No projects available' }
  }

  try {
    const file = await loadProjectFile(target.id)
    if (!file.project) {
      return {
        ok: false,
        uncleanShutdown: info.uncleanShutdown,
        error: `Project “${target.name}” could not be opened. Its file may be damaged.`
      }
    }
    const project = normalizeProject(file.project)
    if (!project.spaces.length) {
      const space = newSpace('Board 01')
      project.spaces = [space]
      project.activeSpaceId = space.id
    }
    useBoard.getState().openProject(project)
    useSettings.getState().setLastProject(project.id)
    startSession(project.id)
    return {
      ok: true,
      uncleanShutdown: info.uncleanShutdown,
      projectName: project.name
    }
  } catch (error) {
    return { ok: false, uncleanShutdown: info.uncleanShutdown, error: (error as Error).message }
  }
}

export async function openProjectById(id: string): Promise<Project> {
  const file = await loadProjectFile(id)
  if (!file.project) throw new Error('Project could not be loaded')
  const project = normalizeProject(file.project)
  if (!project.spaces.length) {
    const space = newSpace('Board 01')
    project.spaces = [space]
    project.activeSpaceId = space.id
  }
  useBoard.getState().openProject(project)
  useSettings.getState().setLastProject(id)
  startSession(id)
  return project
}

export async function createStarterProject(name: string, description = ''): Promise<Project> {
  const created = await createProjectOnDisk(name, description)
  const starter = buildStarterProject(name)
  starter.id = created.id
  starter.createdAt = created.createdAt
  starter.description = description
  await saveProjectFile(starter, { backups: 0 })
  useBoard.getState().openProject(starter)
  useSettings.getState().setLastProject(starter.id)
  startSession(starter.id)
  return starter
}

export async function createProjectFromTemplate(
  templateId: string,
  name: string,
  description = '',
  custom = false
): Promise<Project> {
  let project: Project
  if (custom) {
    project = normalizeProject(await instantiateTemplate(templateId, name))
    project.description = description
    await saveProjectFile(project, { backups: 0 })
  } else {
    const created = await createProjectOnDisk(name, description)
    const built = buildBuiltinProject(templateId, name)
    built.id = created.id
    built.createdAt = created.createdAt
    built.description = description
    await saveProjectFile(built, { backups: 0 })
    project = built
  }
  useBoard.getState().openProject(project)
  useSettings.getState().setLastProject(project.id)
  startSession(project.id)
  return project
}

export async function insertAssetsIntoBoard(assets: ImportedAsset[], at: { x: number; y: number }): Promise<void> {
  if (!assets.length) return
  useBoard.getState().createCardsFromAssets(assets, at)
}
