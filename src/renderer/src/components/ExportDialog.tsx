import { useEffect, useState } from 'react'
import { Download, FileImage, FileText, FolderArchive, X } from 'lucide-react'
import { useActiveSpace, useBoard } from '@/store/board'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { saveNowAndFlush } from '@/services/bootstrap'
import { exportProjectToDisk, savePdf, savePng } from '@/services/storage'
import { estimateExport, exportSpaceToImage, exportSpaceToPdf } from '@/services/exporter'

export default function ExportDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const toast = useUi((state) => state.toast)
  const project = useBoard((state) => state.project)
  const space = useActiveSpace()
  const settings = useSettings((state) => state.settings)
  const [format, setFormat] = useState<'png' | 'pdf'>('png')
  const [scale, setScale] = useState(settings.data.exportScale)
  const [background, setBackground] = useState(settings.data.exportIncludeBackground)
  const [threads, setThreads] = useState(settings.data.exportThreads)
  const [pins, setPins] = useState(settings.data.exportPins)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [lastFile, setLastFile] = useState<string | null>(null)

  useEffect(() => {
    if (modal !== 'export') return
    setBusy(false)
    setProgress(0)
    setMessage('')
    setLastFile(null)
    setScale(settings.data.exportScale)
    setBackground(settings.data.exportIncludeBackground)
    setThreads(settings.data.exportThreads)
    setPins(settings.data.exportPins)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  if (modal !== 'export' || !project || !space) return null

  const estimate = estimateExport(space, scale)
  const cards = Object.keys(space.cards).length
  const threadCount = Object.keys(space.threads).length
  const strokes = Object.keys(space.strokes).length
  const fileName = `${project.name.replace(/[^\w\- ]+/g, '').trim() || 'mindtrace'}-${space.name
    .replace(/[^\w\- ]+/g, '')
    .trim() || 'board'}`

  const doExport = async (): Promise<void> => {
    setBusy(true)
    setProgress(0)
    setMessage('Preparing')
    setLastFile(null)
    try {
      if (format === 'png') {
        const result = await exportSpaceToImage(
          project,
          space,
          settings,
          { scale, includeBackground: background, includeThreads: threads, includePins: pins },
          (value, text) => {
            setProgress(value)
            setMessage(text)
          }
        )
        const saved = await savePng(result.dataUrl, `${fileName}.png`)
        if (saved.canceled) {
          setMessage('Export cancelled')
          return
        }
        if (!saved.ok) throw new Error(saved.error ?? 'Could not save image')
        setLastFile(saved.path ?? `${fileName}.png`)
        toast('PNG exported', 'success')
      } else {
        const bytes = await exportSpaceToPdf(
          project,
          space,
          settings,
          { scale, includeBackground: background, includeThreads: threads, includePins: pins },
          (value, text) => {
            setProgress(value)
            setMessage(text)
          }
        )
        const saved = await savePdf(bytes.buffer as ArrayBuffer, `${fileName}.pdf`)
        if (saved.canceled) {
          setMessage('Export cancelled')
          return
        }
        if (!saved.ok) throw new Error(saved.error ?? 'Could not save PDF')
        setLastFile(saved.path ?? `${fileName}.pdf`)
        toast('PDF exported', 'success')
      }
    } catch (error) {
      toast(`Export failed: ${(error as Error).message}`, 'error', 5000)
      setMessage('Export failed')
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
      if (!result.ok) throw new Error(result.error ?? 'Could not export project')
      toast('Project archive exported', 'success')
      if (result.path) setLastFile(result.path)
    } catch (error) {
      toast((error as Error).message, 'error', 5000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <div className="dialog export-dialog" role="dialog" aria-modal="true" aria-label="Export">
        <div className="dialog-head">
          <div className="head-icon">
            <Download size={17} />
          </div>
          <div>
            <h2>Export the board</h2>
            <p>Positions, threads, pins, labels and chalk are preserved at every scale.</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} disabled={busy} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="dialog-body export-body">
          <div className="export-options">
            <button className={`export-option ${format === 'png' ? 'is-active' : ''}`} onClick={() => setFormat('png')} disabled={busy}>
              <FileImage size={18} />
              <strong>PNG image</strong>
              <span>High-resolution still of this space.</span>
            </button>
            <button className={`export-option ${format === 'pdf' ? 'is-active' : ''}`} onClick={() => setFormat('pdf')} disabled={busy}>
              <FileText size={18} />
              <strong>PDF page</strong>
              <span>Single page sized to the board content.</span>
            </button>
          </div>

          <div className="settings-card">
            <div className="settings-grid">
              <div className="field-col">
                <span className="field-label">Export scale</span>
                <select
                  className="select"
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  disabled={busy}
                >
                  <option value={1}>1× — screen</option>
                  <option value={2}>2× — retina</option>
                  <option value={3}>3× — print</option>
                </select>
              </div>
              <div className="field-col">
                <span className="field-label">Estimated image</span>
                <div className="input" style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
                  {estimate.width.toLocaleString()} × {estimate.height.toLocaleString()} px
                </div>
              </div>
              <div className="field-col full">
                <div className="field-row">
                  <span className="field-label">Board surface</span>
                  <button className={`toggle ${background ? 'is-on' : ''}`} onClick={() => setBackground(!background)} disabled={busy} />
                </div>
                <div className="field-row">
                  <span className="field-label">Threads &amp; labels</span>
                  <button className={`toggle ${threads ? 'is-on' : ''}`} onClick={() => setThreads(!threads)} disabled={busy} />
                </div>
                <div className="field-row">
                  <span className="field-label">Pins</span>
                  <button className={`toggle ${pins ? 'is-on' : ''}`} onClick={() => setPins(!pins)} disabled={busy || !threads} />
                </div>
              </div>
            </div>
          </div>

          <div className="row" style={{ display: 'flex', gap: 14, marginTop: 14, color: 'var(--muted)', fontSize: 10 }}>
            <span>{cards} cards</span>
            <span>{threadCount} threads</span>
            <span>{strokes} drawings</span>
            <span style={{ marginLeft: 'auto' }}>Space: {space.name}</span>
          </div>

          {busy && (
            <>
              <div className="export-progress">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="hint-text">{message || 'Rendering…'}</div>
            </>
          )}

          {lastFile && !busy && (
            <div className="warning-box" style={{ marginTop: 12, borderColor: 'rgba(110,156,115,0.3)', background: 'rgba(110,156,115,0.08)', color: 'var(--text-dim)' }}>
              Saved to <span style={{ userSelect: 'text' }}>{lastFile}</span>
            </div>
          )}

          <div className="divider-full" />
          <div className="field-row">
            <div className="setting-label">
              <strong>Whole project archive</strong>
              <small>Spaces, files, images, threads, drawings, categories — portable to another computer.</small>
            </div>
            <button className="btn btn-sm" onClick={() => void exportArchive()} disabled={busy}>
              <FolderArchive size={12} /> Export .mndtr
            </button>
          </div>
        </div>

        <div className="dialog-foot">
          <div className="left">
            {format === 'png' ? 'PNG' : 'PDF'} · current space only · board layout is never rearranged
          </div>
          <button className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void doExport()} disabled={busy}>
            <Download size={12} /> {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
