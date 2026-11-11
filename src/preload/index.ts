import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MindtraceAPI } from '@shared/ipc'

const api: MindtraceAPI = {
  isElectron: true,
  info: () => ipcRenderer.invoke('app:info'),
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name, description) => ipcRenderer.invoke('projects:create', name, description),
    load: (id) => ipcRenderer.invoke('projects:load', id),
    save: (project, opts) => ipcRenderer.invoke('projects:save', project, opts),
    rename: (id, name) => ipcRenderer.invoke('projects:rename', id, name),
    duplicate: (id) => ipcRenderer.invoke('projects:duplicate', id),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    import: () => ipcRenderer.invoke('projects:import'),
    export: (id) => ipcRenderer.invoke('projects:export', id),
    snapshots: (id) => ipcRenderer.invoke('projects:snapshots', id),
    snapshot: (id, label) => ipcRenderer.invoke('projects:snapshot', id, label),
    restore: (id, file) => ipcRenderer.invoke('projects:restore', id, file),
    reveal: (id) => ipcRenderer.invoke('projects:reveal', id)
  },
  assets: {
    pick: (projectId) => ipcRenderer.invoke('assets:pick', projectId),
    importBytes: (projectId, name, bytes) => ipcRenderer.invoke('assets:bytes', projectId, name, bytes),
    importPaths: (projectId, paths) => ipcRenderer.invoke('assets:import-paths', projectId, paths),
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    open: (ref) => ipcRenderer.invoke('assets:open', ref),
    reveal: (ref) => ipcRenderer.invoke('assets:reveal', ref)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    save: (projectId, name, description) => ipcRenderer.invoke('templates:save', projectId, name, description),
    instantiate: (templateId, name) => ipcRenderer.invoke('templates:instantiate', templateId, name),
    remove: (templateId) => ipcRenderer.invoke('templates:remove', templateId)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (file) => ipcRenderer.invoke('settings:save', file),
    export: (file) => ipcRenderer.invoke('settings:export', file),
    import: () => ipcRenderer.invoke('settings:import'),
    openFolder: () => ipcRenderer.invoke('settings:folder')
  },
  storage: {
    chooseFolder: () => ipcRenderer.invoke('storage:choose'),
    openFolder: () => ipcRenderer.invoke('storage:folder')
  },
  export: {
    savePng: (dataUrl, name) => ipcRenderer.invoke('export:png', dataUrl, name),
    savePdf: (bytes, name) => ipcRenderer.invoke('export:pdf', bytes, name),
    saveImage: (dataUrl, name, format) => ipcRenderer.invoke('export:image', dataUrl, name, format)
  },
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItem: (path) => ipcRenderer.invoke('shell:showItem', path)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (cb) => {
      const listener = (_event: unknown, value: boolean): void => cb(value)
      ipcRenderer.on('window:maximized', listener)
      return () => ipcRenderer.removeListener('window:maximized', listener)
    }
  },
  session: {
    start: (projectId) => ipcRenderer.send('session:start', projectId),
    end: () => ipcRenderer.send('session:end')
  },
  onBeforeClose: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('app:request-flush', listener)
    return () => ipcRenderer.removeListener('app:request-flush', listener)
  },
  closeReady: () => ipcRenderer.send('app:close-ready')
}

contextBridge.exposeInMainWorld('mindtrace', api)
