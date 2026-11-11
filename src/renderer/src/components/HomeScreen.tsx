import { useEffect, useState } from 'react'
import {
  Check,
  Clock3,
  FolderOpen,
  HardDrive,
  Import,
  Layers,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
  Maximize2,
  Minus
} from 'lucide-react'
import type { ProjectSummary, TemplateSummary } from '@shared/types'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { useLocale, useT } from '@/i18n'
import { formatDate } from '@/core/geometry'
import {
  isElectron,
  listProjects,
  listTemplates,
  removeTemplate,
  saveProjectAsTemplate,
  windowControls,
  importProjectFromDisk
} from '@/services/storage'
import { openProjectById, saveProjectNow } from '@/services/bootstrap'
import { BUILTIN_TEMPLATES } from '@/core/templates'

export default function HomeScreen(): React.JSX.Element | null {
  const open = useUi((state) => state.homeOpen)
  const closeHome = useUi((state) => state.closeHome)
  const openModal = useUi((state) => state.openModal)
  const ask = useUi((state) => state.ask)
  const toast = useUi((state) => state.toast)
  const project = useBoard((state) => state.project)
  const modal = useUi((state) => state.modal)
  const t = useT()
  const locale = useLocale()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [templateForm, setTemplateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')

  const refresh = async (): Promise<void> => {
    const [projectList, templateList] = await Promise.all([listProjects(), listTemplates()])
    setProjects(projectList)
    setTemplates(templateList)
  }

  useEffect(() => {
    if (!open) return
    void refresh()
    setTemplateForm(false)
    setTemplateName(project ? `${project.name}` : '')
    setTemplateDescription('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && modal === null) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, open])

  if (!open) return null

  const openProject = async (id: string): Promise<void> => {
    if (id === project?.id) {
      closeHome()
      return
    }
    setBusy(true)
    try {
      await saveProjectNow()
      await openProjectById(id)
      closeHome()
      toast(t('Project opened'), 'success')
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  const importProject = async (): Promise<void> => {
    setBusy(true)
    try {
      await saveProjectNow()
      const result = await importProjectFromDisk()
      if (result.canceled) return
      if (!result.ok || !result.project) throw new Error(result.error ?? 'Import failed')
      await openProjectById(result.project.id)
      await refresh()
      closeHome()
      toast(t('Project imported'), 'success')
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  const saveAsTemplate = async (): Promise<void> => {
    if (!project) return
    setBusy(true)
    try {
      await saveProjectNow()
      await saveProjectAsTemplate(project.id, templateName || project.name, templateDescription)
      setTemplateForm(false)
      setTemplateDescription('')
      await refresh()
      toast(t('Template saved'), 'success')
    } catch (error) {
      toast((error as Error).message, 'error', 4500)
    } finally {
      setBusy(false)
    }
  }

  const deleteTemplate = (template: TemplateSummary): void => {
    ask({
      title: t('Delete template?'),
      message: `«${template.name}»`,
      confirmLabel: t('Delete'),
      danger: true,
      action: async () => {
        await removeTemplate(template.id)
        await refresh()
        toast(t('Template deleted'), 'success')
      }
    })
  }

  const lastProject = project ? projects.find((item) => item.id === project.id) : projects[0]

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="home-brand">
          <span className="brand-mark">M</span>
          <div>
            <div className="home-wordmark">MINDTRACE</div>
            <div className="home-tagline">{t('Infinite board · local files · no account')}</div>
          </div>
        </div>
        <div className="home-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => openModal('settings')}>
            <Settings size={12} /> {t('Settings')}
          </button>
          {isElectron && (
            <div className="window-controls">
              <button onClick={() => windowControls.minimize()} title={t('Minimize')}>
                <Minus size={14} />
              </button>
              <button onClick={() => windowControls.toggleMaximize()} title={t('Maximize')}>
                <Maximize2 size={13} />
              </button>
              <button className="close-window" onClick={() => windowControls.close()} title={t('Close')}>
                <X size={15} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="home-body">
        <section className="home-hero">
          <div className="home-eyebrow">
            <span className="home-live-dot" />
            {t('Home')} · 1.0.0
          </div>
          <h1>{t('A calm place to organize everything that matters.')}</h1>
          <p>{t('Create a project before entering the editor. Your work stays on this computer.')}</p>
          <div className="home-hero-actions">
            <button
              className="btn btn-primary home-primary-action"
              onClick={() => openModal('create')}
              disabled={busy}
            >
              <Plus size={14} /> {t('Create project')}
            </button>
            {lastProject && (
              <button className="btn home-continue" onClick={() => void openProject(lastProject.id)} disabled={busy}>
                <Clock3 size={13} /> {t('Continue')} «{lastProject.name}»
              </button>
            )}
            <button className="btn" onClick={() => void importProject()} disabled={busy}>
              <Import size={13} /> {t('Import project')}
            </button>
          </div>
          <div className="home-hero-meta">
            <span>{projects.length} {t('Projects')}</span>
            <span>·</span>
            <span>{t('Everything is saved locally')}</span>
          </div>
        </section>

        <div className="home-layout">
          <section className="home-projects">
            <div className="home-section-head">
              <div>
                <h2>{t('Recent projects')}</h2>
                <p>{t('Your work is saved automatically. Continue where you left off.')}</p>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => openModal('projects')}>
                <FolderOpen size={12} /> {t('All projects')}
              </button>
            </div>
            <div className="home-project-grid">
              {projects.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  className={`home-project-card ${item.id === project?.id ? 'is-current' : ''}`}
                  onClick={() => void openProject(item.id)}
                  onDoubleClick={() => void openProject(item.id)}
                  disabled={busy}
                >
                  <div className="home-project-card-top">
                    <span className="home-project-icon"><LayoutGrid size={15} /></span>
                    {item.id === project?.id && <span className="home-current-badge">{t('Current')}</span>}
                  </div>
                  <strong>{item.name}</strong>
                  <span className="home-project-description">{item.description || t('No description')}</span>
                  <div className="home-project-card-foot">
                    <span>{t('{count} spaces', { count: item.spaceCount })}</span>
                    <span>{t('{count} cards', { count: item.cardCount })}</span>
                    <span>{formatDate(item.updatedAt, locale)}</span>
                  </div>
                </button>
              ))}
              {!projects.length && <div className="home-empty">{t('No projects yet.')}</div>}
            </div>
          </section>

          <aside className="home-side">
            <div className="home-section-head">
              <div>
                <h2>{t('Templates')}</h2>
                <p>{t('Built-in templates')}</p>
              </div>
            </div>
            <div className="home-template-list">
              {BUILTIN_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="home-template-row"
                  onClick={() => openModal('create', template.id)}
                >
                  <span className="home-template-icon"><Layers size={13} /></span>
                  <span>
                    <strong>{t(template.nameKey)}</strong>
                    <small>{t(template.descriptionKey)}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="home-side-divider" />
            <div className="home-section-head">
              <div>
                <h2>{t('My templates')}</h2>
                <p>{t('Save current project as template')}</p>
              </div>
              {project && (
                <button className="icon-btn" onClick={() => setTemplateForm(!templateForm)} title={t('Save as template')}>
                  <Plus size={13} />
                </button>
              )}
            </div>
            {templateForm && (
              <div className="home-template-form">
                <input
                  className="input"
                  value={templateName}
                  placeholder={t('Template name')}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
                <input
                  className="input"
                  value={templateDescription}
                  placeholder={t('Description')}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                />
                <button className="btn btn-sm btn-primary" onClick={() => void saveAsTemplate()} disabled={busy}>
                  <Check size={11} /> {t('Save as template')}
                </button>
              </div>
            )}
            <div className="home-custom-templates">
              {templates.map((template) => (
                <div key={template.id} className="home-custom-template">
                  <span className="home-template-icon"><Search size={13} /></span>
                  <span>
                    <strong>{template.name}</strong>
                    <small>{template.description || t('Custom template')}</small>
                  </span>
                  <button className="icon-btn is-danger" onClick={() => deleteTemplate(template)} title={t('Delete')}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {!templates.length && <div className="home-empty small">{t('No custom templates yet. Save a project as a template from its menu.')}</div>}
            </div>
          </aside>
        </div>

        <footer className="home-footer">
          <span><HardDrive size={11} /> {t('Everything is saved locally')}</span>
          <span className="home-footer-spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => openModal('help')}>
            <Sparkles size={11} /> {t('Help')}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => closeHome()}>
            {t('Continue')} <X size={11} />
          </button>
        </footer>
      </div>
    </div>
  )
}
