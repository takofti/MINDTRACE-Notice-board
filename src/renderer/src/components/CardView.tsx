import { memo, useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  File as FileIcon,
  FileText,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Lock,
  MoreHorizontal,
  Image as ImageIcon,
  Music,
  Strikethrough,
  Underline,
  Video
} from 'lucide-react'
import type { Card } from '@shared/types'
import { ANCHOR_IDS } from '@shared/types'
import { useAssetUrl } from '@/hooks/useAssetUrl'
import { useBoard } from '@/store/board'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import {
  openAsset,
  openExternal,
  readAssetBytes,
  readAssetText
} from '@/services/storage'
import { pinNorm } from '@/core/geometry'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type DocState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; html?: string; text?: string }
  | { status: 'error'; message: string }

const docCache = new Map<string, { html?: string; text?: string }>()

export interface CardViewProps {
  card: Card
  zoom: number
  selected: boolean
  editing: boolean
  dimmed: boolean
  showAnchors: boolean
  connectedPins: Map<string, string[]>
  canConnect: boolean
  showResize: boolean
}

function CardView({
  card,
  zoom,
  selected,
  editing,
  dimmed,
  showAnchors,
  connectedPins,
  canConnect,
  showResize
}: CardViewProps): React.JSX.Element {
  const settings = useSettings((state) => state.settings)
  const updateCard = useBoard((state) => state.updateCard)
  const setEditingCard = useBoard((state) => state.setEditingCard)
  const openContextMenu = useUi((state) => state.openContextMenu)
  const openLightbox = useUi((state) => state.openLightbox)
  const [hovered, setHovered] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(card.title)
  const asset = useAssetUrl(card.assetUrl)
  const isNote = card.kind === 'note'
  const revealAllPins =
    canConnect &&
    (settings.objects.pinVisibility === 'always' ||
      showAnchors ||
      selected ||
      (hovered &&
        settings.interaction.autoRevealPins &&
        settings.objects.pinVisibility !== 'connected'))
  const pinsVisible = revealAllPins || (canConnect && connectedPins.size > 0)

  const styleVars: React.CSSProperties & Record<string, string | number> = {
    zIndex: card.z,
    width: card.w,
    height: card.h,
    transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
    '--card-radius': `${card.style?.radius ?? settings.objects.cardRadius}px`,
    '--card-bg': isNote
      ? card.color ?? settings.objects.noteColor
      : card.color ?? settings.objects.cardBackground,
    '--card-text': card.style?.color ?? (isNote ? settings.objects.noteText : settings.objects.cardText),
    '--card-border':
      card.style?.borderColor ??
      (isNote ? 'rgba(0,0,0,0.18)' : settings.objects.cardBorder),
    '--card-font-size': `${card.style?.fontSize ?? (isNote ? settings.objects.noteFontSize : settings.objects.cardFontSize)}px`,
    '--card-font-family':
      card.style?.fontFamily ?? (isNote ? settings.objects.textFontFamily : settings.objects.cardFontFamily),
    '--card-line-height': settings.objects.textLineHeight,
    '--card-opacity': card.style?.opacity ?? settings.objects.cardOpacity,
    '--img-fit': card.style?.imageFit ?? settings.objects.imageFit,
    '--card-align': card.style?.align ?? 'left',
    '--pin-color': settings.objects.pinColor,
    '--pin-size': `${settings.objects.pinSize}px`,
    '--inv-zoom': 1 / zoom
  }

  const allPins = [
    ...ANCHOR_IDS.map((id) => ({ id, x: pinNorm(card, id).x, y: pinNorm(card, id).y, custom: false })),
    ...card.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y, custom: true }))
  ]

  const openMenu = (event: React.MouseEvent): void => {
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({
      type: 'card',
      id: card.id,
      screen: { x: rect.right, y: rect.bottom + 4 },
      world: { x: card.x + card.w / 2, y: card.y + card.h / 2 }
    })
  }

  const handleOpenAsset = (): void => {
    if (card.assetUrl) void openAsset(card.assetUrl).catch((error) => useUi.getState().toast((error as Error).message, 'error'))
  }

  const imgFit = card.style?.imageFit ?? settings.objects.imageFit

  return (
    <div
      className={[
        'card',
        `kind-${card.kind}`,
        selected ? 'selected' : '',
        editing ? 'is-editing' : '',
        dimmed ? 'is-dimmed' : '',
        card.locked ? 'is-locked' : '',
        card.hidden ? 'is-hidden-ghost' : ''
      ].join(' ')}
      style={styleVars}
      data-card-id={card.id}
      data-kind={card.kind}
      data-pin-shape={settings.objects.pinShape}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="card-inner">
        {!isNote && (
          <div className="card-head">
            <span className="kind-icon">{kindIcon(card.kind, 12)}</span>
            {titleEditing ? (
              <input
                className="card-title"
                style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 3, padding: '1px 4px' }}
                value={titleDraft}
                autoFocus
                data-interactive
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  updateCard(card.id, { title: titleDraft.trim() || card.title }, true)
                  setTitleEditing(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                  if (event.key === 'Escape') {
                    setTitleDraft(card.title)
                    setTitleEditing(false)
                  }
                  event.stopPropagation()
                }}
              />
            ) : (
              <span
                className="card-title"
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  setTitleEditing(true)
                  setTitleDraft(card.title)
                }}
                title={card.title || 'Untitled'}
              >
                {card.title || kindLabel(card.kind)}
              </span>
            )}
            {card.locked && <Lock size={10} className="kind-icon" />}
            <button className="card-menu" onClick={openMenu} data-interactive title="Card actions">
              <MoreHorizontal size={13} />
            </button>
          </div>
        )}

        {isNote && (
          <button className="card-menu" style={{ position: 'absolute', right: 5, top: 5, opacity: hovered || selected ? 1 : 0 }} onClick={openMenu} data-interactive title="Note actions">
            <MoreHorizontal size={13} />
          </button>
        )}

        {(card.kind === 'text' || card.kind === 'note') && (
          <RichTextBody card={card} editing={editing} zoom={zoom} onExit={() => setEditingCard(null)} />
        )}

        {card.kind === 'image' && (
          <div className="card-kind-body">
            {asset.url ? (
              <img
                src={asset.url}
                alt={card.caption || card.title || 'Board image'}
                draggable={false}
                style={{ objectFit: imgFit }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  openLightbox({
                    src: asset.url as string,
                    title: card.title || card.assetName || 'Image',
                    caption: card.caption
                  })
                }}
              />
            ) : (
              <div className="file-body">
                <FileText size={22} className="file-icon-large" />
                <span className="hint-text">{asset.loading ? 'Loading image…' : 'Image unavailable'}</span>
              </div>
            )}
          </div>
        )}

        {card.kind === 'image' && (
          <div className="image-caption">
            <span>{card.caption || card.assetName || card.title || 'Untitled image'}</span>
          </div>
        )}

        {card.kind === 'video' && (
          <div className="card-kind-body" data-interactive>
            {asset.url ? (
              <video src={asset.url} controls preload="metadata" draggable={false} />
            ) : (
              <div className="file-body">
                <Video size={22} className="file-icon-large" />
                <span className="hint-text">{asset.loading ? 'Loading video…' : 'Video unavailable'}</span>
              </div>
            )}
          </div>
        )}

        {card.kind === 'audio' && (
          <div className="media-controls" data-interactive>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Music size={16} style={{ color: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="file-name">{card.title || card.assetName}</div>
                <div className="file-meta">AUDIO</div>
              </div>
            </div>
            {asset.url && <audio src={asset.url} controls preload="metadata" />}
          </div>
        )}

        {card.kind === 'pdf' && (
          <div className="card-kind-body" data-interactive>
            {asset.url ? (
              <PdfPreview card={card} />
            ) : (
              <div className="file-body">
                <FileText size={22} className="file-icon-large" />
                <span className="hint-text">{asset.loading ? 'Loading PDF…' : 'PDF unavailable'}</span>
              </div>
            )}
          </div>
        )}

        {card.kind === 'doc' && (
          <DocBody card={card} loading={asset.loading} url={asset.url} />
        )}

        {card.kind === 'file' && (
          <div className="file-body" data-interactive>
            <FileIcon size={24} className="file-icon-large" />
            <div className="file-name">{card.assetName || card.title}</div>
            <div className="file-meta">{card.mime || 'FILE'}</div>
            <button className="btn btn-sm" onClick={handleOpenAsset} style={{ marginTop: 3 }}>
              <ExternalLink size={11} /> Open file
            </button>
          </div>
        )}

        {card.kind === 'link' && (
          <div className="link-body" data-interactive>
            <LinkIcon size={18} style={{ color: 'var(--blue)' }} />
            <div className="file-name">{card.title || 'Web link'}</div>
            <div className="link-url">{card.assetUrl}</div>
            <button
              className="btn btn-sm"
              onClick={() => card.assetUrl && void openExternal(card.assetUrl).catch((e) => useUi.getState().toast((e as Error).message, 'error'))}
            >
              <ExternalLink size={11} /> Open link
            </button>
          </div>
        )}
      </div>

      {pinsVisible &&
        allPins
          .filter((pin) => {
            const connected = connectedPins.has(pin.id)
            return connected || revealAllPins
          })
          .map((pin) => {
            const colors = connectedPins.get(pin.id) ?? []
            return (
              <button
                key={pin.id}
                className={[
                  'pin-anchor',
                  colors.length ? 'is-connected' : 'is-ghost',
                  pin.custom ? 'is-custom' : ''
                ].join(' ')}
                style={{
                  left: `${pin.x * 100}%`,
                  top: `${pin.y * 100}%`,
                  ['--thread-dot' as string]: colors[0] ?? 'transparent'
                }}
                data-pin={pin.id}
                data-shape={settings.objects.pinShape}
                title={
                  colors.length
                    ? `${colors.length} thread${colors.length === 1 ? '' : 's'} — drag to tie another`
                    : 'Drag this pin to another card to tie a thread'
                }
              >
                <span className="pin-ring" />
              </button>
            )
          })}

      {showResize && selected && !card.locked && (
        <>
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
            <span
              key={handle}
              className="resize-handle"
              data-handle={handle}
              data-resize={handle}
              title="Resize"
            />
          ))}
        </>
      )}
    </div>
  )
}

function kindLabel(kind: Card['kind']): string {
  switch (kind) {
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'pdf':
      return 'PDF'
    case 'doc':
      return 'Document'
    case 'file':
      return 'File'
    case 'link':
      return 'Link'
    default:
      return 'Untitled'
  }
}

function kindIcon(kind: Card['kind'], size = 12): React.JSX.Element {
  const props = { size }
  switch (kind) {
    case 'image':
      return <ImageIcon {...props} />
    case 'video':
      return <Video {...props} />
    case 'audio':
      return <Music {...props} />
    case 'pdf':
    case 'doc':
      return <FileText {...props} />
    case 'file':
      return <FileIcon {...props} />
    case 'link':
      return <LinkIcon {...props} />
    default:
      return <FileText {...props} />
  }
}

/* ------------------------------ rich text ------------------------------- */

function RichTextBody({
  card,
  editing,
  zoom,
  onExit
}: {
  card: Card
  editing: boolean
  zoom: number
  onExit: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const updateCard = useBoard((state) => state.updateCard)
  const beginHistory = useBoard((state) => state.beginHistory)
  const commitHistory = useBoard((state) => state.commitHistory)
  const wasEditing = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el && el.innerHTML !== card.body) {
      el.innerHTML = card.body || '<p></p>'
    }
  }, [card.body, editing])

  useEffect(() => {
    if (editing && !wasEditing.current) {
      wasEditing.current = true
      beginHistory('Edit text')
      requestAnimationFrame(() => {
        ref.current?.focus()
        document.execCommand('styleWithCSS', false, 'true')
        const selection = window.getSelection()
        if (selection && ref.current) {
          const range = document.createRange()
          range.selectNodeContents(ref.current)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      })
    } else if (!editing && wasEditing.current) {
      wasEditing.current = false
      commitHistory()
    }
  }, [editing, beginHistory, commitHistory])

  useEffect(() => () => {
    if (wasEditing.current) {
      wasEditing.current = false
      commitHistory()
    }
  }, [commitHistory])

  const exec = (command: string, value?: string): void => {
    document.execCommand(command, false, value)
    if (ref.current) updateCard(card.id, { body: ref.current.innerHTML })
  }

  return (
    <>
      {editing && (
        <div
          className="format-bar"
          style={{ ['--inv-zoom' as string]: 1 / zoom }}
          data-interactive
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
            <Bold size={12} />
          </button>
          <button title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
            <Italic size={12} />
          </button>
          <button title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>
            <Underline size={12} />
          </button>
          <button title="Strike" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')}>
            <Strikethrough size={12} />
          </button>
          <span className="format-sep" />
          <button title="Bullet list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>
            <List size={12} />
          </button>
          <button title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>
            <ListOrdered size={12} />
          </button>
          <span className="format-sep" />
          <button title="Align left" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')}>
            <AlignLeft size={12} />
          </button>
          <button title="Align center" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')}>
            <AlignCenter size={12} />
          </button>
          <button title="Align right" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')}>
            <AlignRight size={12} />
          </button>
        </div>
      )}
      <div
        ref={ref}
        className="card-body"
        contentEditable={editing}
        suppressContentEditableWarning
        data-interactive={editing ? true : undefined}
        spellCheck
        onInput={() => {
          if (ref.current) updateCard(card.id, { body: ref.current.innerHTML })
        }}
        onBlur={() => {
          if (ref.current) updateCard(card.id, { body: ref.current.innerHTML })
          onExit()
        }}
        onPaste={(event) => {
          if (!editing) return
          const text = event.clipboardData.getData('text/plain')
          if (text) {
            event.preventDefault()
            document.execCommand('insertText', false, text)
            if (ref.current) updateCard(card.id, { body: ref.current.innerHTML })
          }
        }}
      />
    </>
  )
}

/* ------------------------------- documents ------------------------------ */

function PdfPreview({ card }: { card: Card }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<{ doc: import('pdfjs-dist').PDFDocumentProxy } | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setMessage('Reading PDF…')
    ;(async () => {
      try {
        const bytes = await readAssetBytes(card.assetUrl as string)
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
        if (!alive) {
          void doc.cleanup()
          return
        }
        setPdf({ doc })
        setPageNumber(1)
        setStatus('ready')
      } catch (error) {
        if (!alive) return
        setStatus('error')
        setMessage((error as Error).message)
      }
    })()
    return () => {
      alive = false
    }
  }, [card.assetUrl])

  useEffect(() => {
    return () => {
      if (pdf) void pdf.doc.cleanup()
    }
  }, [pdf])

  useEffect(() => {
    if (!pdf) return
    let alive = true
    ;(async () => {
      try {
        setStatus('loading')
        setMessage(`Rendering page ${pageNumber}…`)
        const page = await pdf.doc.getPage(pageNumber)
        if (!alive) return
        const base = page.getViewport({ scale: 1 })
        const available = containerRef.current
        const maxWidth = Math.max(220, available?.clientWidth ?? 380)
        const scale = Math.min(2.4, Math.max(0.8, (maxWidth - 24) / base.width))
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
        if (alive) {
          setStatus('ready')
          setMessage('')
        }
      } catch (error) {
        if (alive) {
          setStatus('error')
          setMessage((error as Error).message)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [pdf, pageNumber])

  return (
    <div className="pdf-preview">
      <div className="pdf-canvas-wrap" ref={containerRef}>
        {status === 'loading' && (
          <div className="file-body">
            <FileText size={22} className="file-icon-large" />
            <span className="hint-text">{message || 'Rendering PDF…'}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="file-body">
            <FileText size={22} className="file-icon-large" />
            <span className="hint-text">Preview unavailable{message ? `: ${message}` : '.'}</span>
            <button className="btn btn-sm" onClick={() => void openAsset(card.assetUrl as string)}>
              <ExternalLink size={11} /> Open PDF
            </button>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`pdf-canvas ${status === 'ready' ? 'is-ready' : ''}`}
          aria-label={card.title || 'PDF preview'}
        />
      </div>
      {pdf && (
        <div className="pdf-toolbar">
          <button
            className="icon-btn"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
            title="Previous page"
          >
            <ChevronLeft size={12} />
          </button>
          <span>
            {pageNumber} / {pdf.doc.numPages}
          </span>
          <button
            className="icon-btn"
            disabled={pageNumber >= pdf.doc.numPages}
            onClick={() => setPageNumber((value) => Math.min(pdf.doc.numPages, value + 1))}
            title="Next page"
          >
            <ChevronRight size={12} />
          </button>
          <span className="pdf-toolbar-spacer" />
          <button
            className="icon-btn"
            onClick={() => void openAsset(card.assetUrl as string)}
            title="Open in the default PDF viewer"
          >
            <ExternalLink size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

function sanitizeHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    doc.querySelectorAll('script,style,iframe,object,embed,link').forEach((node) => node.remove())
    doc.querySelectorAll('*').forEach((node) => {
      for (const attr of Array.from(node.attributes)) {
        if (/^on/i.test(attr.name) || attr.name === 'srcdoc') node.removeAttribute(attr.name)
      }
    })
    return (doc.body.firstElementChild as HTMLElement | null)?.innerHTML ?? ''
  } catch {
    return ''
  }
}

function DocBody({ card, loading, url }: { card: Card; loading: boolean; url?: string }): React.JSX.Element {
  const [state, setState] = useState<DocState>({ status: 'idle' })
  const ext = (card.assetName ?? '').split('.').pop()?.toLowerCase() ?? ''

  useEffect(() => {
    if (!card.assetUrl || loading) return
    const cached = docCache.get(card.assetUrl)
    if (cached) {
      setState({ status: 'ready', ...cached })
      return
    }
    let alive = true
    setState({ status: 'loading' })
    ;(async () => {
      if (ext === 'docx' || ext === 'doc') {
        const bytes = await readAssetBytes(card.assetUrl as string)
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToHtml({ arrayBuffer: bytes })
        const html = sanitizeHtml(result.value)
        docCache.set(card.assetUrl as string, { html })
        if (alive) setState({ status: 'ready', html })
      } else {
        const text = await readAssetText(card.assetUrl as string)
        docCache.set(card.assetUrl as string, { text })
        if (alive) setState({ status: 'ready', text })
      }
    })().catch((error) => {
      if (alive) setState({ status: 'error', message: (error as Error).message })
    })
    return () => {
      alive = false
    }
  }, [card.assetUrl, ext, loading])

  return (
    <div className="card-kind-body" data-interactive>
      {state.status === 'ready' && state.html && (
        <div className="doc-preview" dangerouslySetInnerHTML={{ __html: state.html }} />
      )}
      {state.status === 'ready' && state.text !== undefined && (
        <pre className="doc-preview" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
          {state.text}
        </pre>
      )}
      {(state.status === 'loading' || loading) && (
        <div className="file-body">
          <FileText size={22} className="file-icon-large" />
          <span className="hint-text">Reading document…</span>
        </div>
      )}
      {state.status === 'error' && (
        <div className="file-body">
          <FileText size={22} className="file-icon-large" />
          <span className="hint-text">Preview unavailable. Open the file instead.</span>
          {url && (
            <button className="btn btn-sm" onClick={() => void openAsset(card.assetUrl as string)}>
              <ExternalLink size={11} /> Open
            </button>
          )}
        </div>
      )}
      {state.status === 'idle' && !loading && !card.assetUrl && (
        <div className="file-body">
          <FileText size={22} className="file-icon-large" />
          <span className="hint-text">Document unavailable</span>
        </div>
      )}
    </div>
  )
}

export default memo(CardView)
