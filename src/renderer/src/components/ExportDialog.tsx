import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileImage, FileText, FolderArchive, ImagePlus, Loader2, X } from 'lucide-react'
import { useActiveSpace, useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useT } from '@/i18n'
import { saveNowAndFlush } from '@/services/bootstrap'
import { exportProjectToDisk, saveImage, savePdf } from '@/services/storage'
import {
  estimateExport,
  exportBounds,
  exportSpaceToImage,
  exportSpaceToPdf,
  type ExportOptions
} from '@/services/exporter'
import { t } from '@/i18n'

type ImageFormat = 'png' | 'jpg' | 'webp'

const FORMATS: { id: ImageFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
  { id: 'webp', label: 'WebP' }
]

function safeFileBase(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\.+$/, '').trim() || 'mindtrace'
}

export default function ExportDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const toast = useUi((state) => state.toast)
  const project = useBoard((state) => state.project)
  const space = useActiveSpace()
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  const t = useT()
  const [format, setFormat] = useState<ImageFormat>('png')
  const [width, setWidth] = useState(1600)
  const [height, setHeight] = useState(1000)
  const [lockAspect, setLockAspect] = useState(true)
  const [quality, setQuality] = useState(0.92)
  const [transparent, setTransparent] = useState(false)
  const [background, setBackground] = useState(true)
  const [threads, setThreads] = useState(true)
  const [pins, setPins] = useState(true)
  const [fileName, setFileName] = useState('mindtrace-board')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [lastFile, setLastFile] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const base = useMemo(() => (space ? exportBounds(space) : { width: 1200, height: 800 }), [space])
  const aspect = base.width / Math.max(1, base.height)
  const estimate = space ? estimateExport(space, 1) : base

  useEffect(() => {
    if (modal !== 'export' || !project || !space) return
    const scale = settings.data.exportScale || 2
    setFormat((settings.data.exportFormat as ImageFormat) ?? 'png')
    setQuality(settings.data.exportQuality ?? 0.92)
    setTransparent(settings.data.exportTransparent ?? false)
    setBackground(settings.data.exportIncludeBackground)
    setThreads(settings.data.exportThreads)
    setPins(settings.data.exportPins)
    setLockAspect(settings.data.exportLockAspect)
    const nextWidth = settings.data.exportWidth ?? Math.max(320, Math.round(base.width * scale))
    const nextHeight = settings.data.exportHeight ?? Math.max(240, Math.round(base.height * scale))
    setWidth(nextWidth)
    setHeight(nextHeight)
    setFileName(
      safeFileBase(
        `${project.name}-${space.name}`
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/-+/g, '-')
      )
    )
    setPreviewUrl(null)
    setPreviewError('')
    setBusy(false)
    setProgress(0)
    setMessage('')
    setLastFile(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  const options = useMemo<ExportOptions>(
    () => ({
      width,
      height,
      format: format === 'jpg' ? 'jpeg' : format,
      quality,
      transparent: format === 'jpg' ? false : transparent,
      includeBackground: background,
      includeThreads: threads,
      includePins: pins
    }),
    [width, height, format, quality, transparent, background, threads, pins]
  )

  useEffect(() => {
    if (modal !== 'export' || !project || !space) return
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => {
      const maxPreview = 940
      const ratio = Math.min(1, maxPreview / Math.max(width, height))
      const previewWidth = Math.max(80, Math.round(width * ratio))
      const previewHeight = Math.max(60, Math.round(height * ratio))
      let alive = true
      setPreviewBusy(true)
      setPreviewError('')
      exportSpaceToImage(
        project,
        space,
        settings,
        {
          ...options,
          width: previewWidth,
          height: previewHeight,
          format: 'png',
          quality: 0.9
        },
        () => undefined
      )
        .then((result) => {
          if (alive) setPreviewUrl(result.dataUrl)
        })
        .catch((error: Error) => {
          if (alive) setPreviewError(error.message)
        })
        .finally(() => {
          if (alive) setPreviewBusy(false)
        })
      return () => {
        alive = false
      }
    }, 260)
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, options, project?.id, space?.id])

  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    },
    []
  )

  if (modal !== 'export' || !project || !space) return null

  const setWidthKeepingAspect = (value: number): void => {
    const next = Math.max(64, Math.round(value) || 1)
    setWidth(next)
    if (lockAspect) setHeight(Math.max(64, Math.round(next / aspect)))
  }

  const setHeightKeepingAspect = (value: number): void => {
    const next = Math.max(64, Math.round(value) || 1)
    setHeight(next)
    if (lockAspect) setWidth(Math.max(64, Math.round(next * aspect)))
  }

  const setScale = (factor: number): void => {
    setWidth(Math.max(64, Math.round(base.width * factor)))
    setHeight(Math.max(64, Math.round(base.height * factor)))
  }

  const doExport = async (): Promise<void> => {
    setBusy(true)
    setProgress(0)
    setMessage(t('Preparing preview…'))
    setLastFile(null)
    try {
      const result = await exportSpaceToImage(project, space, settings, options, (value, text) => {
        setProgress(value)
        setMessage(text)
      })
      const baseName = safeFileBase(fileName)
      const extension = format === 'jpg' ? 'jpg' : format
      const saved = await saveImage(result.dataUrl, `${baseName}.${extension}`, format)
      if (saved.canceled) {
        setMessage(t('Export cancelled'))
        return
      }
      if (!saved.ok) throw new Error(t(saved.error ?? 'Could not save image'))
      update('data', {
        exportFormat: format,
        exportQuality: quality,
        exportWidth: width,
        exportHeight: height,
        exportLockAspect: lockAspect,
        exportTransparent: transparent,
        exportIncludeBackground: background,
        exportThreads: threads,
        exportPins: pins
      })
      setLastFile(saved.path ?? `${baseName}.${extension}`)
      toast(`${format.toUpperCase()} ${t('Saved')}`, 'success')
    } catch (error) {
      toast(`${t('Export failed: {message}', { message: (error as Error).message })}`, 'error', 5000)
      setMessage(t('Export failed: {message}', { message: (error as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const doExportPdf = async (): Promise<void> => {
    setBusy(true)
    setProgress(0)
    setMessage(t('Preparing preview…'))
    setLastFile(null)
    try {
      const bytes = await exportSpaceToPdf(project, space, settings, options, (value, text) => {
        setProgress(value)
        setMessage(text)
      })
      const baseName = safeFileBase(fileName)
      const saved = await savePdf(bytes.buffer as ArrayBuffer, `${baseName}.pdf`)
      if (saved.canceled) return
      if (!saved.ok) throw new Error(t(saved.error ?? 'Could not save PDF'))
      setLastFile(saved.path ?? `${baseName}.pdf`)
      toast(`${t('PDF exported')}`, 'success')
    } catch (error) {
      toast(t('Export failed: {message}', { message: (error as Error).message }), 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  const exportArchive = async (): Promise<void> => {
    setBusy(true)
    try {
      await saveNowAndFlush()
      const result = await exportProjectToDisk(project.id)
      if (result.canceled) return
      if (!result.ok) throw new Error(t(result.error ?? 'Could not export project'))
      toast(t('Project archive exported'), 'success')
      if (result.path) setLastFile(result.path)
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <div className="dialog export-dialog export-dialog-wide" role="dialog" aria-modal="true" aria-label={t('Export the board')}>
        <div className="dialog-head">
          <div className="head-icon">
            <Download size={17} />
          </div>
          <div>
            <h2>{t('Export the board')}</h2>
            <p>{t('Positions, threads, pins, labels and chalk are preserved at every scale.')}</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} disabled={busy} title={t('Close')}>
            <X size={15} />
          </button>
        </div>

        <div className="dialog-body export-body">
          <div className="export-layout">
            <div className="export-preview-pane">
              <div className="export-preview checker">
                {previewUrl ? (
                  <img src={previewUrl} alt={t('Preview')} />
                ) : (
                  <div className="export-preview-empty">
                    {previewBusy ? <Loader2 size={18} className="spin" /> : <ImagePlus size={20} />}
                    <span>{previewBusy ? t('Generating preview…') : t('Preview')}</span>
                  </div>
                )}
              </div>
              <div className="export-preview-meta">
                <span>
                  {t('Preview')} · {width} × {height} {t("px")}{' '}</span>
                <span>{format.toUpperCase()}{format !== 'png' ? ` · ${Math.round(quality * 100)}%` : ''}</span>
              </div>
              {previewError && <div className="warning-box danger-box">{previewError}</div>}
            </div>

            <div className="export-settings-pane">
              <div className="field-col">
                <span className="field-label">{t('Format')}</span>
                <div className="format-switch">
                  {FORMATS.map((item) => (
                    <button
                      key={item.id}
                      className={format === item.id ? 'is-active' : ''}
                      onClick={() => {
                        setFormat(item.id)
                        if (item.id === 'jpg') setTransparent(false)
                      }}
                      disabled={busy}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-col" style={{ marginTop: 10 }}>
                <span className="field-label">{t('File name')}</span>
                <div className="export-file-row">
                  <input className="input" value={fileName} onChange={(event) => setFileName(event.target.value)} />
                  <span className="export-extension">.{format === 'jpg' ? 'jpg' : format}</span>
                </div>
              </div>

              <div className="settings-grid" style={{ marginTop: 10 }}>
                <label className="field-col">
                  <span className="field-label">{t('Width (px)')}</span>
                  <input
                    className="input"
                    type="number"
                    min={64}
                    max={20000}
                    value={width}
                    onChange={(event) => setWidthKeepingAspect(Number(event.target.value))}
                  />
                </label>
                <label className="field-col">
                  <span className="field-label">{t('Height (px)')}</span>
                  <input
                    className="input"
                    type="number"
                    min={64}
                    max={20000}
                    value={height}
                    onChange={(event) => setHeightKeepingAspect(Number(event.target.value))}
                  />
                </label>
                <label className="field-col full export-inline-check">
                  <span>
                    <button
                      className={`toggle ${lockAspect ? 'is-on' : ''}`}
                      onClick={() => setLockAspect(!lockAspect)}
                      aria-label={t('Lock aspect ratio')}
                    />
                    {t('Lock aspect ratio')}
                  </span>
                  <span className="hint-text">
                    {estimate.width} × {estimate.height} {t('Current')}
                  </span>
                </label>
              </div>

              <div className="export-scale-row">
                <span className="field-label">{t('Scale')}</span>
                <button className="btn btn-sm" onClick={() => setScale(1)}>1×</button>
                <button className="btn btn-sm" onClick={() => setScale(2)}>2×</button>
                <button className="btn btn-sm" onClick={() => setScale(3)}>3×</button>
                <button className="btn btn-sm" onClick={() => setScale(4)}>4×</button>
              </div>

              {format !== 'png' && (
                <div className="field-col" style={{ marginTop: 9 }}>
                  <span className="field-label">{t('Quality')} · {Math.round(quality * 100)}%</span>
                  <input
                    className="range"
                    type="range"
                    min={30}
                    max={100}
                    value={Math.round(quality * 100)}
                    onChange={(event) => setQuality(Number(event.target.value) / 100)}
                  />
                </div>
              )}

              <div className="export-toggles">
                <div className="field-row">
                  <span className="field-label">{t('Board surface')}</span>
                  <button
                    className={`toggle ${background ? 'is-on' : ''}`}
                    onClick={() => setBackground(!background)}
                    aria-label={t('Board surface')}
                  />
                </div>
                <div className="field-row">
                  <span className="field-label">{t('Threads & labels')}</span>
                  <button
                    className={`toggle ${threads ? 'is-on' : ''}`}
                    onClick={() => setThreads(!threads)}
                    aria-label={t('Threads & labels')}
                  />
                </div>
                <div className="field-row">
                  <span className="field-label">{t('Pins')}</span>
                  <button
                    className={`toggle ${pins ? 'is-on' : ''}`}
                    onClick={() => setPins(!pins)}
                    disabled={!threads}
                    aria-label={t('Pins')}
                  />
                </div>
                <div className="field-row">
                  <span className="field-label">{t('Transparent background')}</span>
                  <button
                    className={`toggle ${transparent ? 'is-on' : ''}`}
                    onClick={() => setTransparent(!transparent)}
                    disabled={format === 'jpg'}
                    aria-label={t('Transparent background')}
                  />
                </div>
                {format === 'jpg' && <span className="hint-text">{t('JPEG does not support transparency.')}</span>}
              </div>

              {busy && (
                <>
                  <div className="export-progress">
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <div className="hint-text">{message || t('Preparing preview…')}</div>
                </>
              )}

              {lastFile && !busy && (
                <div className="warning-box" style={{ borderColor: 'rgba(110,156,115,0.3)', background: 'rgba(110,156,115,0.08)', color: 'var(--text-dim)' }}>
                  {t('Saved to {path}', { path: lastFile })}
                </div>
              )}
            </div>
          </div>

          <div className="divider-full" />
          <div className="export-footer-actions">
            <button className="btn btn-sm" onClick={() => void doExportPdf()} disabled={busy}>
              <FileText size={12} /> {t('Export PDF')}
            </button>
            <button className="btn btn-sm" onClick={() => void exportArchive()} disabled={busy}>
              <FolderArchive size={12} /> {t('Export .mndtr')}
            </button>
            <span className="hint-text">
              {project.name} · {space.name} · {t('{count} cards', { count: Object.keys(space.cards).length })}
            </span>
          </div>
        </div>

        <div className="dialog-foot">
          <div className="left">
            {estimate.width} × {estimate.height} · {t('Board surface')} / {t('Threads')} / {t('Pins')}
          </div>
          <button className="btn" onClick={close} disabled={busy}>
            {t('Cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => void doExport()} disabled={busy}>
            <Download size={12} /> {busy ? t('Exporting…') : `${t('Export')} ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
