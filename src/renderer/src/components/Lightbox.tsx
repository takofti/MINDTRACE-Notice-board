import { X } from 'lucide-react'
import { useUi } from '@/store/ui'

export default function Lightbox(): React.JSX.Element | null {
  const lightbox = useUi((state) => state.lightbox)
  const close = useUi((state) => state.closeLightbox)
  if (!lightbox) return null
  return (
    <div className="lightbox" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <button className="icon-btn lightbox-close" onClick={close} title="Close (Esc)">
        <X size={20} />
      </button>
      <img src={lightbox.src} alt={lightbox.title} draggable={false} />
      <div className="lightbox-caption">
        {lightbox.title}
        {lightbox.caption ? <div style={{ marginTop: 4, fontSize: 11, opacity: 0.65 }}>{lightbox.caption}</div> : null}
      </div>
    </div>
  )
}
