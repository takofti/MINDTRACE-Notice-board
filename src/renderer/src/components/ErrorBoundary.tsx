import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { t } from '@/i18n'

interface State {
  error: Error | null
}

/** Last line of defence: a render error must never leave a blank window. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Mindtrace UI error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="fatal-screen">
        <div className="boot-brand">
          <span className="boot-mark boot-mark-error">
            <AlertTriangle size={25} />
          </span>
          <div>
            <div className="boot-wordmark">{t("MINDTRACE")}</div>
            <div className="boot-sub">{t("The interface hit a problem")}</div>
          </div>
        </div>
        <p className="boot-error-text">{this.state.error.message}</p>
        <p className="boot-hint">
          {t("Your project is already saved on disk. Reload the interface; if the problem repeats, open the data folder and keep a copy of the project file.")}{' '}</p>
        <div className="boot-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> {t("Reload interface")}{' '}</button>
          <button
            className="btn"
            onClick={() => {
              this.setState({ error: null })
            }}
          >
            {t("Try to recover")}{' '}</button>
        </div>
      </div>
    )
  }
}
