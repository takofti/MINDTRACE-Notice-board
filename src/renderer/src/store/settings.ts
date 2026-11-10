import { create } from 'zustand'
import {
  cloneSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
  type AppSettings,
  type SettingsFile
} from '@shared/settings'
import type { SettingsProfile } from '@shared/types'
import {
  exportSettingsFile,
  importSettingsFile,
  loadSettingsFile,
  saveSettingsFile
} from '@/services/storage'

type Section = keyof AppSettings

interface SettingsState {
  settings: AppSettings
  profiles: SettingsProfile[]
  loaded: boolean
  saving: boolean
  error: string | null
  load: () => Promise<void>
  update: <K extends Section>(section: K, patch: Partial<AppSettings[K]>) => void
  replace: (settings: AppSettings) => void
  setLastProject: (id: string | null) => void
  saveNow: () => Promise<void>
  saveProfile: (name: string) => void
  applyProfile: (id: string) => void
  deleteProfile: (id: string) => void
  resetSection: (section: Section) => void
  resetAll: () => void
  exportToDisk: () => Promise<void>
  importFromDisk: () => Promise<{ ok: boolean; error?: string }>
  setError: (message: string | null) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function fileFromState(state: {
  settings: AppSettings
  profiles: SettingsProfile[]
}): SettingsFile {
  return {
    settings: state.settings,
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      settings: profile.settings as AppSettings
    }))
  }
}

function scheduleSave(get: () => SettingsState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void get().saveNow()
  }, 450)
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: cloneSettings(DEFAULT_SETTINGS),
  profiles: [],
  loaded: false,
  saving: false,
  error: null,

  load: async () => {
    try {
      const file = await loadSettingsFile()
      set({
        settings: mergeSettings(file.settings),
        profiles: (file.profiles ?? []).map((profile) => ({
          ...profile,
          settings: mergeSettings(profile.settings)
        })),
        loaded: true,
        error: null
      })
    } catch (error) {
      set({
        settings: cloneSettings(DEFAULT_SETTINGS),
        loaded: true,
        error: `Settings could not be loaded: ${(error as Error).message}`
      })
    }
  },

  update: (section, patch) => {
    set((state) => {
      const current = state.settings[section] as unknown as Record<string, unknown>
      return {
        settings: {
          ...state.settings,
          [section]: {
            ...current,
            ...(patch as Record<string, unknown>)
          }
        }
      }
    })
    scheduleSave(get)
  },

  replace: (settings) => {
    set({ settings: mergeSettings(settings) })
    scheduleSave(get)
  },

  setLastProject: (id) => {
    get().update('data', { lastProjectId: id })
  },

  saveNow: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    set({ saving: true })
    try {
      const result = await saveSettingsFile(fileFromState(get()))
      set({ saving: false, error: result.ok ? null : result.error ?? 'Could not save settings' })
    } catch (error) {
      set({ saving: false, error: (error as Error).message })
    }
  },

  saveProfile: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const profile: SettingsProfile = {
      id: `prof_${Date.now().toString(36)}`,
      name: trimmed,
      createdAt: Date.now(),
      settings: structuredClone(get().settings)
    }
    set((state) => ({ profiles: [profile, ...state.profiles] }))
    scheduleSave(get)
  },

  applyProfile: (id) => {
    const profile = get().profiles.find((item) => item.id === id)
    if (!profile) return
    const lastProjectId = get().settings.data.lastProjectId
    const merged = mergeSettings(profile.settings)
    merged.data.lastProjectId = lastProjectId
    set({ settings: merged })
    scheduleSave(get)
  },

  deleteProfile: (id) => {
    set((state) => ({ profiles: state.profiles.filter((profile) => profile.id !== id) }))
    scheduleSave(get)
  },

  resetSection: (section) => {
    const defaults = cloneSettings(DEFAULT_SETTINGS)
    if (section === 'data') {
      const lastProjectId = get().settings.data.lastProjectId
      set({ settings: { ...get().settings, data: { ...defaults.data, lastProjectId } } })
    } else {
      set({ settings: { ...get().settings, [section]: defaults[section] } })
    }
    scheduleSave(get)
  },

  resetAll: () => {
    const lastProjectId = get().settings.data.lastProjectId
    const defaults = cloneSettings(DEFAULT_SETTINGS)
    defaults.data.lastProjectId = lastProjectId
    set({ settings: defaults })
    scheduleSave(get)
  },

  exportToDisk: async () => {
    await exportSettingsFile(fileFromState(get()))
  },

  importFromDisk: async () => {
    const result = await importSettingsFile()
    if (!result.ok || !result.file) return { ok: false, error: result.error }
    const lastProjectId = get().settings.data.lastProjectId
    const merged = mergeSettings(result.file.settings)
    merged.data.lastProjectId = lastProjectId
    set({
      settings: merged,
      profiles: (result.file.profiles ?? []).map((profile) => ({
        ...profile,
        settings: mergeSettings(profile.settings)
      }))
    })
    scheduleSave(get)
    return { ok: true }
  },

  setError: (message) => set({ error: message })
}))

export function applyAppearance(settings: AppSettings): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = settings.ui.theme
  root.dataset.density = settings.ui.density
  root.dataset.motion = settings.ui.animations && !settings.ui.reducedMotion ? 'on' : 'off'
  root.dataset.quality = settings.performance.quality
  root.dataset.effects = settings.performance.effects ? 'on' : 'off'
  root.dataset.shadows = settings.performance.shadows ? 'on' : 'off'
  root.dataset.blur = settings.performance.blur ? 'on' : 'off'
  root.style.setProperty('--accent', settings.ui.accent)
  root.style.setProperty('--ui-scale', String(settings.ui.uiScale))
  root.style.setProperty('--panel-opacity', String(settings.ui.panelOpacity))
  root.style.setProperty('--icon-scale', String(settings.ui.iconScale))
  const panel =
    settings.ui.theme === 'light'
      ? `rgba(247, 244, 236, ${settings.ui.panelOpacity})`
      : `rgba(20, 22, 27, ${settings.ui.panelOpacity})`
  root.style.setProperty('--panel', panel)
}

export function flushSettings(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  void useSettings.getState().saveNow()
}
