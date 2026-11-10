import { useEffect, useState } from 'react'
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Import,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import type { ProjectSummary } from '@shared/types'
import { useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import {
  createSnapshot,
  deleteProjectOnDisk,
  duplicateProjectOnDisk,
  exportProjectToDisk,
  importProjectFromDisk,
  listProjects,
  renameProjectOnDisk,
  revealProject
} from '@/services/storage'
import { createStarterProject, openProjectById, saveProjectNow } from '@/services/bootstrap'
import { formatDate } from '@/core/geometry'

export default function ProjectsDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const toast = useUi((state) => state.toast)
  const ask = useUi((state) => state.ask)
  const project = useBoard((state) => state.project)
  const board = useBoard()
  const settings = useSettings((state) => state.settings)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [description, setDescription] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async (select?: string): Promise<void> => {
    const list = await listProjects()
    setProjects(list)
    const target = select ?? selected ?? project?.id ?? list[0]?.id ?? null
    setSelected(target && list.some((item) => item.id === target) ? target : list[0]?.id ?? null)
  }

  useEffect(() => {
    if (modal !== 'projects') return
    setName('')
    setNewDescription('')
    setSelected(project?.id ?? null)
    void refresh(project?.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  useEffect(() => {
    const current = projects.find((item) => item.id === selected)
    setRenameValue(current?.name ?? '')
    if (current) setDescription(current.description)
  }, [selected, projects])

  if (modal !== 'projects') return null

  const active = projects.find((item) => item.id === selected)
  const isCurrent = selected === project?.id

  const openProject = async (id: string): Promise<void> => {
    if (id === project?.id) {
      close()
      return
    }
    setBusy(true)
    try {
      await saveProjectNow()
      await openProjectById(id)
      close()
      toast('Project opened', 'success', 1600)
    } catch (error) {
      toast((error as Error).message, 'error', 4500)
    } finally {
      setBusy(false)
    }
  }

  const createNew = async (): Promise<void> => {
    const title = name.trim() || 'Untitled project'
    setBusy(true)
    try {
      await saveProjectNow()
      await createStarterProject(title, newDescription)
      setName('')
      setNewDescription('')
      close()
      toast('New project created', 'success', 1600)
    } catch (error) {
      toast((error as Error).message, 'error', 4500)
    } finally {
      setBusy(false)
    }
  }

  const rename = async (): Promise<void> => {
    if (!active || !renameValue.trim() || renameValue.trim() === active.name) return
    setBusy(true)
    try {
      if (isCurrent) await saveProjectNow()
      await renameProjectOnDisk(active.id, renameValue.trim())
      if (isCurrent) {
        board.updateProjectMeta({ name: renameValue.trim() })
        await saveProjectNow()
      }
      await refresh(active.id)
      toast('Project renamed', 'success', 1500)
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (): Promise<void> => {
    if (!active) return
    setBusy(true)
    try {
      if (isCurrent) await saveProjectNow()
      const copy = await duplicateProjectOnDisk(active.id)
      await refresh(copy.id)
      toast('Project duplicated', 'success', 1600)
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!active) return
    ask({
      title: 'Delete this project?',
      message: `“${active.name}” and all of its assets will be deleted from disk.\n\nThis cannot be undone from inside Mindtrace. Export the project first if you may need it again.`,
      confirmLabel: 'Delete project',
      danger: true,
      action: async () => {
        setBusy(true)
        try {
          await deleteProjectOnDisk(active.id)
          const remaining = (await listProjects()).filter((item) => item.id !== active.id)
          if (remaining.length === 0) {
            await createStarterProject('Untitled project')
          } else if (active.id === project?.id) {
            await openProjectById(remaining[0].id)
          }
          await refresh(remaining[0]?.id)
          toast('Project deleted', 'success', 1600)
        } finally {
          setBusy(false)
        }
      }
    })
  }

  const doImport = async (): Promise<void> => {
    setBusy(true)
    try {
      if (project && settings.data.snapshotOnImport) {
        await saveProjectNow()
        await createSnapshot(project.id, 'before-import')
      }
      const result = await importProjectFromDisk()
      if (result.canceled) return
      if (!result.ok || !result.project) throw new Error(result.error ?? 'Import failed')
      await saveProjectNow()
      await openProjectById(result.project.id)
      await refresh(result.project.id)
      close()
      toast('Project imported', 'success', 1900)
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  const doExport = async (): Promise<void> => {
    if (!active) return
    setBusy(true)
    try {
      if (isCurrent) await saveProjectNow()
      const result = await exportProjectToDisk(active.id)
      if (result.canceled) return
      if (!result.ok) throw new Error(result.error ?? 'Export failed')
      toast(result.path ? `Exported to ${result.path}` : 'Project exported', 'success', 3500)
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  const saveDescription = async (): Promise<void> => {
    if (!isCurrent) return
    board.updateProjectMeta({ description })
    await saveProjectNow()
    await refresh(project.id)
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="dialog projects-dialog" role="dialog" aria-modal="true" aria-label="Projects">
        <div className="dialog-head">
          <div className="head-icon">
            <FolderOpen size={17} />
          </div>
          <div>
            <h2>Projects</h2>
            <p>Each project carries its own spaces, material, threads, drawings, categories and files.</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="projects-layout">
          <div className="projects-list">
            {projects.map((item) => (
              <button
                key={item.id}
                className={`project-item ${selected === item.id ? 'is-active' : ''}`}
                onClick={() => setSelected(item.id)}
                onDoubleClick={() => void openProject(item.id)}
              >
                <span className="project-title">
                  {item.id === project?.id && <span className="tab-dot" />}
                  {item.name}
                </span>
                <span className="project-desc">{item.description || 'No description'}</span>
                <span className="project-meta">
                  <span>{item.spaceCount} spaces</span>
                  <span>{item.cardCount} cards</span>
                  <span>{formatDate(item.updatedAt)}</span>
                </span>
              </button>
            ))}
            {!projects.length && <div className="empty-projects">No projects yet.</div>}
          </div>

          <div className="projects-detail">
            {active ? (
              <>
                <h3>{active.name}</h3>
                <div className="project-description">
                  {active.description || 'No description yet.'}
                </div>
                <div className="project-stats">
                  <div className="stat">
                    <strong>{active.spaceCount}</strong>
                    <span>Spaces</span>
                  </div>
                  <div className="stat">
                    <strong>{active.cardCount}</strong>
                    <span>Materials</span>
                  </div>
                  <div className="stat">
                    <strong>{isCurrent ? 'Open' : 'On disk'}</strong>
                    <span>Status</span>
                  </div>
                </div>

                <div className="field-col">
                  <span className="field-label">Project name</span>
                  <div className="row">
                    <input className="input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
                    <button className="btn btn-sm" onClick={() => void rename()} disabled={busy}>
                      Rename
                    </button>
                  </div>
                </div>

                <div className="field-col" style={{ marginTop: 10 }}>
                  <span className="field-label">Description</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={description}
                    disabled={!isCurrent}
                    onChange={(event) => setDescription(event.target.value)}
                    onBlur={() => void saveDescription()}
                    placeholder={isCurrent ? 'What is this board for?' : 'Open this project to edit its description.'}
                  />
                </div>

                <div className="project-actions" style={{ marginTop: 18 }}>
                  <button className="btn btn-primary" onClick={() => void openProject(active.id)} disabled={busy}>
                    {isCurrent ? 'Return to board' : 'Open project'}
                  </button>
                  <button className="btn" onClick={() => void doExport()} disabled={busy}>
                    Export .mndtr
                  </button>
                  <button className="btn" onClick={() => void duplicate()} disabled={busy}>
                    <Copy size={12} /> Duplicate
                  </button>
                  <button className="btn" onClick={() => void revealProject(active.id)}>
                    <ExternalLink size={12} /> Show files
                  </button>
                  <button className="btn btn-danger" onClick={() => void remove()} disabled={busy || projects.length <= 1}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>

                <div className="project-form">
                  <div className="field-label">New project</div>
                  <div className="row">
                    <input className="input" value={name} placeholder="Project name" onChange={(event) => setName(event.target.value)} />
                    <button className="btn btn-sm" onClick={() => void createNew()} disabled={busy}>
                      <Plus size={12} /> Create
                    </button>
                  </div>
                  <input className="input" value={newDescription} placeholder="Short description (optional)" onChange={(event) => setNewDescription(event.target.value)} />
                  <div className="settings-actions">
                    <button className="btn btn-sm" onClick={() => void doImport()} disabled={busy}>
                      <Import size={12} /> Import .mndtr
                    </button>
                    <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>
                      <RefreshCw size={12} /> Refresh
                    </button>
                    <span className="hint-text" style={{ alignSelf: 'center' }}>
                      A new project starts with one blank board.
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-projects">
                <p>No project selected.</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    void createNew()
                  }}
                >
                  Create a project
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="dialog-foot">
          <div className="left">
            {busy ? 'Working…' : isCurrent ? 'Current project is open' : 'Changes are saved automatically'}
          </div>
          <button className="btn btn-sm" onClick={() => void doImport()} disabled={busy}>
            <Import size={12} /> Import project
          </button>
          <button className="btn btn-primary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
