import { AlertTriangle, X } from 'lucide-react'
import { useUi } from '@/store/ui'
import { t } from '@/i18n'

export default function ConfirmDialog(): React.JSX.Element | null {
  const dialog = useUi((state) => state.confirmDialog)
  const resolve = useUi((state) => state.resolveConfirm)
  if (!dialog) return null
  return (
    <div
      className="overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) void resolve(false)
      }}
    >
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true">
        <div className="dialog-head">
          <div>
            <h2>{dialog.title}</h2>
          </div>
          <button className="icon-btn close-btn" onClick={() => void resolve(false)} title={t("Cancel")}>
            <X size={15} />
          </button>
        </div>
        <div className="confirm-body">
          <div className={`confirm-icon ${dialog.danger ? 'is-danger' : ''}`}>
            <AlertTriangle size={17} />
          </div>
          <div style={{ whiteSpace: 'pre-line' }}>{dialog.message}</div>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={() => void resolve(false)}>
            {dialog.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => void resolve(true)}
            autoFocus
          >
            {dialog.confirmLabel ?? 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
