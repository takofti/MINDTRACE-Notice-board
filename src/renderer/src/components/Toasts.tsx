import { AlertCircle, Check, Info, X } from 'lucide-react'
import { useUi } from '@/store/ui'

export default function Toasts(): React.JSX.Element | null {
  const toasts = useUi((state) => state.toasts)
  const dismiss = useUi((state) => state.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === 'error' ? (
              <AlertCircle size={14} />
            ) : toast.kind === 'success' ? (
              <Check size={14} />
            ) : (
              <Info size={14} />
            )}
          </span>
          <span>{toast.message}</span>
          <button onClick={() => dismiss(toast.id)} title="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
