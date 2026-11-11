import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  LayoutGrid,
  Plus,
  Search,
  X
} from 'lucide-react'
import type { TemplateSummary } from '@shared/types'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { useT } from '@/i18n'
import { createProjectFromTemplate, saveProjectNow } from '@/services/bootstrap'
import { listTemplates } from '@/services/storage'
import { BUILTIN_TEMPLATES } from '@/core/templates'

const TEMPLATE_ICONS: Record<string, typeof LayoutGrid> = {
  empty: FilePlus2,
  investigation: Search,
  research: FlaskConical,
  study: GraduationCap,
  planning: ClipboardList
}

export default function CreateProjectDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const closeHome = useUi((state) => state.closeHome)
  const toast = useUi((state) => state.toast)
  const payload = useUi((state) => state.modalPayload)
  const project = useBoard((state) => state.project)
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('empty')
  const [customTemplates, setCustomTemplates] = useState<TemplateSummary[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (modal !== 'create') return
    setName('')
    setDescription('')
    setTemplate(payload ?? 'empty')
    setBusy(false)
    void listTemplates().then(setCustomTemplates)
  }, [modal, payload])

  const templates = useMemo(
    () => [
      ...BUILTIN_TEMPLATES.map((item) => ({
        id: item.id,
        name: t(item.nameKey),
        description: t(item.descriptionKey),
        custom: false
      })),
      ...customTemplates.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || t('Custom template'),
        custom: true
      }))
    ],
    [customTemplates, t]
  )

  if (modal !== 'create') return null

  const create = async (): Promise<void> => {
    const title = name.trim() || t('Untitled project')
    setBusy(true)
    try {
      await saveProjectNow()
      const selected = templates.find((item) => item.id === template)
      await createProjectFromTemplate(template, title, description, Boolean(selected?.custom))
      close()
      closeHome()
      toast(t('New project created'), 'success')
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <div className="dialog create-project-dialog" role="dialog" aria-modal="true" aria-label={t('Create a new project')}>
        <div className="dialog-head">
          <div className="head-icon">
            <Plus size={17} />
          </div>
          <div>
            <h2>{t('Create a new project')}</h2>
            <p>{t('Choose a starting point. You can change everything later.')}</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title={t('Close')} disabled={busy}>
            <X size={15} />
          </button>
        </div>

        <div className="dialog-body create-project-body">
          <div className="settings-grid">
            <label className="field-col">
              <span className="field-label">{t('Name')}</span>
              <input
                className="input"
                autoFocus
                value={name}
                placeholder={t('New project')}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy) void create()
                }}
              />
            </label>
            <label className="field-col">
              <span className="field-label">{t('Description')}</span>
              <input
                className="input"
                value={description}
                placeholder={t('Short description (optional)')}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>

          <div className="field-col" style={{ marginTop: 18 }}>
            <span className="field-label">{t('Template')}</span>
            <div className="template-grid">
              {templates.map((item) => {
                const Icon = item.custom ? FolderOpen : TEMPLATE_ICONS[item.id] ?? LayoutGrid
                return (
                  <button
                    key={item.id}
                    className={`template-card ${template === item.id ? 'is-active' : ''}`}
                    onClick={() => setTemplate(item.id)}
                  >
                    <span className="template-icon">
                      <Icon size={18} />
                    </span>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                    {item.custom && <em>{t('Custom template')}</em>}
                  </button>
                )
              })}
            </div>
          </div>

          {customTemplates.length > 0 && (
            <div className="hint-text" style={{ marginTop: 10 }}>
              {t('Templates')} · {customTemplates.length}
            </div>
          )}
        </div>

        <div className="dialog-foot">
          <div className="left">
            {project ? `${t('Template')}: ${templates.find((item) => item.id === template)?.name ?? ''}` : t('Create a project')}
          </div>
          <button className="btn" onClick={close} disabled={busy}>
            {t('Cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => void create()} disabled={busy}>
            <Plus size={12} /> {busy ? t('Working…') : t('Create project')}
          </button>
        </div>
      </div>
    </div>
  )
}
