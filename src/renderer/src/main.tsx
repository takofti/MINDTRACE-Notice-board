import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { useBoard } from './store/board'
import { useSettings } from './store/settings'
import { useUi } from './store/ui'
import './styles/global.css'

if (import.meta.env.DEV) {
  // Test/debug handle for the browser harness and developer console.
  ;(window as unknown as Record<string, unknown>).__mindtrace = { useBoard, useSettings, useUi }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
