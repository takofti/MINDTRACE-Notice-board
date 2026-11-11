import { useEffect, useState } from 'react'
import { AlertCircle, FolderOpen, RefreshCw, X } from 'lucide-react'
import { applyAppearance, useSettings } from '@/store/settings'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { bootstrapApp, saveNowAndFlush, saveProjectNow, scheduleProjectSave } from '@/services/bootstrap'
import { closeReady, isElectron, onBeforeClose, openDataFolder } from '@/services/storage'
import { useHotkeys } from '@/hooks/useHotkeys'
import TitleBar from '@/components/TitleBar'
import ToolRail from '@/components/ToolRail'
import Board from '@/components/Board'
import Inspector from '@/components/Inspector'
import SearchPalette from '@/components/SearchPalette'
import SettingsDialog from '@/components/SettingsDialog'
import ProjectsDialog from '@/components/ProjectsDialog'
import FilterDialog from '@/components/FilterDialog'
import HelpDialog from '@/components/HelpDialog'
import ExportDialog from '@/components/ExportDialog'
import ContextMenu from '@/components/ContextMenu'
import ConfirmDialog from '@/components/ConfirmDialog'
import Lightbox from '@/components/Lightbox'
import Toasts from '@/components/Toasts'
import HomeScreen from '@/components/HomeScreen'
import CreateProjectDialog from '@/components/CreateProjectDialog'
import { t } from '@/i18n'

let bootPromise: ReturnType<typeof bootstrapApp> | null = null

type BootPhase = 'loading' | 'ready' | 'error'

export default function App(): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const loaded = useSettings((state) => state.loaded)
  const project = useBoard((state) => state.project)
  const selection = useBoard((state) => state.selection)
  const editingCardId = useBoard((state) => state.editingCardId)
  const boardInteracting = useUi((state) => state.boardInteracting)
  const inspectorSide = useSettings((state) => state.settings.ui.inspectorSide)
  const toolRailSide = useSettings((state) => state.settings.ui.toolRailSide)
  const showInspector = useSettings((state) => state.settings.ui.showInspector)
  const showToolRail = useSettings((state) => state.settings.ui.showToolRail)
  const [phase, setPhase] = useState<BootPhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [recoveryName, setRecoveryName] = useState('')

  useHotkeys()

  useEffect(() => {
    applyAppearance(settings)
  }, [settings])

  useEffect(() => {
    if (!bootPromise) bootPromise = bootstrapApp()
    let alive = true
    bootPromise
      .then((result) => {
        if (!alive) return
        if (!result.ok) {
          setError(result.error ? t(result.error) : t('The board could not be opened.'))
          setPhase('error')
          return
        }
        setPhase('ready')
        if (result.uncleanShutdown) {
          setRecovery(true)
          setRecoveryName(result.projectName ?? '')
        }
      })
      .catch((err: Error) => {
        if (!alive) return
        setError(err.message)
        setPhase('error')
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    const unsubscribe = useBoard.subscribe((state, previous) => {
      if (state.project && state.project !== previous.project && !state.isLoading) {
        scheduleProjectSave()
      }
    })
    return unsubscribe
  }, [phase])

  useEffect(() => {
    if (phase !== 'ready') return
    const dispose = onBeforeClose(() => {
      void saveNowAndFlush().finally(() => closeReady())
    })
    const beforeUnload = (): void => {
      if (!isElectron) {
        void saveProjectNow()
        void useSettings.getState().saveNow()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      dispose()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [phase])

  useEffect(() => {
    document.title = project?.name ? `${project.name} — Mindtrace` : 'Mindtrace'
  }, [project?.name])

  useEffect(() => {
    if (phase !== 'ready') return
    if (useSettings.getState().settings.ui.showHomeOnLaunch) {
      useUi.getState().openHome()
    }
  }, [phase])

  useEffect(() => {
    if (!loaded) return
    const error = useSettings.getState().error
    if (error) useUi.getState().toast(error, 'error', 5000)
  }, [loaded])

  const selectionActive =
    selection.cards.length + selection.threads.length + selection.strokes.length + selection.groups.length > 0
  const inspectorVisible = Boolean(project) && showInspector && (selectionActive || editingCardId) && !boardInteracting

  return (
    <div
      className="app-shell"
      onContextMenu={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return
        event.preventDefault()
      }}
    >
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'error' && (
        <ErrorScreen
          message={error ?? 'Unknown error'}
          onRetry={() => window.location.reload()}
          onFolder={() => void openDataFolder()}
        />
      )}

      {phase === 'ready' && project && (
        <>
          <TitleBar />
          <div
            className={[
              'app-body',
              inspectorVisible && inspectorSide === 'right' ? 'inspector-right' : '',
              inspectorVisible && inspectorSide === 'left' ? 'inspector-left' : '',
              toolRailSide === 'right' ? 'rail-right' : ''
            ].join(' ')}
          >
            {showToolRail && toolRailSide === 'left' && <ToolRail />}
            {inspectorVisible && inspectorSide === 'left' && <Inspector />}
            <main className="workspace">
              <Board />
              {recovery && (
                <div className="recovery-banner">
                  <div className="recovery-icon">
                    <AlertCircle size={17} />
                  </div>
                  <div className="recovery-text">
                    <strong>{t("Recovered after an unexpected close.")}</strong>
                    <span>
                      {recoveryName
                        ? `“${recoveryName}” was restored from its last autosave.`
                        : 'Your last autosave was restored.'}{' '}
                      {t("Snapshots are available in Settings → Data.")}{' '}</span>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      useUi.getState().openModal('settings', 'data')
                      setRecovery(false)
                    }}
                  >
                    {t("View snapshots")}{' '}</button>
                  <button
                    className="icon-btn"
                    title={t("Dismiss")}
                    onClick={() => setRecovery(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </main>
            {showToolRail && toolRailSide === 'right' && <ToolRail />}
            {inspectorVisible && inspectorSide === 'right' && <Inspector />}
          </div>
        </>
      )}

      <SearchPalette />
      <SettingsDialog />
      <ProjectsDialog />
      <CreateProjectDialog />
      <HomeScreen />
      <FilterDialog />
      <HelpDialog />
      <ExportDialog />
      <ContextMenu />
      <ConfirmDialog />
      <Lightbox />
      <Toasts />
    </div>
  )
}

function LoadingScreen(): React.JSX.Element {
  return (
    <div className="boot-screen">
      <div className="boot-brand">
        <span className="boot-mark">M</span>
        <div>
          <div className="boot-wordmark">{t("MINDTRACE")}</div>
          <div className="boot-sub">{t("Investigation workspace")}</div>
        </div>
      </div>
      <div className="boot-progress">
        <span />
      </div>
      <p>{t("Restoring threads, pins and chalk marks…")}</p>
    </div>
  )
}

function ErrorScreen({
  message,
  onRetry,
  onFolder
}: {
  message: string
  onRetry: () => void
  onFolder: () => void
}): React.JSX.Element {
  return (
    <div className="boot-screen">
      <div className="boot-brand">
        <span className="boot-mark boot-mark-error">
          <AlertCircle size={26} />
        </span>
        <div>
          <div className="boot-wordmark">{t("MINDTRACE")}</div>
          <div className="boot-sub">{t("The board did not open")}</div>
        </div>
      </div>
      <p className="boot-error-text">{message}</p>
      <p className="boot-hint">
        {t("Your project files are never overwritten without a backup. Open the data folder to inspect or restore a snapshot.")}{' '}</p>
      <div className="boot-actions">
        <button className="btn btn-primary" onClick={onRetry}>
          <RefreshCw size={15} /> {t("Try again")}{' '}</button>
        <button className="btn" onClick={onFolder}>
          <FolderOpen size={15} /> {t("Open data folder")}{' '}</button>
      </div>
    </div>
  )
}
